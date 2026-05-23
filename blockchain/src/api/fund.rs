use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

use crate::api::middleware::{log_api_call, require_account_token};
use crate::api::AppState;
use crate::crypto::decrypt_aes256_gcm;
use serde::Deserialize;
use sqlx::Row;

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct FundPayload {
    /// Amount in TND (e.g. 50.0 = 50 TND). Converted to millimes internally.
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
    if let Err(_e) = require_account_token(&state, &headers, &address).await {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Authentication required to fund an account"})),
        );
    }

    // ─── Rate limiting ───
    let ip = crate::api::middleware::extract_client_ip(&headers);
    if let Err(limit_err) = crate::api::middleware::check_auth_rate_limit(
        &state, &ip, "/accounts/:address/fund", 10, 15,
    ).await {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": format!("Rate limited. Retry after {}s.", match limit_err { crate::api::middleware::AuthError::TooManyRequests { retry_after_seconds } => retry_after_seconds, _ => 60 })})),
        );
    }

    // ─── Idempotency check ───
    let idem_key = headers
        .get("X-Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    if let Some(ref key) = idem_key {
        let key_hash = crate::crypto::sha256_hex(key.as_bytes());
        match sqlx::query(
            "SELECT response_body FROM idempotency_keys WHERE key_hash = $1 AND user_address = $2 AND endpoint = $3 AND expires_at > NOW() LIMIT 1"
        )
        .bind(&key_hash).bind(&address).bind("/accounts/:address/fund")
        .fetch_optional(&state.pg_pool).await
        {
            Ok(Some(row)) => {
                let cached: String = row.try_get("response_body").unwrap_or_default();
                if let Ok(val) = serde_json::from_str::<Value>(&cached) {
                    return (StatusCode::OK, Json(val));
                }
            }
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))),
            _ => {}
        }
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
    // Convert to millimes for integer-safe fee calculation
    let amount_millimes = (payload.amount * 1000.0).round() as i64;
    let fee_millimes = ((amount_millimes as f64 * 0.005).round() as i64).max(100); // min 0.100 TND = 100 millimes
    let credited_millimes = amount_millimes - fee_millimes;

    let _ = sqlx::query(
        "INSERT INTO funding_transactions (id, to_address, amount, fee, card_last4, status, created_at) VALUES ($1,$2,$3,$4,$5,'PENDING', NOW())",
    )
    .bind(&tx_id)
    .bind(&address)
    .bind(credited_millimes as f64)
    .bind(fee_millimes as f64)
    .bind(&payload.card_number[payload.card_number.len() - 4..])
    .execute(&state.pg_pool)
    .await;

    log_api_call(&state, None, "/accounts/:address/fund", "POST", 200).await;

    let response = json!({
        "transaction_id": tx_id,
        "amount_credited": credited_millimes,
        "fee": fee_millimes,
        "status": "PENDING",
        "estimated_confirmation": "~5 seconds"
    });

    // Store idempotency key for 24h
    if let Some(ref key) = idem_key {
        let key_hash = crate::crypto::sha256_hex(key.as_bytes());
        let _ = sqlx::query(
            "INSERT INTO idempotency_keys (key_hash, user_address, endpoint, response_body, status_code, expires_at)
             VALUES ($1, $2, $3, $4, 200, NOW() + INTERVAL '24 hours')
             ON CONFLICT DO NOTHING"
        )
        .bind(&key_hash).bind(&address).bind("/accounts/:address/fund")
        .bind(serde_json::to_string(&response).unwrap_or_default())
        .execute(&state.pg_pool).await;
    }

    (StatusCode::OK, Json(response))
}
