use axum::{extract::State, Json, extract::Multipart, response::IntoResponse};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use crate::api::AppState;
use crate::api::auth;
use crate::services::kyc_service::{KycService, LivenessOutcome};
use std::fs;

#[derive(Deserialize)]
pub struct InitPayload {
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub date_of_birth: String,
    pub cin_number: String,
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
        &payload.cin_number,
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
        Ok(()) => (axum::http::StatusCode::OK, Json(serde_json::json!({"session_id": payload.session_id, "next_step":"document_upload"}))),
        Err(_) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"INVALID_OTP"})))
    }
}

pub async fn upload_documents(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    // Expect fields: session_id, cin_front, cin_back, proof_of_address, address_line, delegation, governorate, postal_code
    let mut session_id = None;
    let mut cin_front_path = None;
    let mut cin_back_path = None;
    let mut proof_path = None;
    let mut address_line = String::new();
    let mut delegation = String::new();
    let mut governorate = String::new();
    let mut postal_code = String::new();

    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name == "session_id" {
            session_id = Some(field.text().await.unwrap_or_default());
            continue;
        }
        if name == "address_line" { address_line = field.text().await.unwrap_or_default(); continue; }
        if name == "delegation" { delegation = field.text().await.unwrap_or_default(); continue; }
        if name == "governorate" { governorate = field.text().await.unwrap_or_default(); continue; }
        if name == "postal_code" { postal_code = field.text().await.unwrap_or_default(); continue; }

        if let Some(fname) = field.file_name() {
            let sid = session_id.clone().unwrap_or_else(|| "unknown".to_string());
            let dir = format!("{}/kyc/{}", upload_base, sid);
            fs::create_dir_all(&dir).ok();
            let ext = fname.split('.').last().unwrap_or("jpg");
            let target = match name.as_str() {
                "cin_front" => format!("{}/cin_front.{}", dir, ext),
                "cin_back" => format!("{}/cin_back.{}", dir, ext),
                "proof_of_address" => format!("{}/address_proof.{}", dir, ext),
                _ => format!("{}/file_{}.{}", dir, name, ext),
            };
            let data = field.bytes().await.unwrap_or_default();
            tokio::fs::write(&target, &data).await.ok();
            if name=="cin_front" { cin_front_path = Some(target.clone()); }
            if name=="cin_back" { cin_back_path = Some(target.clone()); }
            if name=="proof_of_address" { proof_path = Some(target.clone()); }
        }
    }

    let session_id = match session_id { Some(s) => s, None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"missing session_id"}))) };
    let ksvc = KycService::new(state.pg_pool.clone());
    let res = ksvc.upload_documents(&session_id, cin_front_path.as_deref().unwrap_or(""), cin_back_path.as_deref().unwrap_or(""), proof_path.as_deref().unwrap_or(""), &address_line, &delegation, &governorate, &postal_code).await;
    match res {
        Ok(()) => (axum::http::StatusCode::OK, Json(serde_json::json!({"session_id": session_id, "next_step":"liveness_check"}))),
        Err(_) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"INVALID_DOCUMENTS"})))
    }
}

pub async fn liveness(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    let mut session_id = None;
    let mut liveness_path = None;
    let mut cin_front_path = None;
    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name=="session_id" { session_id = Some(field.text().await.unwrap_or_default()); continue; }
        if let Some(fname) = field.file_name() {
            let sid = session_id.clone().unwrap_or_else(|| "unknown".to_string());
            let dir = format!("{}/kyc/{}", upload_base, sid);
            tokio::fs::create_dir_all(&dir).await.ok();
            let ext = fname.split('.').last().unwrap_or("mp4");
            let target = if name=="liveness_video" { format!("{}/liveness.{}", dir, ext) } else if name=="cin_front" { format!("{}/cin_front.{}", dir, ext) } else { format!("{}/file_{}.{}", dir, name, ext) };
            let data = field.bytes().await.unwrap_or_default();
            tokio::fs::write(&target, &data).await.ok();
            if name=="liveness_video" { liveness_path = Some(target.clone()); }
            if name=="cin_front" { cin_front_path = Some(target.clone()); }
        }
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

    let ksvc = KycService::new(state.pg_pool.clone());
    let cinp = cin_front_path.unwrap_or(format!("{}/kyc/{}/cin_front.jpg", upload_base, session_id));
    let livep = match liveness_path {
        Some(p) => p,
        None => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error":"missing liveness_video"})),
            )
                .into_response();
        }
    };

    let result = ksvc.run_liveness(&session_id, &cinp, &livep).await;
    match result {
        Ok(LivenessOutcome::Approved) => match auth::provision_kyc_session_if_needed(&state, &session_id).await {
            Ok(summary) => (
                axum::http::StatusCode::OK,
                Json(serde_json::json!({
                    "session_id": session_id,
                    "status": "APPROVED",
                    "address": summary.address,
                    "rib": summary.rib,
                    "iban": summary.iban,
                    "card_last4": summary.card_last4,
                    "card_expiry": summary.card_expiry,
                    "card_type": summary.card_type,
                })),
            ).into_response(),
            Err((sc, j)) => (sc, j).into_response(),
        },
        Ok(LivenessOutcome::Failed { reason }) => (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({"status":"LIVENESS_FAILED","reason": reason})),
        )
            .into_response(),
        Err(_) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error":"LIVENESS_ERROR"})),
        )
            .into_response(),
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
