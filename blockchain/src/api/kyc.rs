use axum::{extract::State, Json, extract::Multipart, response::IntoResponse};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use crate::api::AppState;
use crate::api::auth;
use crate::services::kyc_service::KycService;

#[derive(Deserialize)]
pub struct InitPayload {
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub date_of_birth: String,
}

#[derive(Serialize)]
pub struct InitResponse { pub session_id: String }

pub async fn register_init(State(state): State<AppState>, Json(payload): Json<InitPayload>) -> impl IntoResponse {
    let ksvc = KycService::new(state.pg_pool.clone());
    match ksvc.init_registration(
        &payload.full_name,
        &payload.phone,
        &payload.email,
        &payload.date_of_birth,
        None,
    )
    .await
    {
        Ok(session_id) => (axum::http::StatusCode::OK, Json(serde_json::json!({"session_id": session_id.to_string()}))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e}))),
    }
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
    pub session_id: String,
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

    let row = sqlx::query(
        "SELECT provisioned_chain_address, phone FROM kyc_sessions WHERE id = $1::uuid AND status = 'APPROVED' LIMIT 1",
    )
    .bind(&payload.session_id)
    .fetch_optional(&state.pg_pool)
    .await;

    let (address, phone) = match row {
        Ok(Some(r)) => {
            let addr: String = match r.try_get("provisioned_chain_address") {
                Ok(a) => a,
                Err(e) => {
                    eprintln!("[set-pin] try_get provisioned_chain_address error: {:?}", e);
                    return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid session"})));
                }
            };
            let phone: String = match r.try_get("phone") {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("[set-pin] try_get phone error: {:?}", e);
                    return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid session"})));
                }
            };
            (addr, phone)
        }
        Ok(None) => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid or unapproved session"}))),
        Err(e) => {
            eprintln!("[set-pin] DB error: {:?}", e);
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Database error"})));
        }
    };

    let pin_hash = crate::crypto::hash_transaction_pin(&address, &payload.pin, &state.encryption_key);
    let res = sqlx::query(
        "UPDATE cards SET pin_hash = $1, pin_attempts = 0, pin_locked_until = NULL WHERE chain_address = $2",
    )
    .bind(&pin_hash)
    .bind(&address)
    .execute(&state.pg_pool)
    .await;

    if let Err(_) = res {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Failed to set PIN"})));
    }

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
        })),
    )
}
