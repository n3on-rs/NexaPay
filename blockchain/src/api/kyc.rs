use axum::{extract::State, Json, extract::Multipart, response::IntoResponse};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use crate::api::AppState;
use crate::api::auth;
use crate::api::middleware::{audit_log, check_auth_rate_limit, extract_client_ip, issue_session_token, record_auth_attempt};
use crate::crypto::{derive_user_key_encryption_key, encrypt_user_private_key, generate_keypair, sha256_hex};
use crate::services::kyc_service::KycService;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct InitPayload {
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub date_of_birth: String,
    pub cin: Option<String>,
    pub cin_number: Option<String>,
    pub cin_issue_date: Option<String>,
    pub address_line: Option<String>,
    pub delegation: Option<String>,
    pub governorate: Option<String>,
}

#[derive(Serialize)]
pub struct InitResponse { pub session_id: String }

pub async fn register_init(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<InitPayload>,
) -> impl IntoResponse {
    let ip = extract_client_ip(&headers);
    const MAX_ATTEMPTS: i32 = 5;
    const LOCKOUT_MINUTES: i32 = 15;

    if let Err(crate::api::middleware::AuthError::TooManyRequests { retry_after_seconds }) = check_auth_rate_limit(&state, &ip, "/auth/register/init", MAX_ATTEMPTS, LOCKOUT_MINUTES).await {
        return (axum::http::StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({ "error": format!("Too many attempts. Try again in {}s.", retry_after_seconds) })));
    }

    let normalized_phone = match crate::services::kyc_service::normalize_phone_digits(&payload.phone) {
        Some(p) => p,
        None => {
            record_auth_attempt(&state, &ip, "/auth/register/init", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
            return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid phone"})));
        }
    };

    // Use user-provided CIN or legacy cin field
    let cin = payload.cin_number.as_ref().or(payload.cin.as_ref()).map(|s| s.as_str()).unwrap_or("");
    let cin_issue_date_str = payload.cin_issue_date.as_deref().unwrap_or("");

    // Check for existing account by phone
    let existing_phone = sqlx::query("SELECT chain_address FROM users WHERE phone = $1 LIMIT 1")
        .bind(&normalized_phone)
        .fetch_optional(&state.pg_pool)
        .await;

    if let Ok(Some(_)) = existing_phone {
        return (axum::http::StatusCode::CONFLICT, Json(serde_json::json!({"error": "An account already exists for this phone"})));
    }

    // Check for existing account by CIN (if provided)
    if !cin.is_empty() {
        let existing_cin = sqlx::query("SELECT chain_address FROM users WHERE cin = $1 LIMIT 1")
            .bind(cin)
            .fetch_optional(&state.pg_pool)
            .await;
        if let Ok(Some(_)) = existing_cin {
            return (axum::http::StatusCode::CONFLICT, Json(serde_json::json!({"error": "An account already exists for this CIN"})));
        }
    }

    // Create KYC session as APPROVED (for DB compatibility)
    let session_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    let cin_issue_date = if cin_issue_date_str.is_empty() {
        chrono::Utc::now().date_naive()
    } else {
        match chrono::NaiveDate::parse_from_str(cin_issue_date_str, "%Y-%m-%d") {
            Ok(d) => d,
            Err(_) => chrono::Utc::now().date_naive(),
        }
    };
    let dob = match chrono::NaiveDate::parse_from_str(&payload.date_of_birth, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid date_of_birth format, expected YYYY-MM-DD"}))),
    };
    let cin_opt: Option<&str> = if cin.is_empty() { None } else { Some(cin) };
    let address_line = payload.address_line.as_deref().unwrap_or("");
    let delegation = payload.delegation.as_deref().unwrap_or("");
    let governorate = payload.governorate.as_deref().unwrap_or("");
    match sqlx::query(
        "INSERT INTO kyc_sessions (id, full_name, phone, email, cin_number, cin_expiry, date_of_birth, address_line, delegation, governorate, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED', $11, $11)")
        .bind(session_id)
        .bind(&payload.full_name)
        .bind(&normalized_phone)
        .bind(&payload.email)
        .bind(cin_opt)
        .bind(cin_issue_date)
        .bind(dob)
        .bind(if address_line.is_empty() { None } else { Some(address_line) })
        .bind(if delegation.is_empty() { None } else { Some(delegation) })
        .bind(if governorate.is_empty() { None } else { Some(governorate) })
        .bind(now)
        .execute(&state.pg_pool)
        .await
    {
        Ok(_) => {}
        Err(e) => {
            eprintln!("[register_init] INSERT failed: {}", e);
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Failed to create registration session"})));
        }
    }

    // Generate OTP for phone verification
    let otp = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
    let otp_hash = sha256_hex(otp.as_bytes());
    let otp_expires = chrono::Utc::now() + chrono::Duration::minutes(5);
    let _ = sqlx::query("UPDATE kyc_sessions SET otp_code_hash=$1, otp_expires_at=$2 WHERE id=$3")
        .bind(&otp_hash)
        .bind(otp_expires)
        .bind(session_id)
        .execute(&state.pg_pool)
        .await;

    // Try send OTP via Twilio
    if let (Ok(sid), Ok(token), Ok(from)) = (
        std::env::var("TWILIO_ACCOUNT_SID"),
        std::env::var("TWILIO_AUTH_TOKEN"),
        std::env::var("TWILIO_FROM"),
    ) {
        let client = reqwest::Client::new();
        let body = format!("Your NexaPay registration code: {}", otp);
        let _ = client.post(&format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", sid))
            .basic_auth(sid.clone(), Some(token))
            .form(&[("To", &normalized_phone), ("From", &from), ("Body", &body)])
            .send()
            .await;
    }

    let phone_hint = auth::mask_phone_hint(&normalized_phone);
    let mut dev_otp: Option<String> = None;
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
    if app_env == "development" || dev_show == "true" {
        dev_otp = Some(otp.clone());
        println!("[dev] registration OTP for {} is {}", normalized_phone, otp);
    }

    // Provision account immediately
    match auth::provision_kyc_session_if_needed(&state, &session_id.to_string()).await {
        Ok(summary) => {
            let session_uuid = Uuid::new_v4();
            let session_id_str = session_uuid.to_string();
            let cin_hash = sha256_hex(cin.as_bytes());
            let token = match issue_session_token(&state, &summary.address, &cin_hash, &session_id_str) {
                Ok(t) => t,
                Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Token creation failed"}))),
            };
            let token_hash = sha256_hex(token.as_bytes());
            let _ = sqlx::query(
                "INSERT INTO user_sessions (id, user_address, token_hash) VALUES ($1, $2, $3)")
                .bind(session_uuid)
                .bind(&summary.address)
                .bind(&token_hash)
                .execute(&state.pg_pool)
                .await;

            record_auth_attempt(&state, &ip, "/auth/register/init", true, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
            audit_log(&state, Some(&summary.address), "register_init", "user", None, &ip, headers.get("user-agent").and_then(|v| v.to_str().ok()), "success", serde_json::json!({"phone": &normalized_phone})).await;
            (axum::http::StatusCode::OK, Json(serde_json::json!({
                "address": summary.address,
                "rib": summary.rib,
                "iban": summary.iban,
                "card_last4": summary.card_last4,
                "card_expiry": summary.card_expiry,
                "card_type": summary.card_type,
                "token": token,
                "session_id": session_id.to_string(),
                "phone_hint": phone_hint,
                "dev_otp": dev_otp,
            })))
        }
        Err((sc, j)) => (sc, j),
    }
}

#[derive(Deserialize)]
pub struct ResendOtpRequest { pub session_id: String }

pub async fn resend_otp(State(state): State<AppState>, Json(payload): Json<ResendOtpRequest>) -> impl IntoResponse {
    let sid = match Uuid::parse_str(&payload.session_id) {
        Ok(s) => s,
        Err(_) => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid session_id"}))),
    };

    let row = sqlx::query("SELECT phone FROM kyc_sessions WHERE id = $1")
        .bind(sid)
        .fetch_optional(&state.pg_pool)
        .await;

    let phone = match row {
        Ok(Some(r)) => r.try_get::<String, _>("phone").unwrap_or_default(),
        _ => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Session not found"}))),
    };

    let otp = match std::env::var("KYC_DEV_OTP") {
        Ok(s) if s.chars().all(|c| c.is_ascii_digit()) && s.len() == 6 => s,
        _ => format!("{:06}", rand::thread_rng().gen_range(0..1_000_000)),
    };
    let otp_hash = sha256_hex(otp.as_bytes());
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    let _ = sqlx::query("UPDATE kyc_sessions SET otp_code_hash=$1, otp_expires_at=$2 WHERE id=$3")
        .bind(&otp_hash)
        .bind(expires_at)
        .bind(sid)
        .execute(&state.pg_pool)
        .await;

    // Try send via Twilio
    if let (Ok(sid), Ok(token), Ok(from)) = (
        std::env::var("TWILIO_ACCOUNT_SID"),
        std::env::var("TWILIO_AUTH_TOKEN"),
        std::env::var("TWILIO_FROM"),
    ) {
        let client = reqwest::Client::new();
        let body = format!("Your NexaPay verification code: {}", otp);
        let _ = client.post(&format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", sid))
            .basic_auth(sid.clone(), Some(token))
            .form(&[("To", &phone), ("From", &from), ("Body", &body)])
            .send()
            .await;
    }

    (axum::http::StatusCode::OK, Json(serde_json::json!({"success": true})))
}

#[derive(Deserialize)]
pub struct VerifyPayload { pub session_id: String, pub otp_code: String }

pub async fn verify_phone(State(state): State<AppState>, Json(payload): Json<VerifyPayload>) -> impl IntoResponse {
    let ksvc = KycService::new(state.pg_pool.clone());
    match ksvc.verify_phone(&payload.session_id, &payload.otp_code).await {
        Ok(()) => {
            match auth::provision_kyc_session_if_needed(&state, &payload.session_id).await {
                Ok(summary) => (
                    axum::http::StatusCode::OK,
                    Json(serde_json::json!({
                        "session_id": payload.session_id,
                        "next_step": "set_pin",
                        "status": "APPROVED",
                        "address": summary.address,
                        "rib": summary.rib,
                        "iban": summary.iban,
                        "card_last4": summary.card_last4,
                        "card_expiry": summary.card_expiry,
                        "card_type": summary.card_type,
                    })),
                ),
                Err((sc, j)) => (sc, j),
            }
        }
        Err(_) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"INVALID_OTP"})))
    }
}

#[derive(Deserialize)]
pub struct VerifyRegOtpPayload { pub session_id: String, pub otp_code: String }

pub async fn verify_registration_otp(State(state): State<AppState>, Json(payload): Json<VerifyRegOtpPayload>) -> impl IntoResponse {
    let sid = match Uuid::parse_str(&payload.session_id) {
        Ok(s) => s,
        Err(_) => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid session_id"}))),
    };

    let row = sqlx::query("SELECT otp_code_hash, otp_expires_at FROM kyc_sessions WHERE id = $1")
        .bind(sid)
        .fetch_optional(&state.pg_pool)
        .await;

    let (stored_hash, expires_at) = match row {
        Ok(Some(r)) => {
            let h: Option<String> = r.try_get("otp_code_hash").ok();
            let e: Option<chrono::DateTime<chrono::Utc>> = r.try_get("otp_expires_at").ok();
            match (h, e) {
                (Some(h), Some(e)) => (h, e),
                _ => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "OTP not found"}))),
            }
        }
        _ => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Session not found"}))),
    };

    if chrono::Utc::now() > expires_at {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "OTP expired"})));
    }

    let provided_hash = sha256_hex(payload.otp_code.as_bytes());
    if provided_hash != stored_hash {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid OTP"})));
    }

    // Clear OTP and mark phone as verified
    let _ = sqlx::query("UPDATE kyc_sessions SET otp_code_hash = NULL, otp_expires_at = NULL, status = 'APPROVED' WHERE id = $1")
        .bind(sid)
        .execute(&state.pg_pool)
        .await;

    (axum::http::StatusCode::OK, Json(serde_json::json!({"success": true})))
}

pub async fn upload_documents(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    // No-op: skip document upload, auto-return success
    let mut session_id = None;
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name == "session_id" { session_id = Some(field.text().await.unwrap_or_default()); }
    }
    let session_id = match session_id { Some(s) => s, None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"missing session_id"}))) };
    match auth::provision_kyc_session_if_needed(&state, &session_id).await {
        Ok(summary) => (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({
                "session_id": session_id,
                "next_step": "set_pin",
                "status": "APPROVED",
                "address": summary.address,
                "rib": summary.rib,
                "iban": summary.iban,
                "card_last4": summary.card_last4,
                "card_expiry": summary.card_expiry,
                "card_type": summary.card_type,
            })),
        ),
        Err((sc, j)) => (sc, j),
    }
}

pub async fn liveness(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    // No-op: skip liveness check, auto-return approved
    let mut session_id = None;
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name == "session_id" { session_id = Some(field.text().await.unwrap_or_default()); }
    }
    let session_id = match session_id {
        Some(s) => s,
        None => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error":"missing session_id"})),
            )
                .into_response();
        }
    };

    match auth::provision_kyc_session_if_needed(&state, &session_id).await {
        Ok(summary) => (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({
                "session_id": session_id,
                "status": "APPROVED",
                "next_step": "set_pin",
                "address": summary.address,
                "rib": summary.rib,
                "iban": summary.iban,
                "card_last4": summary.card_last4,
                "card_expiry": summary.card_expiry,
                "card_type": summary.card_type,
            })),
        ).into_response(),
        Err((sc, j)) => (sc, j).into_response(),
    }
}

#[derive(Deserialize)]
pub struct RegisterSetPinRequest {
    pub address: String,
    pub pin: String,
    pub pin_confirm: String,
}

pub async fn register_set_pin(
    State(state): State<AppState>,
    Json(payload): Json<RegisterSetPinRequest>,
) -> impl IntoResponse {
    if payload.pin.len() != 6 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "PIN must be exactly 6 digits"})),
        );
    }
    if payload.pin != payload.pin_confirm {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "PINs do not match"})),
        );
    }

    // Look up user by address to get phone and cin
    let row = sqlx::query(
        "SELECT chain_address, phone, cin FROM users WHERE chain_address = $1 LIMIT 1",
    )
    .bind(&payload.address)
    .fetch_optional(&state.pg_pool)
    .await;

    let (address, phone, cin) = match row {
        Ok(Some(r)) => {
            let addr: String = r.try_get("chain_address").unwrap_or_default();
            let phone: String = r.try_get("phone").unwrap_or_default();
            let cin: String = r.try_get("cin").unwrap_or_default();
            (addr, phone, cin)
        }
        Ok(None) => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid account"}))),
        Err(e) => {
            eprintln!("[set-pin] DB error: {:?}", e);
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Database error"})));
        }
    };

    let pin_hash = crate::crypto::hash_transaction_pin(&address, &payload.pin, &state.encryption_key);

    // ─── Generate user Ed25519 keypair for transaction signing ───
    let (user_sk, user_pk) = generate_keypair();
    let enc_key = match derive_user_key_encryption_key(&address, &payload.pin, &state.encryption_key) {
        Ok(k) => k,
        Err(_) => {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Key derivation failed"})));
        }
    };
    let encrypted_sk = match encrypt_user_private_key(&user_sk, &enc_key) {
        Ok(enc) => enc,
        Err(_) => {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Key encryption failed"})));
        }
    };

    // Store pin_hash + encrypted user private key in cards
    let res = sqlx::query(
        "UPDATE cards SET pin_hash = $1, encrypted_user_sk = $2, pin_attempts = 0, pin_locked_until = NULL WHERE chain_address = $3",
    )
    .bind(&pin_hash)
    .bind(&encrypted_sk)
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    if let Err(_) = res {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Failed to set PIN"})));
    }

    // Update public_key on the chain account and in users table
    {
        let mut chain = state.chain.lock().await;
        if let Some(acc) = chain.accounts.get_mut(&address) {
            acc.public_key = user_pk.clone();
        }
    }
    let _ = sqlx::query(
        "UPDATE users SET public_key = $1 WHERE chain_address = $2",
    )
    .bind(&user_pk)
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    // Mark KYC as unverified so user can access dashboard
    let _ = sqlx::query("UPDATE users SET kyc_status = 'verified' WHERE chain_address = $1")
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

    // Generate session token
    let session_uuid = Uuid::new_v4();
    let session_id_str = session_uuid.to_string();
    let token = match issue_session_token(&state, &address, &sha256_hex(cin.as_bytes()), &session_id_str) {
        Ok(t) => t,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Token creation failed"}))),
    };
    let token_hash = sha256_hex(token.as_bytes());
    let _ = sqlx::query(
        "INSERT INTO user_sessions (id, user_address, token_hash) VALUES ($1, $2, $3)")
        .bind(session_uuid)
        .bind(&address)
        .bind(&token_hash)
        .execute(&state.pg_pool)
        .await;

    // Send welcome SMS with PIN
    let support_phone = std::env::var("SUPPORT_PHONE").unwrap_or_else(|_| "+21670000000".to_string());
    let welcome_body = format!(
        "Welcome to NexaPay! Your account has been created with phone {}. Your PIN code is: {}. Don't miss it! If you think this was a mistake, please call {}.",
        phone, payload.pin, support_phone
    );
    let _ = auth::send_twilio_sms(&state, &phone, &welcome_body).await;

    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "address": address,
            "token": token,
        })),
    )
}
