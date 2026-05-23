use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::account::{AccountType, ChainAccount};
use crate::api::middleware::{
    api_principal_kind, api_principal_prefix, audit_log, check_auth_rate_limit, extract_account_token,
    extract_client_ip, issue_session_token, log_api_call, record_auth_attempt, try_api_key,
    verify_session_token, verify_session_with_revocation_check,
    AuthError,
};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::crypto::{
    address_from_public_key, encrypt_aes256_gcm, generate_keypair, hash_transaction_pin,
    registration_digest, sha256_hex, verify_transaction_pin, sign_hex,
    derive_user_key_encryption_key, encrypt_user_private_key,
};
use crate::generator::{
    format_card_display, generate_account_number, generate_card_number, generate_cvv, generate_expiry,
    generate_iban, generate_rib,
};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub full_name: String,
    /// Deprecated for API clients: omit or empty; [`RegisterRequest::phone`] is the account login id (stored in legacy DB column `cin`).
    #[allow(dead_code)]
    #[serde(default)]
    pub cin: String,
    pub date_of_birth: String,
    pub phone: String,
    pub email: Option<String>,
    pub address_line: Option<String>,
    pub city: Option<String>,
    pub governorate: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    success: bool,
    chain_address: String,
    account: AccountResponse,
    card: CardResponse,
    #[serde(skip_serializing)]
    private_key: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dev_otp: Option<String>,
    fallback_available: bool,
}

#[derive(Debug, Serialize)]
pub struct AccountResponse {
    account_number: String,
    rib: String,
    iban: String,
    bic: String,
    currency: String,
}

#[derive(Debug, Serialize)]
pub struct CardResponse {
    card_number: String,
    card_holder: String,
    expiry: String,
    #[serde(skip_serializing)]
    cvv: String,
    #[serde(rename = "type")]
    card_type: String,
}

#[derive(Debug, Deserialize)]
pub struct PinLoginRequest {
    /// Phone used at registration (`216…` or 8-digit local Tunisian number).
    pub phone: String,
    pub pin: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyLoginOtpRequest {
    pub phone: String,
    pub otp_code: String,
}

#[derive(Debug, Serialize)]
pub struct PinLoginStep1Response {
    step: String,
    phone_hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dev_otp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    token: String,
    address: String,
    full_name: String,
    chain_address: String,
}

// ─── Self-serve registration (direct, no KYC sessions) ───

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct RegisterInitPayload {
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub date_of_birth: String,
    #[serde(default)]
    pub cin: String,
    pub cin_number: Option<String>,
    pub cin_issue_date: Option<String>,
    pub address_line: Option<String>,
    pub delegation: Option<String>,
    pub governorate: Option<String>,
}

pub async fn register_init(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterInitPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let ip = extract_client_ip(&headers);

    if let Err(e) = check_auth_rate_limit(&state, &ip, "/auth/register/init", 5, 15).await {
        return Err(match e {
            AuthError::TooManyRequests { retry_after_seconds } =>
                api_error(StatusCode::TOO_MANY_REQUESTS, &format!("Too many attempts. Try again in {}s.", retry_after_seconds)),
            _ => api_error(StatusCode::INTERNAL_SERVER_ERROR, "Rate limit error"),
        });
    }

    let normalized_phone = normalize_phone(&payload.phone)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Invalid phone number"))?;

    // Check duplicate phone
    let existing = sqlx::query("SELECT chain_address FROM users WHERE phone = $1 LIMIT 1")
        .bind(&normalized_phone)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    if existing.is_some() {
        record_auth_attempt(&state, &ip, "/auth/register/init", false, 5, 15).await;
        return Err(api_error(StatusCode::CONFLICT, "An account already exists for this phone"));
    }

    // Check duplicate CIN if provided
    let cin = payload.cin_number.as_deref().unwrap_or("");
    if !cin.is_empty() {
        let existing_cin = sqlx::query("SELECT chain_address FROM users WHERE cin = $1 LIMIT 1")
            .bind(cin)
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
        if existing_cin.is_some() {
            record_auth_attempt(&state, &ip, "/auth/register/init", false, 5, 15).await;
            return Err(api_error(StatusCode::CONFLICT, "An account already exists for this CIN"));
        }
    }

    let dob = if payload.date_of_birth.is_empty() {
        chrono::Utc::now().date_naive()
    } else {
        chrono::NaiveDate::parse_from_str(&payload.date_of_birth, "%Y-%m-%d")
            .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid date_of_birth format. Expected YYYY-MM-DD"))?
    };
    let dob_str = dob.format("%Y-%m-%d").to_string();

    let full_name = if payload.full_name.trim().is_empty() { "User".to_string() } else { payload.full_name.trim().to_string() };
    let login_id = if !cin.is_empty() { cin.to_string() } else { normalized_phone.clone() };
    let registration_commitment = registration_digest(&login_id, &full_name, &dob_str);

    let (private_key, public_key) = generate_keypair();
    let _ = private_key;
    let chain_address = address_from_public_key(&public_key);
    let holder_name = full_name.to_uppercase();

    let card_number = generate_card_number("99");
    let (expiry_month, expiry_year) = generate_expiry();
    let cvv = generate_cvv(&card_number, &expiry_month, &expiry_year, &state.encryption_key);
    let encrypted_card = encrypt_aes256_gcm(&state.encryption_key, &card_number)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Card encryption failed"))?;
    let encrypted_cvv = encrypt_aes256_gcm(&state.encryption_key, &cvv)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "CVV encryption failed"))?;

    let account_number = generate_account_number();
    let (rib, _) = generate_rib("99", "000");
    let iban = generate_iban(&rib);
    let card_last4 = card_number.chars().rev().take(4).collect::<String>().chars().rev().collect::<String>();

    let cin_opt: Option<&str> = if cin.is_empty() { Some(&normalized_phone) } else { Some(cin) };
    let address_line = payload.address_line.as_deref().unwrap_or("");
    let delegation = payload.delegation.as_deref().unwrap_or("");
    let governorate = payload.governorate.as_deref().unwrap_or("");
    let cin_issue_date = payload.cin_issue_date.as_deref().unwrap_or("");

    sqlx::query(
        "INSERT INTO users (chain_address, full_name, cin, date_of_birth, phone, email, address_line, delegation, governorate, cin_issue_date, kyc_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'verified')",
    )
    .bind(&chain_address).bind(&full_name).bind(cin_opt).bind(dob).bind(&normalized_phone)
    .bind(&payload.email)
    .bind(if address_line.is_empty() { None } else { Some(address_line) })
    .bind(if delegation.is_empty() { None } else { Some(delegation) })
    .bind(if governorate.is_empty() { None } else { Some(governorate) })
    .bind(if cin_issue_date.is_empty() { None } else { Some(cin_issue_date) })
    .execute(&state.pg_pool).await
    .map_err(|e| { tracing::error!("User creation failed: {e}"); api_error(StatusCode::BAD_REQUEST, "User creation failed") })?;

    sqlx::query("INSERT INTO cards (chain_address, card_number, card_holder_name, expiry_month, expiry_year, cvv, card_last4) VALUES ($1, $2, $3, $4, $5, $6, $7)")
        .bind(&chain_address).bind(&encrypted_card).bind(&holder_name).bind(&expiry_month).bind(&expiry_year).bind(&encrypted_cvv).bind(&card_last4)
        .execute(&state.pg_pool).await
        .map_err(|e| { tracing::error!("Card creation failed: {e}"); api_error(StatusCode::BAD_REQUEST, "Card creation failed") })?;

    sqlx::query("INSERT INTO bank_accounts (chain_address, account_number, rib, iban, bic, currency) VALUES ($1, $2, $3, $4, 'NXPYTNTT', 'TND')")
        .bind(&chain_address).bind(&account_number).bind(&rib).bind(&iban)
        .execute(&state.pg_pool).await
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Bank account creation failed: {e}")))?;

    let mined_block_index: u64;
    let account_create_tx: Transaction;
    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: chain_address.clone(), public_key: public_key.clone(),
            balance: 150_000, tx_count: 0, account_type: AccountType::User,
            created_at: now_ts(), is_active: true, kyc_hash: registration_commitment,
        });
        let tx = Transaction {
            id: Uuid::new_v4().to_string(), tx_type: TxType::AccountCreate,
            from: "SYSTEM".to_string(), to: chain_address.clone(), amount: 150_000, fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &chain_address).unwrap_or_default(),
            memo: "Account created".to_string(),
            hash: sha256_hex(format!("{}{}", chain_address, now_ts()).as_bytes()),
        };
        account_create_tx = tx.clone();
        chain.add_pending_transaction(tx);
        if let Ok(block) = chain.mine_block(&state.validator_address, &state.validator_private_key, &state.validator_public_key) {
            mined_block_index = block.index;
        } else { mined_block_index = 0; }
        if let Some(account) = chain.get_account(&chain_address) {
            let _ = state.sqlite_state.upsert_account(&account.address, account.balance, account.tx_count, &account.account_type, account.is_active, now_ts());
        }
    }
    let _ = state.sqlite_state.record_transaction(&account_create_tx, mined_block_index);
    let _ = state.sqlite_state.upsert_card_ref(&chain_address, &card_last4, &expiry_month, &expiry_year, now_ts());

    let session_uuid = Uuid::new_v4();
    let cin_hash = sha256_hex(cin.as_bytes());
    let token = issue_session_token(&state, &chain_address, &cin_hash, &session_uuid.to_string())
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Token creation failed"))?;
    let token_hash = sha256_hex(token.as_bytes());
    let _ = sqlx::query("INSERT INTO user_sessions (id, user_address, token_hash) VALUES ($1, $2, $3)")
        .bind(session_uuid).bind(&chain_address).bind(&token_hash)
        .execute(&state.pg_pool).await;

    record_auth_attempt(&state, &ip, "/auth/register/init", true, 5, 15).await;
    audit_log(&state, Some(&chain_address), "register_init", "user", None, &ip, headers.get("user-agent").and_then(|v| v.to_str().ok()), "success", serde_json::json!({"phone": &normalized_phone})).await;

    Ok(Json(serde_json::json!({
        "address": chain_address,
        "rib": rib,
        "iban": iban,
        "card_last4": card_last4,
        "card_expiry": format!("{}/{}", expiry_month, &expiry_year[expiry_year.len().saturating_sub(2)..]),
        "card_type": "VISA",
        "token": token,
    })))
}

#[derive(Debug, Deserialize)]
pub struct RegisterSetPinRequest {
    pub address: String,
    pub pin: String,
    pub pin_confirm: String,
}

pub async fn register_set_pin(
    State(state): State<AppState>,
    Json(payload): Json<RegisterSetPinRequest>,
) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    if payload.pin.len() != 6 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits"));
    }
    if payload.pin != payload.pin_confirm {
        return Err(api_error(StatusCode::BAD_REQUEST, "PINs do not match"));
    }

    let row = sqlx::query("SELECT chain_address, phone, cin FROM users WHERE chain_address = $1 LIMIT 1")
        .bind(&payload.address).fetch_optional(&state.pg_pool).await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let (address, phone, cin) = match row {
        Some(r) => (r.try_get::<String,_>("chain_address").unwrap_or_default(), r.try_get::<String,_>("phone").unwrap_or_default(), r.try_get::<String,_>("cin").unwrap_or_default()),
        None => return Err(api_error(StatusCode::BAD_REQUEST, "Invalid account")),
    };

    let pin_salt = crate::crypto::generate_pin_salt();
    let pin_hash = hash_transaction_pin(&address, &payload.pin, &state.encryption_key, Some(&pin_salt));
    let (user_sk, user_pk) = generate_keypair();
    let enc_key = derive_user_key_encryption_key(&address, &payload.pin, &state.encryption_key, Some(&pin_salt))
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Key derivation failed"))?;
    let encrypted_sk = encrypt_user_private_key(&user_sk, &enc_key)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Key encryption failed"))?;

    sqlx::query("UPDATE cards SET pin_hash = $1, encrypted_user_sk = $2, pin_salt = $3, pin_attempts = 0, pin_locked_until = NULL WHERE chain_address = $4")
        .bind(&pin_hash).bind(&encrypted_sk).bind(&pin_salt).bind(&address).execute(&state.pg_pool).await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to set PIN"))?;

    {
        let mut chain = state.chain.lock().await;
        if let Some(acc) = chain.accounts.get_mut(&address) { acc.public_key = user_pk.clone(); }
    }
    let _ = sqlx::query("UPDATE users SET public_key = $1, kyc_status = 'verified' WHERE chain_address = $2")
        .bind(&user_pk).bind(&address).execute(&state.pg_pool).await;

    let session_uuid = Uuid::new_v4();
    let token = issue_session_token(&state, &address, &sha256_hex(cin.as_bytes()), &session_uuid.to_string())
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Token creation failed"))?;
    let token_hash = sha256_hex(token.as_bytes());
    let _ = sqlx::query("INSERT INTO user_sessions (id, user_address, token_hash) VALUES ($1, $2, $3)")
        .bind(session_uuid).bind(&address).bind(&token_hash).execute(&state.pg_pool).await;

    send_sms(&state, &phone, "Welcome to NexaPay! Your account has been created. PIN is set.").await;

    let mut headers = HeaderMap::new();
    let cookie = format!(
        "nexapay_session={}; Domain={}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400",
        token, state.cookie_domain
    );
    headers.insert(http::header::SET_COOKIE, cookie.parse().unwrap());

    Ok((headers, Json(serde_json::json!({ "success": true, "address": address, "token": token }))))
}

// ─── Logout ───

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    let token = crate::api::middleware::extract_account_token(&headers);
    if let Some(t) = token {
        if let Ok(claims) = crate::api::middleware::verify_session_token(&state, &t) {
            if !claims.session_id.is_empty() {
                if let Ok(u) = Uuid::parse_str(&claims.session_id) {
                    let _ = sqlx::query(
                        "UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1 AND user_address = $2",
                    )
                    .bind(u)
                    .bind(&claims.address)
                    .execute(&state.pg_pool)
                    .await;
                }
            }
        }
    }

    let mut resp_headers = HeaderMap::new();
    let cookie = format!(
        "nexapay_session=; Domain={}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        state.cookie_domain
    );
    resp_headers.insert(http::header::SET_COOKIE, cookie.parse().unwrap());

    Ok((resp_headers, Json(serde_json::json!({"success": true}))))
}

#[derive(Debug, Deserialize)]
pub struct VerifyIdentityRequest {
    pub phone: String,
    pub cin_number: String,
    pub date_of_birth: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyIdentityResponse {
    pub step: String,
    pub phone_hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_otp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyRecoveryOtpRequest {
    pub phone: String,
    pub otp_code: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyRecoveryOtpResponse {
    pub recovery_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPinRequest {
    pub recovery_token: String,
    pub new_pin: String,
    pub pin_confirm: String,
}

#[derive(Debug, Serialize)]
pub struct ResetPinResponse {
    pub success: bool,
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, (StatusCode, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| api_error(auth_status_code(e), "Invalid API key"))?;

    let response = run_registration(&state, principal.as_ref(), payload).await?;
    log_api_call(
        &state,
        principal.as_ref(),
        "/auth/register",
        "POST",
        200,
    )
    .await;
    Ok(Json(response))
}

async fn run_registration(
    state: &AppState,
    principal: Option<&crate::api::middleware::ApiPrincipal>,
    payload: RegisterRequest,
) -> Result<RegisterResponse, (StatusCode, Json<Value>)> {
    // normalize and validate phone (accept 8-digit local or full 216...)
    let normalized_phone = normalize_phone(&payload.phone)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Phone must be 8 digits or start with 216"))?;
    // Single account key (stored in legacy `cin` column for DB compatibility): normalized phone.
    let login_id = normalized_phone.clone();

    let dob = chrono::NaiveDate::parse_from_str(&payload.date_of_birth, "%Y-%m-%d")
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid date_of_birth format"))?;

    let (private_key, public_key) = generate_keypair();
    let chain_address = address_from_public_key(&public_key);
    let holder_name = payload.full_name.to_uppercase();

    let registration_commitment =
        registration_digest(&login_id, &payload.full_name, &payload.date_of_birth);

    let card_number = generate_card_number("99");
    let (expiry_month, expiry_year) = generate_expiry();
    let cvv = generate_cvv(
        &card_number,
        &expiry_month,
        &expiry_year,
        &state.encryption_key,
    );
    let encrypted_card = encrypt_aes256_gcm(&state.encryption_key, &card_number)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Card encryption failed"))?;
    let encrypted_cvv = encrypt_aes256_gcm(&state.encryption_key, &cvv)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "CVV encryption failed"))?;

    let account_number = generate_account_number();
    let (rib, _) = generate_rib("99", "000");
    let iban = generate_iban(&rib);
    let card_last4 = card_number
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    let created_by_api_key_prefix = principal.map(api_principal_prefix);
    let created_by_principal_type = principal.map(|p| api_principal_kind(p).to_string());

    // KYC removed — use phone as the cin value for DB compatibility.
    let cin_value = Some(normalized_phone.clone());

    sqlx::query(
        "INSERT INTO users (chain_address, full_name, cin, date_of_birth, phone, email, address_line, city, governorate, created_by_api_key_prefix, created_by_principal_type, kyc_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'verified')",
    )
    .bind(&chain_address)
    .bind(&payload.full_name)
    .bind(&cin_value)
    .bind(dob)
    .bind(&normalized_phone)
    .bind(&payload.email)
    .bind(&payload.address_line)
    .bind(&payload.city)
    .bind(&payload.governorate)
    .bind(&created_by_api_key_prefix)
    .bind(&created_by_principal_type)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| { tracing::error!("User creation failed: {e}"); api_error(StatusCode::BAD_REQUEST, "User creation failed") })?;

    sqlx::query(
        "INSERT INTO cards (chain_address, card_number, card_holder_name, expiry_month, expiry_year, cvv, card_last4)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&chain_address)
    .bind(&encrypted_card)
    .bind(&holder_name)
    .bind(&expiry_month)
    .bind(&expiry_year)
    .bind(&encrypted_cvv)
    .bind(&card_last4)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| { tracing::error!("Card creation failed: {e}"); api_error(StatusCode::BAD_REQUEST, "Card creation failed") })?;

    sqlx::query(
        "INSERT INTO bank_accounts (chain_address, account_number, rib, iban, bic, currency)
         VALUES ($1, $2, $3, $4, 'NXPYTNTT', 'TND')",
    )
    .bind(&chain_address)
    .bind(&account_number)
    .bind(&rib)
    .bind(&iban)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Bank account creation failed: {e}")))?;

    let mut mined_block_index = 0u64;
    let account_create_tx: Transaction;
    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: chain_address.clone(),
            public_key: public_key.clone(),
            balance: 150_000,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: registration_commitment,
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::AccountCreate,
            from: "SYSTEM".to_string(),
            to: chain_address.clone(),
            amount: 150_000,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &chain_address)
                .unwrap_or_else(|_| String::new()),
            memo: "Account created".to_string(),
            hash: sha256_hex(format!("{}{}", chain_address, now_ts()).as_bytes()),
        };
        account_create_tx = tx.clone();
        chain.add_pending_transaction(tx);
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            mined_block_index = block.index;
        }

        if let Some(account) = chain.get_account(&chain_address) {
            let _ = state.sqlite_state.upsert_account(
                &account.address,
                account.balance,
                account.tx_count,
                &account.account_type,
                account.is_active,
                now_ts(),
            );
        }
    }

    let _ = state
        .sqlite_state
        .record_transaction(&account_create_tx, mined_block_index);
    let _ = state.sqlite_state.upsert_card_ref(
        &chain_address,
        &card_last4,
        &expiry_month,
        &expiry_year,
        now_ts(),
    );

    // Generate and send an OTP for phone verification during registration.
    let otp = generate_otp_code();
    let otp_hash = hash_otp(&login_id, &otp, &state.encryption_key);

    let _ = sqlx::query(
        "UPDATE users
         SET otp_code_hash = $1,
             otp_expires_at = NOW() + INTERVAL '5 minutes',
             otp_attempts = 0
         WHERE phone = $2",
    )
    .bind(&otp_hash)
    .bind(&normalized_phone)
    .execute(&state.pg_pool)
    .await;

    send_otp_sms(&state, &normalized_phone, &otp).await;
    let mut dev_otp: Option<String> = None;
    {
        let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
        if (state.env == "development" || state.env == "sandbox") && dev_show == "true" {
            dev_otp = Some(otp.clone());
        }
    }

    Ok(RegisterResponse {
        success: true,
        chain_address,
        account: AccountResponse {
            account_number,
            rib,
            iban,
            bic: "NXPYTNTT".to_string(),
            currency: "TND".to_string(),
        },
        card: CardResponse {
            card_number: format_card_display(&card_number),
            card_holder: holder_name,
            expiry: format!("{}/{}", expiry_month, &expiry_year[2..]),
            cvv,
            card_type: "VISA".to_string(),
        },
        private_key,
        message: "Keep your private key safe. It will never be shown again.".to_string(),
        phone_hint: Some(mask_phone(&normalized_phone)),
        dev_otp,
        fallback_available: false,
    })
}

/// Shared PIN verification with lockout logic.
/// Returns Ok(()) on success, Err((status, json)) on failure.
/// On wrong PIN: increments pin_attempts, locks if >= 5.
/// On correct PIN: resets pin_attempts.
pub(crate) async fn verify_pin(
    state: &AppState,
    chain_address: &str,
    provided_pin: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    // Dev master PIN bypass — only active in non-production environments
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    if app_env == "development" || app_env == "sandbox" {
        let dev_master = std::env::var("DEV_MASTER_PIN").unwrap_or_default();
        if !dev_master.is_empty() && provided_pin == dev_master {
            return Ok(());
        }
    }

    let row = sqlx::query(
        "SELECT pin_hash, pin_attempts, pin_locked_until FROM cards WHERE chain_address = $1 LIMIT 1",
    )
    .bind(chain_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Account not found")),
    };

    let pin_locked_until: Option<chrono::DateTime<chrono::Utc>> = row.try_get("pin_locked_until").ok();
    if let Some(lock) = pin_locked_until {
        if lock > Utc::now() {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({
                    "error": "PIN_LOCKED",
                    "locked_until": lock.to_rfc3339(),
                    "message": "Too many attempts. Try again later."
                })),
            ));
        }
    }

    let stored_hash: Option<String> = row.try_get("pin_hash").ok();
    let stored_hash = match stored_hash {
        Some(v) if !v.trim().is_empty() => v,
        _ => return Err(api_error(StatusCode::BAD_REQUEST, "PIN not set for this account")),
    };

    let (pin_valid, _pin_upgrade) = verify_transaction_pin(chain_address, provided_pin, &state.encryption_key, &stored_hash);
    if !pin_valid {
        let attempts: i32 = row.try_get("pin_attempts").unwrap_or(0);
        let new_attempts = attempts + 1;
        if new_attempts >= 5 {
            let lock_until = Utc::now() + chrono::Duration::minutes(15);
            let _ = sqlx::query(
                "UPDATE cards SET pin_attempts = 0, pin_locked_until = $1 WHERE chain_address = $2",
            )
            .bind(lock_until)
            .bind(chain_address)
            .execute(&state.pg_pool)
            .await;
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({
                    "error": "PIN_LOCKED",
                    "locked_until": lock_until.to_rfc3339(),
                    "message": "Too many attempts. Try again later."
                })),
            ));
        } else {
            let _ = sqlx::query(
                "UPDATE cards SET pin_attempts = $1 WHERE chain_address = $2",
            )
            .bind(new_attempts)
            .bind(chain_address)
            .execute(&state.pg_pool)
            .await;
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "WRONG_PIN",
                    "attempts_remaining": 5 - new_attempts,
                })),
            ));
        }
    }

    // Correct PIN — reset attempts
    let _ = sqlx::query(
        "UPDATE cards SET pin_attempts = 0, pin_locked_until = NULL WHERE chain_address = $1",
    )
    .bind(chain_address)
    .execute(&state.pg_pool)
    .await;

    Ok(())
}

/// Step 1 of login: verify PIN, then send OTP via SMS.
pub async fn login_with_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PinLoginRequest>,
) -> Result<Json<PinLoginStep1Response>, (StatusCode, Json<Value>)> {
    let ip = extract_client_ip(&headers);
    const MAX_ATTEMPTS: i32 = 5;
    const LOCKOUT_MINUTES: i32 = 15;

    if let Err(AuthError::TooManyRequests { retry_after_seconds }) = check_auth_rate_limit(&state, &ip, "/auth/login", MAX_ATTEMPTS, LOCKOUT_MINUTES).await {
        return Err((StatusCode::TOO_MANY_REQUESTS, Json(json!({ "error": format!("Too many attempts. Try again in {}s.", retry_after_seconds) }))));
    }

    if payload.phone.trim().is_empty() || payload.pin.trim().is_empty() {
        record_auth_attempt(&state, &ip, "/auth/login", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
        return Err(api_error(StatusCode::BAD_REQUEST, "Phone and PIN are required"));
    }
    if payload.pin.len() != 6 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        record_auth_attempt(&state, &ip, "/auth/login", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits"));
    }

    let (n11, n8) = match login_phone_variants(&payload.phone) {
        Some(v) => v,
        None => {
            record_auth_attempt(&state, &ip, "/auth/login", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
            return Err(api_error(StatusCode::BAD_REQUEST, "Invalid phone (8 digits or +216 / 216 prefix)"));
        }
    };

    let row = sqlx::query(
        "SELECT chain_address, cin, full_name, phone FROM users WHERE phone = $1 OR phone = $2 LIMIT 1",
    )
    .bind(&n11)
    .bind(&n8)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => {
            record_auth_attempt(&state, &ip, "/auth/login", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
            return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
        }
    };

    let chain_address: String = row
        .try_get("chain_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let stored_login_id: String = row
        .try_get("cin")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let phone: String = row
        .try_get("phone")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    // Verify PIN (with lockout logic)
    if let Err(e) = verify_pin(&state, &chain_address, &payload.pin).await {
        record_auth_attempt(&state, &ip, "/auth/login", false, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
        return Err(e);
    }

    // Generate login OTP
    let otp = generate_otp_code();
    let otp_hash = hash_otp(&stored_login_id, &otp, &state.encryption_key);
    let expires_at = Utc::now() + chrono::Duration::minutes(5);

    sqlx::query(
        "INSERT INTO login_otps (user_address, otp_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(&chain_address)
    .bind(&otp_hash)
    .bind(expires_at)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save OTP"))?;

    send_otp_sms(&state, &phone, &format!("Your NexaPay login code is: {}. Valid for 5 minutes. Never share this code.", otp)).await;
    let mut dev_otp: Option<String> = None;
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
    if app_env == "development" || dev_show == "true" {
        dev_otp = Some(otp.clone());
    }

    record_auth_attempt(&state, &ip, "/auth/login", true, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
    audit_log(&state, Some(&chain_address), "login_pin", "user", None, &ip, headers.get("user-agent").and_then(|v| v.to_str().ok()), "success", json!({"phone_hint": mask_phone_hint(&phone)})).await;
    log_api_call(&state, None, "/auth/login", "POST", 200).await;

    Ok(Json(PinLoginStep1Response {
        step: "otp_required".to_string(),
        phone_hint: mask_phone_hint(&phone),
        dev_otp,
    }))
}

/// Step 2 of login: verify OTP and issue JWT.
/// Also sets httpOnly session cookie for cross-subdomain browser sessions.
pub async fn verify_login_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyLoginOtpRequest>,
) -> Result<(HeaderMap, Json<LoginResponse>), (StatusCode, Json<Value>)> {
    if !is_valid_otp(&payload.otp_code) {
        return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
    }

    let (n11, n8) = login_phone_variants(&payload.phone).ok_or_else(|| {
        api_error(StatusCode::BAD_REQUEST, "Invalid phone (8 digits or +216 / 216 prefix)")
    })?;

    let row = sqlx::query(
        "SELECT chain_address, cin, full_name FROM users WHERE phone = $1 OR phone = $2 LIMIT 1",
    )
    .bind(&n11)
    .bind(&n8)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials")),
    };

    let chain_address: String = row
        .try_get("chain_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let stored_login_id: String = row
        .try_get("cin")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let full_name: String = row
        .try_get("full_name")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    // Find latest unused unexpired login_otp
    let otp_row = sqlx::query(
        "SELECT id, otp_hash, expires_at, used FROM login_otps WHERE user_address = $1 AND used = FALSE ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&chain_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let otp_row = match otp_row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "OTP expired or not requested")),
    };

    let otp_id: Uuid = otp_row.try_get("id").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let stored_hash: String = otp_row.try_get("otp_hash").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let expires_at: chrono::DateTime<chrono::Utc> = otp_row.try_get("expires_at").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let used: bool = otp_row.try_get("used").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    if used || expires_at <= Utc::now() {
        return Err(api_error(StatusCode::UNAUTHORIZED, "OTP expired or not requested"));
    }

    let provided_hash = hash_otp(&stored_login_id, &payload.otp_code, &state.encryption_key);
    if !constant_time_eq_hex(&provided_hash, &stored_hash) {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
    }

    // Mark OTP used
    let _ = sqlx::query("UPDATE login_otps SET used = TRUE WHERE id = $1")
        .bind(otp_id)
        .execute(&state.pg_pool)
        .await;

    let session_id = Uuid::new_v4();
    let session_id_str = session_id.to_string();
    let token = issue_session_token(
        &state,
        &chain_address,
        &sha256_hex(stored_login_id.as_bytes()),
        &session_id_str,
    )
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Token creation failed"))?;

    let token_hash = sha256_hex(token.as_bytes());
    let _ = sqlx::query(
        "INSERT INTO user_sessions (id, user_address, token_hash) VALUES ($1, $2, $3)")
        .bind(session_id)
        .bind(&chain_address)
        .bind(&token_hash)
        .execute(&state.pg_pool)
        .await;

    // Check for other active sessions and broadcast security alert
    let others: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_sessions WHERE user_address = $1 AND is_revoked = FALSE AND id != $2")
        .bind(&chain_address)
        .bind(session_id)
        .fetch_one(&state.pg_pool)
        .await
        .unwrap_or(0);
    if others > 0 {
        let _ = sqlx::query(
            "INSERT INTO security_alerts (user_address, alert_type, metadata) VALUES ($1, 'new_login', $2)")
            .bind(&chain_address)
            .bind(serde_json::json!({"session_id": session_id, "time": chrono::Utc::now().to_rfc3339()}))
            .execute(&state.pg_pool)
            .await;
        let alert = serde_json::json!({
            "type": "security_alert",
            "alert_type": "new_login",
            "message": "A new device just logged into your account. Is this you?",
            "session_id": session_id,
            "time": chrono::Utc::now().to_rfc3339(),
        }).to_string();
        crate::api::accounts::broadcast_event(&state, &chain_address, &alert);
    }

    log_api_call(&state, None, "/auth/login/verify-otp", "POST", 200).await;

    let mut headers = HeaderMap::new();
    let cookie = format!(
        "nexapay_session={}; Domain={}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400",
        token, state.cookie_domain
    );
    headers.insert(http::header::SET_COOKIE, cookie.parse().unwrap());

    Ok((headers, Json(LoginResponse {
        token: token.clone(),
        address: chain_address.clone(),
        chain_address,
        full_name,
    })))
}

pub async fn verify_identity(
    State(state): State<AppState>,
    Json(payload): Json<VerifyIdentityRequest>,
) -> Result<Json<VerifyIdentityResponse>, (StatusCode, Json<Value>)> {
    let normalized_phone = normalize_phone(&payload.phone)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Phone must be 8 digits or start with 216"))?;

    let dob = chrono::NaiveDate::parse_from_str(&payload.date_of_birth, "%Y-%m-%d")
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid date_of_birth format"))?;

    let row = sqlx::query(
        "SELECT u.chain_address, u.cin, u.phone, u.full_name
         FROM users u
         WHERE u.phone = $1 AND u.cin = $2 AND u.date_of_birth = $3
         LIMIT 1",
    )
    .bind(&normalized_phone)
    .bind(&payload.cin_number)
    .bind(dob)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err(api_error(StatusCode::UNAUTHORIZED, "Identity verification failed"));
        }
    };

    let chain_address: String = row
        .try_get("chain_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let cin: String = row
        .try_get("cin")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let phone: String = row
        .try_get("phone")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let _full_name: String = row
        .try_get("full_name")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    let recent_count_row = sqlx::query(
        "SELECT COUNT(*) as cnt FROM login_otps WHERE user_address = $1 AND created_at > NOW() - INTERVAL '1 hour'",
    )
    .bind(&chain_address)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let recent_count: i64 = recent_count_row
        .try_get("cnt")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    if recent_count >= 3 {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Identity verification failed"));
    }

    let otp = generate_otp_code();
    let otp_hash = hash_otp(&cin, &otp, &state.encryption_key);
    let expires_at = Utc::now() + chrono::Duration::minutes(5);

    sqlx::query(
        "INSERT INTO login_otps (user_address, otp_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(&chain_address)
    .bind(&otp_hash)
    .bind(expires_at)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to store OTP"))?;

    send_otp_sms(&state, &phone, &otp).await;
    let mut dev_otp: Option<String> = None;
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
    if app_env == "development" || dev_show == "true" {
        dev_otp = Some(otp.clone());
    }

    Ok(Json(VerifyIdentityResponse {
        step: "otp_required".to_string(),
        phone_hint: mask_phone_hint(&phone),
        dev_otp,
    }))
}

pub async fn verify_recovery_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyRecoveryOtpRequest>,
) -> Result<Json<VerifyRecoveryOtpResponse>, (StatusCode, Json<Value>)> {
    if !is_valid_otp(&payload.otp_code) {
        return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
    }

    let normalized_phone = normalize_phone(&payload.phone)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Phone must be 8 digits or start with 216"))?;

    // Look up user by phone to get chain_address for login_otps query
    let user_row = sqlx::query("SELECT chain_address, cin FROM users WHERE phone = $1 LIMIT 1")
        .bind(&normalized_phone)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let (user_address, cin) = match user_row {
        Some(r) => {
            let addr: String = r.try_get("chain_address").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
            let cin: String = r.try_get("cin").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
            (addr, cin)
        }
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired OTP")),
    };

    let row = sqlx::query(
        "SELECT id, otp_hash, expires_at, used
         FROM login_otps
         WHERE user_address = $1 AND used = FALSE
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(&user_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired OTP")),
    };

    let id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let stored_hash: String = row
        .try_get("otp_hash")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let expires_at: chrono::DateTime<chrono::Utc> = row
        .try_get("expires_at")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let used: bool = row
        .try_get("used")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    if used || expires_at <= Utc::now() {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired OTP"));
    }

    let provided_hash = hash_otp(&cin, &payload.otp_code, &state.encryption_key);
    if !constant_time_eq_hex(&provided_hash, &stored_hash) {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
    }

    sqlx::query("UPDATE login_otps SET used = TRUE WHERE id = $1")
        .bind(id)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to mark OTP used"))?;

    let token = Uuid::new_v4();
    let token_hash = sha256_hex(token.to_string().as_bytes());
    let token_expires_at = Utc::now() + chrono::Duration::minutes(10);

    sqlx::query(
        "INSERT INTO recovery_tokens (user_address, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(&user_address)
    .bind(&token_hash)
    .bind(token_expires_at)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to store recovery token"))?;

    Ok(Json(VerifyRecoveryOtpResponse {
        recovery_token: token.to_string(),
    }))
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPinRequest>,
) -> Result<Json<ResetPinResponse>, (StatusCode, Json<Value>)> {
    eprintln!("[deprecated] /auth/recover/reset-password is deprecated; use /auth/recover/reset-pin");
    reset_pin_handler(state, payload).await
}

pub async fn reset_pin(
    State(state): State<AppState>,
    Json(payload): Json<ResetPinRequest>,
) -> Result<Json<ResetPinResponse>, (StatusCode, Json<Value>)> {
    reset_pin_handler(state, payload).await
}

async fn reset_pin_handler(
    state: AppState,
    payload: ResetPinRequest,
) -> Result<Json<ResetPinResponse>, (StatusCode, Json<Value>)> {
    if payload.new_pin != payload.pin_confirm {
        return Err(api_error(StatusCode::BAD_REQUEST, "PINs do not match"));
    }
    if payload.new_pin.len() != 6 || !payload.new_pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits"));
    }

    let token_hash = sha256_hex(payload.recovery_token.as_bytes());

    let row = sqlx::query(
        "SELECT id, user_address, expires_at, used
         FROM recovery_tokens
         WHERE token_hash = $1
         LIMIT 1",
    )
    .bind(&token_hash)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired recovery token")),
    };

    let id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let user_address: String = row
        .try_get("user_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let expires_at: chrono::DateTime<chrono::Utc> = row
        .try_get("expires_at")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let used: bool = row
        .try_get("used")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    if used || expires_at <= Utc::now() {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired recovery token"));
    }

    let user_row = sqlx::query("SELECT phone FROM users WHERE chain_address = $1 LIMIT 1")
        .bind(&user_address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let phone: String = match user_row {
        Some(r) => r.try_get("phone").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?,
        None => return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, "User not found")),
    };

    let pin_hash = hash_transaction_pin(&user_address, &payload.new_pin, &state.encryption_key, None);

    sqlx::query(
        "UPDATE cards SET pin_hash = $1, pin_attempts = 0, pin_locked_until = NULL WHERE chain_address = $2",
    )
    .bind(&pin_hash)
    .bind(&user_address)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update PIN"))?;

    sqlx::query("UPDATE recovery_tokens SET used = TRUE WHERE id = $1")
        .bind(id)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to mark token used"))?;

    let _ = send_pin_changed_sms(&state, &phone).await;

    Ok(Json(ResetPinResponse { success: true }))
}

/// Normalized `216…` plus 8-digit local form (matches either value in `users.phone`).
pub(crate) fn login_phone_variants(raw: &str) -> Option<(String, String)> {
    let normalized = normalize_phone(raw.trim())?;
    let local = normalized.get(3..)?.to_string();
    if normalized.len() != 11 || !normalized.starts_with("216") || local.len() != 8 {
        return None;
    }
    if !local.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some((normalized, local))
}

fn normalize_phone(phone: &str) -> Option<String> {
    // Accept formats: 8 digits (local), 216XXXXXXXX, +216XXXXXXXX
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 8 {
        Some(format!("216{}", digits))
    } else if digits.len() == 11 && digits.starts_with("216") {
        Some(digits)
    } else {
        None
    }
}

pub(crate) fn is_valid_otp(otp: &str) -> bool {
    Regex::new(r"^\d{6}$")
        .map(|re| re.is_match(otp))
        .unwrap_or(false)
}

/// Constant-time hex string comparison to prevent timing side-channel attacks.
pub(crate) fn constant_time_eq_hex(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    if a_bytes.len() != b_bytes.len() {
        return false;
    }
    let mut result: u8 = 0;
    for i in 0..a_bytes.len() {
        result |= a_bytes[i] ^ b_bytes[i];
    }
    result == 0
}

pub(crate) fn generate_otp_code() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000))
}

fn mask_phone(phone: &str) -> String {
    if phone.len() < 4 {
        return "***".to_string();
    }
    let suffix = &phone[phone.len() - 2..];
    format!("***{}", suffix)
}

pub(crate) fn mask_phone_hint(phone: &str) -> String {
    if phone.len() <= 5 {
        return "•".repeat(phone.len());
    }
    let prefix = &phone[..3];
    let suffix = &phone[phone.len() - 2..];
    let dots = "•".repeat(phone.len() - 5);
    format!("{}{}{}", prefix, dots, suffix)
}

pub(crate) fn hash_otp(cin: &str, otp: &str, pepper: &str) -> String {
    sha256_hex(format!("otp:{}:{}:{}", cin, otp, pepper).as_bytes())
}


// SMS provider placeholder — previously Twilio. Replace with your SMS provider.
pub(crate) async fn send_sms(_state: &AppState, _to: &str, _body: &str) {
    tracing::info!(target: "sms", to = _to, "SMS would be sent (no provider configured)");
}

pub(crate) async fn send_otp_sms(
    state: &AppState,
    to: &str,
    otp: &str,
) {
    let body = format!("Your NexaPay verification code is: {}. It expires in 5 minutes.", otp);
    send_sms(state, to, &body).await;
}

async fn send_pin_changed_sms(
    state: &AppState,
    to: &str,
) {
    let body = "Your NexaPay PIN has been successfully changed. If this wasn't you, contact support immediately at support@nexapay.tn";
    send_sms(state, to, body).await;
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn auth_status_code(err: AuthError) -> StatusCode {
    match err {
        AuthError::Unauthorized => StatusCode::UNAUTHORIZED,
        AuthError::Forbidden => StatusCode::FORBIDDEN,
        AuthError::TooManyRequests { .. } => StatusCode::TOO_MANY_REQUESTS,
        AuthError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    full_name: String,
    phone: String,
    email: String,
    address: String,
    chain_address: String,
    cin: String,
    address_line: Option<String>,
    delegation: Option<String>,
    governorate: Option<String>,
    avatar_url: Option<String>,
    force_pin_change: bool,
    kyc_status: String,
}

pub async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MeResponse>, (StatusCode, Json<Value>)> {
    let token = extract_account_token(&headers)
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Missing session token"))?;
    let claims = verify_session_with_revocation_check(&state, &token)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid or expired session"))?;

    let row = sqlx::query(
        "SELECT full_name, phone, email, chain_address, cin, address_line, delegation, governorate, avatar_url, force_pin_change, kyc_status FROM users WHERE chain_address = $1 LIMIT 1",
    )
    .bind(&claims.address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = row.ok_or_else(|| api_error(StatusCode::NOT_FOUND, "User not found"))?;

    let full_name: String = row.try_get("full_name").unwrap_or_default();
    let phone: String = row.try_get("phone").unwrap_or_default();
    let email: String = row.try_get("email").unwrap_or_default();
    let chain_address: String = row.try_get("chain_address").unwrap_or_default();
    let cin: String = row.try_get("cin").unwrap_or_default();
    let address_line: Option<String> = row.try_get("address_line").ok();
    let delegation: Option<String> = row.try_get("delegation").ok();
    let governorate: Option<String> = row.try_get("governorate").ok();
    let avatar_url: Option<String> = row.try_get("avatar_url").ok();
    let force_pin_change: bool = row.try_get("force_pin_change").unwrap_or(false);
    let _kyc_status: String = row.try_get("kyc_status").unwrap_or_else(|_| "unverified".to_string());

    Ok(Json(MeResponse {
        full_name,
        phone,
        email,
        address: chain_address.clone(),
        chain_address,
        cin,
        address_line,
        delegation,
        governorate,
        avatar_url,
        force_pin_change,
        kyc_status: "verified".to_string(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct ResolveSecurityAlertRequest {
    pub session_id: String,
    pub is_me: bool,
}

#[derive(Debug, Serialize)]
pub struct ResolveSecurityAlertResponse {
    success: bool,
    revoked: bool,
}

/// Resolve a security alert: if is_me=false, revoke the intruder's session and force PIN change.
pub async fn resolve_security_alert(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ResolveSecurityAlertRequest>,
) -> Result<Json<ResolveSecurityAlertResponse>, (StatusCode, Json<Value>)> {
    let token = extract_account_token(&headers)
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Missing session token"))?;
    let claims = verify_session_with_revocation_check(&state, &token)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid or expired session"))?;
    let address = claims.address;

    let revoked = if !payload.is_me {
        // Revoke the reported session
        let target_session = Uuid::parse_str(&payload.session_id).ok();
        if let Some(sid) = target_session {
            let _ = sqlx::query(
                "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_address = $1 AND id = $2")
                .bind(&address)
                .bind(sid)
                .execute(&state.pg_pool)
                .await;
        }
        // Force PIN change for the owner
        let _ = sqlx::query(
            "UPDATE users SET force_pin_change = TRUE WHERE chain_address = $1")
            .bind(&address)
            .execute(&state.pg_pool)
            .await;
        true
    } else {
        false
    };

    // Mark security alerts as resolved
    let _ = sqlx::query(
        "UPDATE security_alerts SET resolved = TRUE WHERE user_address = $1 AND alert_type = 'new_login'")
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

    Ok(Json(ResolveSecurityAlertResponse { success: true, revoked }))
}

#[derive(Debug, Deserialize)]
pub struct ChangePinRequest {
    pub current_pin: String,
    pub new_pin: String,
    pub pin_confirm: String,
}

/// Change PIN when logged in (for the force_pin_change flow)
pub async fn change_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePinRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = extract_account_token(&headers)
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Missing session token"))?;
    let claims = verify_session_with_revocation_check(&state, &token)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid or expired session"))?;
    let address = claims.address;

    if payload.new_pin != payload.pin_confirm {
        return Err(api_error(StatusCode::BAD_REQUEST, "PINs do not match"));
    }
    if payload.new_pin.len() != 6 || !payload.new_pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be exactly 6 digits"));
    }

    // Verify current PIN
    let row = sqlx::query("SELECT pin_hash FROM cards WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let stored_pin = row.and_then(|r| r.try_get::<String, _>("pin_hash").ok()).filter(|s| !s.is_empty());
    let stored_pin = stored_pin.ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "No PIN set"))?;
    let (pin_valid, _pin_upgrade) = verify_transaction_pin(&address, &payload.current_pin, &state.encryption_key, &stored_pin);
    if !pin_valid {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Incorrect current PIN"));
    }

    let new_pin_hash = hash_transaction_pin(&address, &payload.new_pin, &state.encryption_key, None);
    let _ = sqlx::query("UPDATE cards SET pin_hash = $1 WHERE chain_address = $2")
        .bind(&new_pin_hash)
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

    // Clear force_pin_change flag
    let _ = sqlx::query("UPDATE users SET force_pin_change = FALSE WHERE chain_address = $1")
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

    // Revoke all other active sessions so intruders are booted
    if let Ok(current_session) = Uuid::parse_str(&claims.session_id) {
        let _ = sqlx::query(
            "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_address = $1 AND id != $2")
            .bind(&address)
            .bind(current_session)
            .execute(&state.pg_pool)
            .await;
    }

    // Send SMS notification
    let phone_row = sqlx::query("SELECT phone FROM users WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await;
    if let Ok(Some(r)) = phone_row {
        if let Ok(phone) = r.try_get::<String, _>("phone") {
            let _ = send_pin_changed_sms(&state, &phone).await;
        }
    }

    Ok(Json(json!({ "success": true })))
}
