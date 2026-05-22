use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

use crate::api::middleware::{auth_error_response, log_api_call, require_account_token};
use crate::api::AppState;
use crate::crypto::decrypt_aes256_gcm;
use serde::Deserialize;
use sqlx::Row;

#[derive(Deserialize)]
pub struct FundPayload {
    pub amount: f64,
    pub card_number: String,
    pub card_expiry_month: u8,
    pub card_expiry_year: u16,
    pub card_holder_name: String,
    pub cvv: String,
}

pub async fn fund(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
    headers: HeaderMap,
    Json(payload): Json<FundPayload>,
) -> impl IntoResponse {
    // ─── Require authentication ───
    if let Err(e) = require_account_token(&state, &headers, &address).await {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Authentication required to fund an account"})),
        );
    }

    // Validate amount
    if payload.amount < 1.0 || payload.amount > 10000.0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_amount"})),
        );
    }
    // Validate Luhn
    if !crate::generator::passes_luhn(&payload.card_number) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_card"})),
        );
    }

    // Look up card in postgres by last4
    let row =
        sqlx::query("SELECT id, owner_address, card_number, cvv FROM cards WHERE card_last4 = $1")
            .bind(&payload.card_number[payload.card_number.len() - 4..])
            .fetch_optional(&state.pg_pool)
            .await
            .unwrap_or(None);

    if row.is_none() {
        return (
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({"error": "CARD_DECLINED"})),
        );
    }

    // Decrypt stored card and CVV and verify match
    let r = row.unwrap();
    let _owner_address: String = r.try_get("owner_address").unwrap_or_default();
    let enc_card: String = r.try_get("card_number").unwrap_or_default();
    let enc_cvv: String = r.try_get("cvv").unwrap_or_default();
    let stored_card = decrypt_aes256_gcm(&state.encryption_key, &enc_card).unwrap_or_default();
    let stored_cvv = decrypt_aes256_gcm(&state.encryption_key, &enc_cvv).unwrap_or_default();
    if stored_card != payload.card_number || stored_cvv != payload.cvv {
        return (
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({"error": "CARD_DECLINED"})),
        );
    }

    let tx_id = uuid::Uuid::new_v4().to_string();
    let fee = (payload.amount * 0.005).max(0.100);
    let amount_credited = payload.amount - fee;

    let _ = sqlx::query(
        "INSERT INTO funding_transactions (id, to_address, amount, fee, card_last4, status, created_at) VALUES ($1,$2,$3,$4,$5,'PENDING', NOW())",
    )
    .bind(&tx_id)
    .bind(&address)
    .bind(amount_credited as f64)
    .bind(fee as f64)
    .bind(&payload.card_number[payload.card_number.len() - 4..])
    .execute(&state.pg_pool)
    .await;

    log_api_call(&state, None, "/accounts/:address/fund", "POST", 200).await;

    (
        StatusCode::OK,
        Json(json!({
            "transaction_id": tx_id,
            "amount_credited": amount_credited,
            "fee": fee,
            "status": "PENDING",
            "estimated_confirmation": "~5 seconds"
        })),
    )
}
