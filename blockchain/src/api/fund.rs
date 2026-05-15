use axum::{extract::State, Json, response::IntoResponse};
use crate::api::AppState;
use crate::crypto::decrypt_aes256_gcm;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
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

pub async fn fund(State(state): State<AppState>, axum::extract::Path(address): axum::extract::Path<String>, Json(payload): Json<FundPayload>) -> impl IntoResponse {
    // Validate amount
    if payload.amount < 1.0 || payload.amount > 10000.0 { return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"invalid_amount"}))) }
    // Validate Luhn via generator
    if !crate::generator::passes_luhn(&payload.card_number) { return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"invalid_card"}))) }

    // Look up card in postgres by last4
    let row = sqlx::query("SELECT id, owner_address, card_number, cvv FROM cards WHERE card_last4 = $1")
        .bind(&payload.card_number[payload.card_number.len()-4..])
        .fetch_optional(&state.pg_pool)
        .await
        .unwrap_or(None);
    if row.is_none() { return (axum::http::StatusCode::PAYMENT_REQUIRED, Json(serde_json::json!({"error":"CARD_DECLINED"}))) }

    // Decrypt stored card and CVV and verify match
    let r = row.unwrap();
    let owner_address: String = r.try_get("owner_address").unwrap_or_default();
    let enc_card: String = r.try_get("card_number").unwrap_or_default();
    let enc_cvv: String = r.try_get("cvv").unwrap_or_default();
    let stored_card = decrypt_aes256_gcm(&state.encryption_key, &enc_card).unwrap_or_default();
    let stored_cvv = decrypt_aes256_gcm(&state.encryption_key, &enc_cvv).unwrap_or_default();
    if stored_card != payload.card_number || stored_cvv != payload.cvv {
        return (axum::http::StatusCode::PAYMENT_REQUIRED, Json(serde_json::json!({"error":"CARD_DECLINED"})))
    }
    // Check owner balance
    // Create two blockchain transactions: fee and top-up
    // Insert funding_transactions record

    let tx_id = uuid::Uuid::new_v4().to_string();
    let fee = (payload.amount * 0.005).max(0.100);
    let amount_credited = payload.amount - fee;

    let _ = sqlx::query("INSERT INTO funding_transactions (id, to_address, amount, fee, card_last4, status, created_at) VALUES ($1,$2,$3,$4,$5,'PENDING', NOW())")
        .bind(&tx_id)
        .bind(address)
        .bind(amount_credited as f64)
        .bind(fee as f64)
        .bind(&payload.card_number[payload.card_number.len()-4..])
        .execute(&state.pg_pool)
        .await;

    (axum::http::StatusCode::OK, Json(serde_json::json!({"transaction_id": tx_id, "amount_credited": amount_credited, "fee": fee, "status":"PENDING", "estimated_confirmation":"~5 seconds"})))
}
