use axum::{extract::State, http::HeaderMap, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{extract_account_token, verify_session_token};
use crate::api::AppState;

fn api_error(sc: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (sc, Json(json!({"error": msg})))
}

/// Fetch Tunisia municipalities and try to match extracted place/address to governorate + delegation.
/// Returns (governorate_value, delegation_value) — both empty if no match.
async fn match_tunisia_municipalities(
    state: &AppState,
    place_of_birth: &str,
    address: &str,
) -> (Option<String>, Option<String>) {
    let res = state
        .http_client
        .get("https://tn-municipality-api.vercel.app/api/municipalities")
        .send()
        .await;

    let municipalities: Vec<Value> = match res {
        Ok(r) => match r.json().await {
            Ok(v) => v,
            Err(_) => return (None, None),
        },
        Err(_) => return (None, None),
    };

    let place_norm = normalize_arabic(place_of_birth);
    let addr_norm = normalize_arabic(address);

    for m in &municipalities {
        let name = m["Name"].as_str().unwrap_or("");
        let name_ar = m["NameAr"].as_str().unwrap_or("");
        let value = m["Value"].as_str().unwrap_or("");

        let name_norm = normalize_arabic(name);
        let name_ar_norm = normalize_arabic(name_ar);

        // Match governorate by place_of_birth or address
        let gov_match = (!place_of_birth.is_empty()
            && (place_norm == name_norm || place_norm.contains(&name_norm) || name_ar_norm.contains(&place_norm) || place_norm.contains(&name_ar_norm)))
            || (!address.is_empty()
                && (addr_norm.contains(&name_norm) || addr_norm.contains(&name_ar_norm)));

        if gov_match {
            let mut del_match: Option<String> = None;
            if let Some(delegations) = m["Delegations"].as_array() {
                for d in delegations {
                    let d_name = d["Name"].as_str().unwrap_or("");
                    let d_name_ar = d["NameAr"].as_str().unwrap_or("");
                    let d_value = d["Value"].as_str().unwrap_or("");
                    let d_name_norm = normalize_arabic(d_name);
                    let d_name_ar_norm = normalize_arabic(d_name_ar);

                    let matched = (!address.is_empty()
                        && (addr_norm.contains(&d_name_norm) || addr_norm.contains(&d_name_ar_norm)))
                        || (!place_of_birth.is_empty()
                            && (place_norm.contains(&d_name_norm) || place_norm.contains(&d_name_ar_norm)));

                    if matched {
                        del_match = Some(d_value.to_string());
                        break;
                    }
                }
            }
            return (Some(value.to_string()), del_match);
        }
    }

    (None, None)
}

/// Lightweight Arabic text normalization for matching.
fn normalize_arabic(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'أ' | 'إ' | 'آ' | 'ٱ' => 'ا',
            'ة' => 'ه',
            'ى' => 'ي',
            'ؤ' => 'و',
            'ئ' => 'ي',
            _ => c,
        })
        .collect::<String>()
        .replace(" ", "")
        .to_lowercase()
}

/// POST /accounts/:address/kyc/start
/// Demo: Accepts CIN front+back images, stores them, and returns a session id.
/// No AI processing — verification is simulated in finalize.
pub async fn start_kyc(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    // Check if already verified
    let status_row = sqlx::query("SELECT kyc_status FROM users WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await;
    if let Ok(Some(r)) = &status_row {
        let st: String = r.try_get("kyc_status").unwrap_or_default();
        if st == "verified" {
            return (StatusCode::OK, Json(json!({"error": "Already verified", "kyc_status": "verified"})));
        }
    }

    // Accept images (discard for demo)
    let mut _saved = 0;
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => continue,
        };
        // In a real deployment we would persist images.
        // For demo we just count them.
        if !data.is_empty() && (name == "front" || name == "back") {
            _saved += 1;
        }
    }

    // Generate a fake session id
    let session_id = format!("demo_{}", Uuid::new_v4().to_string().replace("-", ""));

    // Store verification record
    let verif_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO kyc_verifications (id, user_address, external_session_id, status) VALUES ($1, $2, $3, 'processing')",
    )
    .bind(verif_id)
    .bind(&address)
    .bind(&session_id)
    .execute(&state.pg_pool)
    .await;

    // Update user status to pending
    let _ = sqlx::query(
        "UPDATE users SET kyc_status = 'pending', kyc_external_session_id = $1 WHERE chain_address = $2",
    )
    .bind(&session_id)
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    (StatusCode::OK, Json(json!({
        "session_id": session_id,
        "status": "processing",
        "kyc_status": "pending",
    })))
}

/// POST /accounts/:address/kyc/finalize
/// Called after liveness passes. Fetches results from KYC service and updates user.
#[derive(Deserialize)]
pub struct FinalizeRequest {
    pub session_id: String,
}

pub async fn finalize_kyc(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
    _payload: Json<FinalizeRequest>,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    // Demo: auto-verify using the CIN provided at registration.
    // No AI service calls — this is a demo environment.
    let user_row = sqlx::query("SELECT cin, full_name, date_of_birth FROM users WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await;

    let (cin_num, full_name, dob) = match user_row {
        Ok(Some(row)) => {
            let c: Option<String> = row.try_get("cin").ok();
            let n: String = row.try_get("full_name").unwrap_or_default();
            let d: Option<String> = row.try_get("date_of_birth").ok();
            (c, n, d)
        }
        _ => (None, String::new(), None),
    };

    // Mark verified
    let _ = sqlx::query(
        "UPDATE users SET kyc_status = 'verified', kyc_verified_at = NOW(), kyc_liveness_passed = TRUE, kyc_failure_reason = NULL, nationality = COALESCE(NULLIF(nationality, ''), 'Tunisian') WHERE chain_address = $1",
    )
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    // Build fake response with stored data
    let resp_body = json!({
        "kyc_passed": true,
        "liveness_passed": true,
        "face_match": { "match": true, "score": 0.95 },
        "data": {
            "id_number": cin_num.clone().unwrap_or_default(),
            "first_name": full_name.split_whitespace().next().unwrap_or(""),
            "last_name": full_name.split_whitespace().nth(1).unwrap_or(""),
            "full_name": full_name,
            "date_of_birth": dob.unwrap_or_default(),
        },
        "demo": true,
        "message": "Demo mode: AI KYC verification is disabled."
    });

    (StatusCode::OK, Json(resp_body))
}

/// GET /accounts/:address/kyc/status
/// Returns current KYC verification status for the user.
pub async fn kyc_status(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    let row = sqlx::query(
        "SELECT kyc_status, kyc_external_session_id, kyc_verified_at, kyc_face_match_score, kyc_liveness_passed, kyc_failure_reason, cin FROM users WHERE chain_address = $1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await;

    match row {
        Ok(Some(r)) => {
            let status: String = r.try_get("kyc_status").unwrap_or_else(|_| "unverified".to_string());
            let session_id: Option<String> = r.try_get("kyc_external_session_id").ok().flatten();
            let verified_at: Option<chrono::DateTime<chrono::Utc>> = r.try_get("kyc_verified_at").ok().flatten();
            let failure: Option<String> = r.try_get("kyc_failure_reason").ok().flatten();
            let cin: Option<String> = r.try_get("cin").ok().flatten();
            let cin_missing = cin.as_ref().map(|c| c.trim().is_empty()).unwrap_or(true);

            // Check if account contract is already signed
            let signed_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM signed_documents WHERE user_address = $1 AND doc_type = 'account_opening' AND status = 'anchored'"
            )
            .bind(&address)
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0);

            (StatusCode::OK, Json(json!({
                "kyc_status": status,
                "session_id": session_id,
                "verified_at": verified_at.map(|v| v.to_rfc3339()),
                "failure_reason": failure,
                "contract_signed": signed_count > 0,
                "cin_missing": cin_missing,
            })))
        }
        _ => (StatusCode::NOT_FOUND, Json(json!({"error": "User not found"}))),
    }
}

/// POST /internal/kyc/callback
/// Called by the KYC service when CIN extraction completes (webhook).
#[derive(Deserialize)]
pub struct KycCallbackPayload {
    pub session_id: String,
    pub status: String,
    pub data: Option<Value>,
    pub face_match: Option<Value>,
    pub liveness_passed: Option<bool>,
    pub kyc_passed: Option<bool>,
}

pub async fn kyc_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<KycCallbackPayload>,
) -> impl IntoResponse {
    // Verify callback API key
    let expected_key = std::env::var("KYC_CALLBACK_KEY").unwrap_or_else(|_| "dev_callback_key".to_string());
    let provided_key = headers
        .get("X-Callback-Key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if provided_key != expected_key {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid callback key"})));
    }

    // Find user by external session
    let user_row = sqlx::query(
        "SELECT chain_address FROM users WHERE kyc_external_session_id = $1",
    )
    .bind(&payload.session_id)
    .fetch_optional(&state.pg_pool)
    .await;

    let address = match user_row {
        Ok(Some(r)) => r.try_get::<String, _>("chain_address").unwrap_or_default(),
        _ => return (StatusCode::NOT_FOUND, Json(json!({"error": "Session not found"}))),
    };

    let kyc_passed = payload.kyc_passed.unwrap_or(false);
    let liveness_passed = payload.liveness_passed.unwrap_or(false);
    let face_match_passed = payload
        .face_match
        .as_ref()
        .and_then(|f| f["match"].as_bool())
        .unwrap_or(false);
    let face_match_score = payload
        .face_match
        .as_ref()
        .and_then(|f| f["score"].as_f64())
        .unwrap_or(0.0) as f32;

    let cin_data = payload.data.as_ref();

    let new_status = if kyc_passed {
        "verified"
    } else if payload.status == "failed" {
        "failed"
    } else {
        "pending"
    };

    if new_status == "verified" {
        let first_name = cin_data
            .and_then(|d| d["first_name_latin"].as_str())
            .or_else(|| cin_data.and_then(|d| d["first_name"].as_str()));
        let last_name = cin_data
            .and_then(|d| d["last_name_latin"].as_str())
            .or_else(|| cin_data.and_then(|d| d["last_name"].as_str()));
        let father_name = cin_data.and_then(|d| d["father_lineage"].as_str());
        let mother_name = cin_data.and_then(|d| d["mother_name"].as_str());
        let id_number = cin_data.and_then(|d| d["id_number"].as_str());
        let birth_date = cin_data
            .and_then(|d| d["birth_date"].as_str())
            .or_else(|| cin_data.and_then(|d| d["date_of_birth"].as_str()));
        let address_field = cin_data.and_then(|d| d["address"].as_str());
        let place_of_birth = cin_data.and_then(|d| d["place_of_birth"].as_str());
        let profession = cin_data.and_then(|d| d["profession"].as_str());
        let issue_date = cin_data.and_then(|d| d["issue_date"].as_str());

        // Check for duplicate CIN BEFORE marking KYC as verified
        if let Some(cin_num) = id_number {
            let existing = sqlx::query("SELECT chain_address FROM users WHERE cin = $1 LIMIT 1")
                .bind(cin_num)
                .fetch_optional(&state.pg_pool)
                .await;
            if let Ok(Some(row)) = existing {
                let other: String = row.try_get("chain_address").unwrap_or_default();
                if other != address {
                    return (StatusCode::CONFLICT, Json(json!({"error": "This CIN is already associated with another account"})));
                }
            }
        }

        let full_name = match (first_name, last_name) {
            (Some(f), Some(l)) => Some(format!("{} {}", f, l)),
            _ => None,
        };

        // Match delegation/governorate from extracted data
        let (matched_gov, matched_del) = match (place_of_birth, address_field) {
            (Some(pob), Some(addr)) => {
                match_tunisia_municipalities(&state, pob, addr).await
            }
            (Some(pob), None) => {
                match_tunisia_municipalities(&state, pob, "").await
            }
            (None, Some(addr)) => {
                match_tunisia_municipalities(&state, "", addr).await
            }
            _ => (None, None),
        };

        let _ = sqlx::query(
            "UPDATE users SET kyc_status = 'verified', kyc_verified_at = NOW(), kyc_face_match_score = $1, kyc_liveness_passed = TRUE, kyc_failure_reason = NULL, nationality = COALESCE(NULLIF(nationality, ''), 'Tunisian') WHERE chain_address = $2",
        )
        .bind(face_match_score)
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

        if let Some(name) = full_name {
            let _ = sqlx::query("UPDATE users SET full_name = COALESCE(NULLIF(full_name, ''), $1) WHERE chain_address = $2")
                .bind(name)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(f) = first_name {
            let _ = sqlx::query("UPDATE users SET first_name = COALESCE(NULLIF(first_name, ''), $1) WHERE chain_address = $2")
                .bind(f)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(l) = last_name {
            let _ = sqlx::query("UPDATE users SET last_name = COALESCE(NULLIF(last_name, ''), $1) WHERE chain_address = $2")
                .bind(l)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(father) = father_name {
            let _ = sqlx::query("UPDATE users SET father_name = COALESCE(NULLIF(father_name, ''), $1) WHERE chain_address = $2")
                .bind(father)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(mother) = mother_name {
            let _ = sqlx::query("UPDATE users SET mother_name = COALESCE(NULLIF(mother_name, ''), $1) WHERE chain_address = $2")
                .bind(mother)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        // Always overwrite cin with extracted value
        if let Some(cin_num) = id_number {
            let _ = sqlx::query("UPDATE users SET cin = $1 WHERE chain_address = $2")
                .bind(cin_num)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(addr) = address_field {
            let _ = sqlx::query("UPDATE users SET address_line = COALESCE(NULLIF(address_line, ''), $1) WHERE chain_address = $2")
                .bind(addr)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(dob) = birth_date {
            let _ = sqlx::query("UPDATE users SET date_of_birth = COALESCE(NULLIF(date_of_birth, ''), $1) WHERE chain_address = $2")
                .bind(dob)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(pob) = place_of_birth {
            let _ = sqlx::query("UPDATE users SET place_of_birth = COALESCE(NULLIF(place_of_birth, ''), $1), city = COALESCE(NULLIF(city, ''), $1) WHERE chain_address = $2")
                .bind(pob)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(prof) = profession {
            let _ = sqlx::query("UPDATE users SET profession = COALESCE(NULLIF(profession, ''), $1) WHERE chain_address = $2")
                .bind(prof)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(gov) = matched_gov {
            let _ = sqlx::query("UPDATE users SET governorate = COALESCE(NULLIF(governorate, ''), $1) WHERE chain_address = $2")
                .bind(gov)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(del) = matched_del {
            let _ = sqlx::query("UPDATE users SET delegation = COALESCE(NULLIF(delegation, ''), $1) WHERE chain_address = $2")
                .bind(del)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
        if let Some(id) = issue_date {
            let _ = sqlx::query("UPDATE users SET cin_issue_date = COALESCE(NULLIF(cin_issue_date, ''), $1) WHERE chain_address = $2")
                .bind(id)
                .bind(&address)
                .execute(&state.pg_pool)
                .await;
        }
    } else if new_status == "failed" {
        let reason = cin_data.and_then(|d| d["error"].as_str()).unwrap_or("KYC verification failed");
        let _ = sqlx::query("UPDATE users SET kyc_status = 'failed', kyc_failure_reason = $1 WHERE chain_address = $2")
            .bind(reason)
            .bind(&address)
            .execute(&state.pg_pool)
            .await;
    }

    // Update verification record
    let _ = sqlx::query(
        "UPDATE kyc_verifications SET status = $1, cin_data = $2, face_match_score = $3, face_match_passed = $4, liveness_passed = $5, completed_at = NOW() WHERE external_session_id = $6",
    )
    .bind(if new_status == "verified" { "completed" } else { "failed" })
    .bind(&payload.data)
    .bind(face_match_score)
    .bind(face_match_passed)
    .bind(liveness_passed)
    .bind(&payload.session_id)
    .execute(&state.pg_pool)
    .await;

    // Send SSE event to user
    let event = json!({
        "type": "kyc_update",
        "kyc_status": new_status,
        "message": if new_status == "verified" { "Your identity has been verified!" } else { "KYC verification failed. Please try again." },
    }).to_string();
    crate::api::accounts::broadcast_event(&state, &address, &event);

    (StatusCode::OK, Json(json!({"status": new_status, "address": address})))
}

/// POST /accounts/:address/kyc/skip
/// User chooses to skip KYC. Account remains unverified.
pub async fn skip_kyc(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    let _ = sqlx::query(
        "UPDATE users SET kyc_status = 'skipped', kyc_failure_reason = NULL WHERE chain_address = $1",
    )
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    (StatusCode::OK, Json(json!({"kyc_status": "skipped", "message": "You can verify your identity later from your profile."})))
}

#[derive(Deserialize)]
pub struct SubmitCinPayload {
    pub cin: String,
}

pub async fn submit_cin(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
    Json(payload): Json<SubmitCinPayload>,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    let cin = payload.cin.trim();
    if cin.is_empty() || cin.len() < 5 || cin.len() > 20 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid CIN number"})));
    }

    // Check if this CIN already belongs to another user
    let existing = sqlx::query("SELECT chain_address FROM users WHERE cin = $1 AND chain_address != $2 LIMIT 1")
        .bind(cin)
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await;
    if let Ok(Some(_)) = existing {
        return (StatusCode::CONFLICT, Json(json!({"error": "This CIN is already associated with another account"})));
    }

    let _ = sqlx::query("UPDATE users SET cin = $1 WHERE chain_address = $2")
        .bind(cin)
        .bind(&address)
        .execute(&state.pg_pool)
        .await;

    (StatusCode::OK, Json(json!({"success": true, "cin": cin})))
}

/// POST /accounts/:address/kyc/face
/// Demo: Accepts a face photo. No AI processing — just returns success.
pub async fn upload_face_photo(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> impl IntoResponse {
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid token"}))),
    };
    if claims.address != address {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Address mismatch"})));
    }

    // Accept face image (discard for demo)
    if let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let _data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid upload"}))),
        };
        // Demo: no storage, no AI processing
    }

    (StatusCode::OK, Json(json!({"success": true, "demo": true, "message": "Face photo accepted (demo mode)."})))
}
