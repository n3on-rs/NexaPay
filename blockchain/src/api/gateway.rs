use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use printpdf;

use crate::api::auth::{
    generate_otp_code, hash_otp, is_valid_otp, login_phone_variants, mask_phone_hint, send_otp_sms,
    verify_pin,
};
use crate::api::middleware::{
    auth_error_response, has_permission, log_api_call, require_api_key, try_api_key, ApiPrincipal,
};
use crate::api::AppState;
use crate::crypto::sha256_hex;

#[derive(Debug, Deserialize)]
pub struct CreateIntentRequest {
    pub amount: Option<u64>,
    pub currency: Option<String>,
    pub description: Option<String>,
    pub customer_email: Option<String>,
    pub customer_name: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
    pub variable_amount: Option<bool>,
    pub accepted_methods: Option<Vec<String>>,
    pub expiry: Option<String>,
    pub max_usages: Option<i32>,
    pub order_id: Option<String>,
    pub checkout_theme: Option<String>,
    pub success_url: Option<String>,
    pub webhook_url: Option<String>,
    pub success_webhook_url: Option<String>,
    pub failure_webhook_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmIntentRequest {
    pub method: Option<String>,
    pub card_number: Option<String>,
    pub expiry_month: Option<String>,
    pub expiry_year: Option<String>,
    pub cvv: Option<String>,
    pub pin: Option<String>,
    pub card_holder_name: Option<String>,
    pub phone: Option<String>,
    pub otp: Option<String>,
    pub amount: Option<i64>,
    pub customer_first_name: Option<String>,
    pub customer_last_name: Option<String>,
    pub customer_phone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RefundRequest {
    pub intent_id: String,
    pub amount: Option<u64>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayoutRequest {
    pub amount: u64,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWebhookRequest {
    pub url: String,
    pub event_types: Option<Vec<String>>,
}

#[allow(dead_code)]
pub async fn gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let successful = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let failed = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status = 'failed'",
        merchant_id,
    )
    .await;
    let pending = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status = 'requires_confirmation'",
        merchant_id,
    )
    .await;

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/merchants/stats",
        "GET",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "payments": {
            "succeeded": successful,
            "failed": failed,
            "pending": pending
        },
        "totals": {
            "gross": gross,
            "refunded": refunded,
            "available": (gross - refunded - payouts).max(0)
        }
    })))
}

pub async fn create_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIntentRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "intents:write") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot create intents",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let amount = payload.amount.unwrap_or(0);
    if amount == 0 && payload.amount.is_some() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Amount must be greater than 0",
        ));
    }

    if let Some(idempotency_key) = payload.idempotency_key.as_ref() {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT intent_id, amount, currency, status, description, created_at
             FROM payment_intents WHERE merchant_id = $1 AND idempotency_key = $2 LIMIT 1",
        )
        .bind(merchant_id)
        .bind(idempotency_key)
        .fetch_optional(&state.pg_pool)
        .await
        {
            let intent_id: String = row.try_get("intent_id").unwrap_or_default();
            let amount: i64 = row.try_get("amount").unwrap_or(0);
            let currency: String = row
                .try_get("currency")
                .unwrap_or_else(|_| "TND".to_string());
            let status: String = row
                .try_get("status")
                .unwrap_or_else(|_| "requires_confirmation".to_string());
            let description: Option<String> = row.try_get("description").ok();

            return Ok(Json(json!({
                "success": true,
                "intent_id": intent_id,
                "amount": amount,
                "currency": currency,
                "status": status,
                "description": description,
                "checkout_url": format!("{}/checkout/{}", resolve_portal_url(&state, &headers), intent_id),
                "reused": true
            })));
        }
    }

    let intent_id = format!(
        "pi_{}",
        &sha256_hex(format!("{}:{}", Uuid::new_v4(), now_ts()).as_bytes())[..16]
    );
    let currency = payload
        .currency
        .unwrap_or_else(|| "TND".to_string())
        .to_uppercase();

    let variable_amount = payload.variable_amount.unwrap_or(false);
    let accepted_methods = payload.accepted_methods.unwrap_or_else(|| vec!["wallet".to_string(), "bank_card".to_string()]);
    let checkout_theme = payload.checkout_theme.unwrap_or_else(|| "dark".to_string());
    let max_usages = payload.max_usages;
    let order_id = payload.order_id;
    let success_url = payload.success_url;
    let expiry_dt: Option<chrono::DateTime<chrono::Utc>> = payload.expiry.as_ref().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&chrono::Utc)));

    sqlx::query(
        "INSERT INTO payment_intents (intent_id, merchant_id, amount, currency, status, description, customer_email, customer_name, metadata, idempotency_key, payment_method, variable_amount, accepted_methods, expiry, max_usages, order_id, checkout_theme, success_url, webhook_url, success_webhook_url, failure_webhook_url)
         VALUES ($1, $2, $3, $4, 'requires_confirmation', $5, $6, $7, $8, $9, 'card', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)",
    )
    .bind(&intent_id)
    .bind(merchant_id)
    .bind(amount as i64)
    .bind(&currency)
    .bind(payload.description)
    .bind(payload.customer_email)
    .bind(payload.customer_name)
    .bind(payload.metadata)
    .bind(payload.idempotency_key)
    .bind(variable_amount)
    .bind(&accepted_methods)
    .bind(expiry_dt)
    .bind(max_usages)
    .bind(&order_id)
    .bind(&checkout_theme)
    .bind(&success_url)
    .bind(payload.webhook_url)
    .bind(payload.success_webhook_url)
    .bind(payload.failure_webhook_url)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| {
        eprintln!("CREATE_INTENT_ERROR: {:?}", e);
        api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create payment intent")
    })?;

    log_api_call(&state, Some(&principal), "/gateway/v1/intents", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "intent_id": intent_id,
        "status": "requires_confirmation",
        "amount": amount,
        "currency": currency,
        "checkout_url": format!("{}/checkout/{}", resolve_portal_url(&state, &headers), intent_id),
        "client_secret": sha256_hex(format!("{}:{}", intent_id, merchant_id).as_bytes()),
        "env": state.env,
    })))
}

pub async fn get_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "intents:read") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot read intents",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let row = sqlx::query(
        "SELECT intent_id, amount, currency, status, description, customer_email, customer_name, card_last4, card_brand, failure_reason, created_at, confirmed_at
         FROM payment_intents WHERE intent_id = $1 AND merchant_id = $2 LIMIT 1",
    )
    .bind(&intent_id)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found")),
    };

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/intents/:intent_id",
        "GET",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "intent_id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
        "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
        "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
        "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
        "customer_name": row.try_get::<Option<String>, _>("customer_name").ok().flatten(),
        "card_last4": row.try_get::<Option<String>, _>("card_last4").ok().flatten(),
        "card_brand": row.try_get::<Option<String>, _>("card_brand").ok().flatten(),
        "failure_reason": row.try_get::<Option<String>, _>("failure_reason").ok().flatten(),
        "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok(),
        "confirmed_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("confirmed_at").ok().flatten().map(|v| v.to_rfc3339()),
        "checkout_url": format!("{}/checkout/{}", resolve_portal_url(&state, &headers), intent_id),
        "client_secret": sha256_hex(format!("{}:{}", intent_id, merchant_id).as_bytes())
    })))
}

pub async fn delete_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "intents:write") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot delete intents",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let result = sqlx::query(
        "DELETE FROM payment_intents WHERE intent_id = $1 AND merchant_id = $2"
    )
    .bind(&intent_id)
    .bind(merchant_id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if result.rows_affected() == 0 {
        return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found"));
    }

    log_api_call(&state, Some(&principal), "/gateway/v1/intents/:intent_id", "DELETE", 200).await;

    Ok(Json(json!({
        "success": true,
        "deleted": intent_id,
        "env": state.env,
    })))
}

pub async fn create_session(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query(
        "SELECT intent_id, merchant_id, amount, currency, description, customer_email, customer_name, variable_amount, accepted_methods, max_usages, order_id, checkout_theme, success_url
         FROM payment_intents
         WHERE intent_id = $1 LIMIT 1",
    )
    .bind(&intent_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment link not found")),
    };

    let merchant_id: Uuid = row
        .try_get("merchant_id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid merchant"))?;
    let amount: i64 = row.try_get::<i64, _>("amount").unwrap_or(0);
    let currency: String = row
        .try_get::<String, _>("currency")
        .unwrap_or_else(|_| "TND".to_string());
    let description: Option<String> = row.try_get("description").ok();
    let variable_amount: bool = row.try_get::<bool, _>("variable_amount").unwrap_or(false);
    let accepted_methods: Vec<String> = row
        .try_get::<Vec<String>, _>("accepted_methods")
        .unwrap_or_else(|_| vec!["wallet".to_string(), "bank_card".to_string()]);
    let max_usages: Option<i32> = row.try_get("max_usages").ok().flatten();
    let order_id: Option<String> = row.try_get("order_id").ok().flatten();
    let checkout_theme: String = row
        .try_get::<String, _>("checkout_theme")
        .unwrap_or_else(|_| "dark".to_string());
    let success_url: Option<String> = row.try_get("success_url").ok().flatten();
    let customer_email: Option<String> = row.try_get("customer_email").ok().flatten();
    let customer_name: Option<String> = row.try_get("customer_name").ok().flatten();

    let new_intent_id = format!(
        "pi_{}",
        &sha256_hex(format!("{}:{}", Uuid::new_v4(), now_ts()).as_bytes())[..16]
    );

    sqlx::query(
        "INSERT INTO payment_intents (intent_id, merchant_id, amount, currency, status, description, customer_email, customer_name, payment_method, variable_amount, accepted_methods, max_usages, order_id, checkout_theme, success_url, parent_intent_id)
         VALUES ($1, $2, $3, $4, 'requires_confirmation', $5, $6, $7, 'card', $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(&new_intent_id)
    .bind(merchant_id)
    .bind(amount)
    .bind(&currency)
    .bind(&description)
    .bind(&customer_email)
    .bind(&customer_name)
    .bind(variable_amount)
    .bind(&accepted_methods)
    .bind(max_usages)
    .bind(&order_id)
    .bind(&checkout_theme)
    .bind(&success_url)
    .bind(&intent_id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session"))?;

    let merchant_name: String = sqlx::query(
        "SELECT COALESCE(ap.business_name, d.email) as name
         FROM developers d
         LEFT JOIN agent_profiles ap ON ap.user_address = d.owner_user_address
         WHERE d.id = $1 LIMIT 1"
    )
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<String, _>("name").ok())
    .unwrap_or_else(|| "NexaPay Merchant".to_string());

    let portal_url = resolve_portal_url(&state, &headers);

    Ok(Json(json!({
        "success": true,
        "intent_id": new_intent_id,
        "parent_intent_id": intent_id,
        "amount": amount,
        "currency": currency,
        "status": "requires_confirmation",
        "description": description,
        "variable_amount": variable_amount,
        "accepted_methods": accepted_methods,
        "checkout_url": format!("{}/checkout/{}", portal_url, new_intent_id),
        "agent_name": merchant_name,
        "customer_email": customer_email,
        "customer_name": customer_name,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "env": state.env,
    })))
}

pub async fn get_intent_public(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query(
        "SELECT intent_id, merchant_id, amount, currency, status, description,
                customer_email, customer_name, card_last4, card_brand,
                created_at, confirmed_at, variable_amount, accepted_methods,
                expiry, max_usages, used_count, order_id, checkout_theme,
                success_url
         FROM payment_intents
         WHERE intent_id = $1 LIMIT 1",
    )
    .bind(&intent_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found")),
    };

    let merchant_id: Uuid = row
        .try_get("merchant_id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid merchant"))?;

    let merchant_name: String = sqlx::query(
        "SELECT COALESCE(ap.business_name, d.email) as name
         FROM developers d
         LEFT JOIN agent_profiles ap ON ap.user_address = d.owner_user_address
         WHERE d.id = $1 LIMIT 1"
    )
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<String, _>("name").ok())
    .unwrap_or_else(|| "NexaPay Merchant".to_string());

    let status: String = row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string());

    Ok(Json(json!({
        "success": true,
        "intent_id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
        "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
        "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
        "status": status,
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
        "customer_name": row.try_get::<Option<String>, _>("customer_name").ok().flatten(),
        "card_last4": row.try_get::<Option<String>, _>("card_last4").ok().flatten(),
        "card_brand": row.try_get::<Option<String>, _>("card_brand").ok().flatten(),
        "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok(),
        "confirmed_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("confirmed_at").ok().flatten().map(|v| v.to_rfc3339()),
        "variable_amount": row.try_get::<bool, _>("variable_amount").unwrap_or(false),
        "accepted_methods": row.try_get::<Vec<String>, _>("accepted_methods").unwrap_or_else(|_| vec!["wallet".to_string(), "bank_card".to_string()]),
        "expiry": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("expiry").ok().flatten().map(|v| v.to_rfc3339()),
        "max_usages": row.try_get::<Option<i32>, _>("max_usages").ok().flatten(),
        "used_count": row.try_get::<i32, _>("used_count").unwrap_or(0),
        "order_id": row.try_get::<Option<String>, _>("order_id").ok().flatten(),
        "checkout_theme": row.try_get::<String, _>("checkout_theme").unwrap_or_else(|_| "dark".to_string()),
        "success_url": row.try_get::<Option<String>, _>("success_url").ok().flatten(),
        "agent_name": merchant_name,
        "checkout_url": format!("{}/checkout/{}", resolve_portal_url(&state, &headers), intent_id),
        "env": state.env,
    })))
}

pub async fn list_intents(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let rows = sqlx::query(
        "SELECT id, intent_id, amount, currency, status, description, customer_email, customer_name, card_last4, card_brand, failure_reason, created_at, confirmed_at, used_count, max_usages
         FROM payment_intents
         WHERE merchant_id = $1 AND parent_intent_id IS NULL AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let intents: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let intent_id = row.try_get::<String, _>("intent_id").unwrap_or_default();
            json!({
                "id": row.try_get::<String, _>("id").unwrap_or_default(),
                "intent_id": intent_id,
                "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
                "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
                "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
                "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
                "customer_name": row.try_get::<Option<String>, _>("customer_name").ok().flatten(),
                "card_last4": row.try_get::<Option<String>, _>("card_last4").ok().flatten(),
                "card_brand": row.try_get::<Option<String>, _>("card_brand").ok().flatten(),
                "failure_reason": row.try_get::<Option<String>, _>("failure_reason").ok().flatten(),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok(),
                "confirmed_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("confirmed_at").ok().flatten().map(|v| v.to_rfc3339()),
                "used_count": row.try_get::<i32, _>("used_count").unwrap_or(0),
                "max_usages": row.try_get::<Option<i32>, _>("max_usages").ok().flatten(),
                "pay_url": format!("{}/checkout/{}", resolve_portal_url(&state, &headers), intent_id),
            })
        })
        .collect();

    log_api_call(&state, Some(&principal), "/gateway/v1/intents", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "intents": intents,
    })))
}

pub async fn confirm_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<ConfirmIntentRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let optional_principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let request_ip = extract_request_ip(&headers);
    enforce_confirm_attempt_limit(&state, &request_ip).await?;

    let row = sqlx::query(
        "SELECT id, merchant_id, amount, currency, status, description, customer_email, created_at
         FROM payment_intents WHERE intent_id = $1 LIMIT 1",
    )
    .bind(&intent_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found")),
    };

    let intent_uuid: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid intent row"))?;
    let merchant_id: Uuid = row
        .try_get("merchant_id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid intent owner"))?;
    let status: String = row
        .try_get("status")
        .unwrap_or_else(|_| "requires_confirmation".to_string());
    let variable_amount: bool = row.try_get::<bool, _>("variable_amount").unwrap_or(false);
    let db_amount: i64 = row.try_get::<i64, _>("amount").unwrap_or(0);
    let final_amount = if variable_amount {
        payload.amount.unwrap_or(db_amount)
    } else {
        db_amount
    };
    let created_at: chrono::DateTime<chrono::Utc> = row.try_get("created_at").map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid intent created_at",
        )
    })?;

    let session_limit = chrono::Duration::minutes(state.payment_session_minutes);
    if chrono::Utc::now() > created_at + session_limit {
        let _ = sqlx::query(
            "UPDATE payment_intents SET status = 'failed', failure_reason = 'session_expired', updated_at = NOW() WHERE id = $1"
        )
        .bind(intent_uuid)
        .execute(&state.pg_pool)
        .await;

        return Err(api_error(
            StatusCode::BAD_REQUEST,
            &format!("Payment session has expired ({} minutes limit).", state.payment_session_minutes),
        ));
    }

    if status == "succeeded" {
        return Ok(Json(json!({
            "success": true,
            "intent_id": intent_id,
            "status": status,
            "redirect_url": format!("{}/payment/success?intent_id={}&status=succeeded", resolve_portal_url(&state, &headers), intent_id)
        })));
    }

    if status == "refunded" {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Intent already refunded",
        ));
    }

    let (approved, failure_reason, card_last4, card_brand, auto_first_name, auto_last_name) = if payload.method.as_deref() == Some("wallet") {
        let phone = payload.phone.as_deref().unwrap_or("").trim();
        let pin = payload.pin.as_deref().unwrap_or("").trim();

        if phone.is_empty() || pin.is_empty() {
            return Err(api_error(StatusCode::BAD_REQUEST, "Phone and PIN are required for wallet payment"));
        }

        let (n11, n8) = login_phone_variants(phone).ok_or_else(|| {
            api_error(StatusCode::BAD_REQUEST, "Invalid phone (8 digits or +216 / 216 prefix)")
        })?;

        let user_row = sqlx::query(
            "SELECT chain_address, cin, phone, full_name FROM users WHERE phone = $1 OR phone = $2 LIMIT 1",
        )
        .bind(&n11)
        .bind(&n8)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

        let user_row = match user_row {
            Some(r) => r,
            None => return Err(api_error(StatusCode::UNAUTHORIZED, "Account not found")),
        };

        let chain_address: String = user_row
            .try_get("chain_address")
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
        let cin: String = user_row
            .try_get("cin")
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
        let user_phone: String = user_row
            .try_get("phone")
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
        let user_full_name: String = user_row
            .try_get("full_name")
            .unwrap_or_else(|_| String::new());

        if let Some(otp_code) = payload.otp.as_deref() {
            // Step 2: verify OTP
            if !is_valid_otp(otp_code) {
                return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
            }

            let otp_row = sqlx::query(
                "SELECT id, otp_hash, expires_at, used FROM login_otps WHERE user_address = $1 AND used = FALSE ORDER BY created_at DESC LIMIT 1",
            )
            .bind(&chain_address)
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

            let otp_row = match otp_row {
                Some(r) => r,
                None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired OTP")),
            };

            let otp_id: Uuid = otp_row
                .try_get("id")
                .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
            let stored_hash: String = otp_row
                .try_get("otp_hash")
                .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
            let expires_at: chrono::DateTime<chrono::Utc> = otp_row
                .try_get("expires_at")
                .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
            let used: bool = otp_row
                .try_get("used")
                .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

            if used || Utc::now() > expires_at {
                return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid or expired OTP"));
            }

            let provided_hash = hash_otp(&cin, otp_code, &state.encryption_key);
            if stored_hash != provided_hash {
                return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
            }

            let _ = sqlx::query("UPDATE login_otps SET used = TRUE WHERE id = $1")
                .bind(otp_id)
                .execute(&state.pg_pool)
                .await;

            let name_parts: Vec<&str> = user_full_name.split_whitespace().collect();
            let auto_first = name_parts.first().map(|s| s.to_string());
            let auto_last = if name_parts.len() > 1 { name_parts.last().map(|s| s.to_string()) } else { None };

            // Deduct from payer's chain wallet: transfer to SYSTEM
            // (merchant balance is tracked in Postgres, settled on withdrawal)
            let pay_amount = final_amount as u64;
            {
                let mut chain = state.chain.lock().await;
                if let Some(payer_acc) = chain.get_account(&chain_address) {
                    if payer_acc.balance >= pay_amount {
                        let tx_hash = sha256_hex(
                            format!("{}:SYSTEM:{}:{}", chain_address, pay_amount, crate::chain::now_ts()).as_bytes(),
                        );
                        let tx = crate::block::Transaction {
                            id: Uuid::new_v4().to_string(),
                            tx_type: crate::block::TxType::Transfer,
                            from: chain_address.clone(),
                            to: "SYSTEM".to_string(),
                            amount: pay_amount,
                            fee: 0,
                            timestamp: crate::chain::now_ts(),
                            signature: String::new(),
                            memo: format!("Wallet payment: {}", intent_id),
                            hash: tx_hash.clone(),
                        };
                        if let Err(e) = chain.apply_transaction(&tx) {
                            tracing::warn!("Wallet payment apply_transaction failed: {:?}", e);
                        }
                        chain.add_pending_transaction(tx);
                    }
                }
            }

            (true, None, "••••".to_string(), "wallet", auto_first, auto_last)
        } else {
            // Step 1: verify PIN, then send OTP
            verify_pin(&state, &chain_address, pin).await.map_err(|(s, j)| (s, HeaderMap::new(), j))?;

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
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save OTP"))?;

            let _ = send_otp_sms(&state, &user_phone, &otp).await;

            let mut dev_otp: Option<String> = None;
            let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
            if (state.env == "development" || state.env == "sandbox") && dev_show == "true" {
                dev_otp = Some(otp.clone());
            }

            log_api_call(&state, optional_principal.as_ref(), "/gateway/v1/intents/:intent_id/confirm", "POST", 200).await;

            return Ok(Json(json!({
                "success": true,
                "step": "otp_required",
                "phone_hint": mask_phone_hint(&user_phone),
                "dev_otp": dev_otp,
                "intent_id": intent_id,
            })));
        }
    } else {
        // Card payment flow
        let card_number_clean = payload.card_number.as_deref().unwrap_or("").replace(' ', "");
        let cvv = payload.cvv.as_deref().unwrap_or("");
        let card_valid = is_luhn_valid(&card_number_clean) && cvv.len() >= 3;

        let card_last4 = card_number_clean
            .chars()
            .rev()
            .take(4)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>();

        let card_brand = if card_number_clean.starts_with('4') {
            "visa"
        } else if card_number_clean.starts_with('5') {
            "mastercard"
        } else {
            "unknown"
        };

        let (approved, failure_reason) = if state.env == "sandbox" {
            let test_card = sqlx::query(
                "SELECT behavior FROM sandbox_test_cards WHERE number = $1 LIMIT 1"
            )
            .bind(&card_number_clean)
            .fetch_optional(&state.pg_pool)
            .await
            .ok()
            .flatten();

            match test_card {
                Some(tc) => {
                    let behavior: String = tc.try_get("behavior").unwrap_or_else(|_| "declined".to_string());
                    match behavior.as_str() {
                        "success" => (true, None),
                        "declined" => (false, Some("card_declined")),
                        "insufficient_funds" => (false, Some("insufficient_funds")),
                        _ => (false, Some("card_declined")),
                    }
                }
                None => {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        HeaderMap::new(),
                        Json(json!({
                            "success": false,
                            "error": "INVALID_TEST_CARD",
                            "message": "In sandbox mode, only test cards are accepted.",
                            "env": state.env,
                        }))
                    ));
                }
            }
        } else {
            let test_card_result = evaluate_test_card(&card_number_clean, payload.pin.as_deref());
            let expiry_month = payload.expiry_month.as_deref().unwrap_or("");
            let expiry_year = payload.expiry_year.as_deref().unwrap_or("");
            let card_holder_name = payload.card_holder_name.as_deref().unwrap_or("");
            let app = test_card_result.unwrap_or(
                card_valid
                    && card_number_clean.len() >= 15
                    && expiry_month.parse::<u32>().ok().map(|m| (1..=12).contains(&m)).unwrap_or(false)
                    && expiry_year.len() == 4
                    && card_holder_name.trim().len() >= 3,
            );
            let fr = if app {
                None
            } else {
                if test_card_result == Some(false) {
                    Some("test_card_forced_decline")
                } else {
                    Some("card_validation_failed_or_pin_declined")
                }
            };
            (app, fr)
        };
        (approved, failure_reason, card_last4, card_brand, None, None)
    };

    let final_status = if approved { "succeeded" } else { "failed" };

    let customer_first_name = payload.customer_first_name.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
        .or(auto_first_name);
    let customer_last_name = payload.customer_last_name.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
        .or(auto_last_name);
    let customer_phone = payload.customer_phone.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    sqlx::query(
        "UPDATE payment_intents
         SET status = $1,
             card_last4 = $2,
             card_brand = $3,
             failure_reason = $4,
             amount = $5,
             confirm_attempts = confirm_attempts + 1,
             used_count = CASE WHEN $1 = 'succeeded' THEN used_count + 1 ELSE used_count END,
             confirmed_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE confirmed_at END,
             customer_first_name = COALESCE($7, customer_first_name),
             customer_last_name = COALESCE($8, customer_last_name),
             customer_phone = COALESCE($9, customer_phone),
             updated_at = NOW()
         WHERE id = $6",
    )
    .bind(final_status)
    .bind(card_last4)
    .bind(card_brand)
    .bind(failure_reason)
    .bind(final_amount)
    .bind(intent_uuid)
    .bind(&customer_first_name)
    .bind(&customer_last_name)
    .bind(&customer_phone)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update intent"))?;

    // Also increment parent intent used_count if this is a session
    if approved {
        let _ = sqlx::query(
            "UPDATE payment_intents
             SET used_count = used_count + 1,
                 updated_at = NOW()
             WHERE intent_id = (SELECT parent_intent_id FROM payment_intents WHERE id = $1)
               AND parent_intent_id IS NULL"
        )
        .bind(intent_uuid)
        .execute(&state.pg_pool)
        .await;
    }

    let event_type = if approved {
        "payment_intent.succeeded"
    } else {
        "payment_intent.failed"
    };

    let payload_json = json!({
        "id": intent_id,
        "event": event_type,
        "status": final_status,
        "merchant_id": merchant_id,
        "amount": final_amount,
        "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten()
    });

    dispatch_webhooks_for_intent(&state, merchant_id, event_type, &payload_json, Some(&intent_id)).await;

    // SSE notification to agent dashboard
    if approved {
        if let Ok(Some(dev_row)) = sqlx::query(
            "SELECT user_address FROM developers WHERE id = $1 LIMIT 1"
        )
        .bind(merchant_id)
        .fetch_optional(&state.pg_pool)
        .await
        {
            if let Ok(addr) = dev_row.try_get::<String, _>("user_address") {
                let event = json!({
                    "type": "payment_intent.succeeded",
                    "intent_id": intent_id,
                    "amount": final_amount,
                    "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
                    "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
                    "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                });
                crate::api::accounts::broadcast_event(&state, &addr, &event.to_string());
            }
        }
    }

    let endpoint = "/gateway/v1/intents/:intent_id/confirm";
    log_api_call(
        &state,
        optional_principal.as_ref(),
        endpoint,
        "POST",
        if approved { 200 } else { 402 },
    )
    .await;

    let redirect_status = if approved { "succeeded" } else { "failed" };

    Ok(Json(json!({
        "success": approved,
        "intent_id": intent_id,
        "status": final_status,
        "failure_reason": failure_reason,
        "env": state.env,
        "redirect_url": format!("{}/checkout/{}?status={}", resolve_portal_url(&state, &headers), intent_id, redirect_status),
        "receipt_pdf_url": if approved {
            format!("{}/gateway/v1/intents/{}/receipt/pdf", resolve_portal_url(&state, &headers), intent_id)
        } else { String::new() }
    })))
}

pub async fn download_payment_receipt_pdf(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query(
        "SELECT pi.intent_id, pi.amount, pi.currency, pi.status, pi.created_at,
                pi.customer_name, pi.card_brand, pi.card_last4,
                pi.description, d.company_name as merchant_name
         FROM payment_intents pi
         LEFT JOIN developers d ON d.id = pi.merchant_id
         WHERE pi.intent_id = $1 AND pi.status = 'succeeded' LIMIT 1"
    )
    .bind(&intent_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = row.ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Receipt not found"))?;

    let amount: i64 = row.try_get("amount").unwrap_or(0);
    let currency: String = row.try_get("currency").unwrap_or_else(|_| "TND".to_string());
    let status: String = row.try_get("status").unwrap_or_default();
    let created_at: chrono::DateTime<chrono::Utc> = row.try_get("created_at").unwrap_or_else(|_| chrono::Utc::now());
    let customer_name: String = row.try_get("customer_name").unwrap_or_default();
    let merchant_name: String = row.try_get("merchant_name").unwrap_or_else(|_| "NexaPay".to_string());
    let card_brand: String = row.try_get("card_brand").unwrap_or_default();
    let card_last4: String = row.try_get("card_last4").unwrap_or_default();
    let description: String = row.try_get("description").unwrap_or_default();

    let amount_display = format!("{:.3} {}", (amount as f64) / 1000.0, currency);
    let tnd = format!("{:.3}", (amount as f64) / 1000.0);

    // Generate professional invoice-style PDF receipt
    let (doc, page1, layer1) = printpdf::PdfDocument::new(
        "NexaPay Payment Receipt",
        printpdf::Mm(148.0), printpdf::Mm(210.0), // A5
        "Layer 1",
    );
    let font = doc.add_builtin_font(printpdf::BuiltinFont::Helvetica)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "PDF font error"))?;
    let font_bold = doc.add_builtin_font(printpdf::BuiltinFont::HelveticaBold)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "PDF font error"))?;

    let layer = doc.get_page(page1).get_layer(layer1);
    let mut y = printpdf::Mm(190.0);
    let left = printpdf::Mm(12.0);
    let right = printpdf::Mm(80.0);

    // Header
    layer.use_text("NEXAPAY", 18.0, left, y, &font_bold);
    y -= printpdf::Mm(6.0);
    layer.use_text("Payment Receipt", 10.0, left, y, &font);
    y -= printpdf::Mm(10.0);

    // Divider
    layer.use_text("──────────────────────────────────────────", 7.0, left, y, &font);
    y -= printpdf::Mm(8.0);

    // Merchant & Customer side by side
    layer.use_text("FROM", 7.0, left, y, &font_bold);
    layer.use_text("TO", 7.0, right, y, &font_bold);
    y -= printpdf::Mm(5.0);
    layer.use_text(&merchant_name, 9.0, left, y, &font);
    layer.use_text(&customer_name, 9.0, right, y, &font);
    y -= printpdf::Mm(5.0);
    layer.use_text("NexaPay Merchant", 7.0, left, y, &font);
    layer.use_text("Customer", 7.0, right, y, &font);
    y -= printpdf::Mm(10.0);

    // Divider
    layer.use_text("──────────────────────────────────────────", 7.0, left, y, &font);
    y -= printpdf::Mm(8.0);

    // Invoice details
    layer.use_text("RECEIPT DETAILS", 7.0, left, y, &font_bold);
    y -= printpdf::Mm(5.0);
    layer.use_text(&format!("Receipt No:  {}", intent_id), 7.0, left, y, &font);
    y -= printpdf::Mm(4.5);
    layer.use_text(&format!("Date:        {}", created_at.format("%d %b %Y — %H:%M UTC")), 7.0, left, y, &font);
    y -= printpdf::Mm(4.5);
    layer.use_text(&format!("Card:        {} ···· ···· ···· {}", card_brand, card_last4), 7.0, left, y, &font);
    y -= printpdf::Mm(4.5);
    if !description.is_empty() {
        layer.use_text(&format!("Description: {}", description), 7.0, left, y, &font);
        y -= printpdf::Mm(4.5);
    }
    y -= printpdf::Mm(6.0);

    // Amount box
    layer.use_text("──────────────────────────────────────────", 7.0, left, y, &font);
    y -= printpdf::Mm(6.0);
    layer.use_text("AMOUNT PAID", 7.0, left, y, &font_bold);
    y -= printpdf::Mm(2.0);
    layer.use_text(&format!("{} TND", tnd), 22.0, left, y, &font_bold);
    y -= printpdf::Mm(4.0);
    layer.use_text(&format!("({} {} total)", tnd, currency), 7.0, left, y, &font);
    y -= printpdf::Mm(8.0);
    layer.use_text("──────────────────────────────────────────", 7.0, left, y, &font);
    y -= printpdf::Mm(8.0);

    // Status and footer
    layer.use_text(&format!("Status: {}", status.to_uppercase()), 7.0, left, y, &font_bold);
    y -= printpdf::Mm(10.0);
    layer.use_text("Thank you for your payment.", 7.0, left, y, &font);
    y -= printpdf::Mm(4.0);
    layer.use_text("This is a computer-generated receipt.", 7.0, printpdf::Mm(10.0), y, &font);
    y -= printpdf::Mm(5.0);
    layer.use_text("Built by Glitch Inc — BackendGlitch Division", 7.0, printpdf::Mm(10.0), y, &font);

    let pdf_bytes = doc.save_to_bytes()
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "PDF generation failed"))?;

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert("Content-Type", "application/pdf".parse().unwrap());
    resp_headers.insert(
        "Content-Disposition",
        format!("attachment; filename=\"nexapay-receipt-{}.pdf\"", intent_id).parse().unwrap(),
    );

    Ok((StatusCode::OK, resp_headers, pdf_bytes))
}

pub async fn create_refund(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RefundRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "refunds:write") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot issue refunds",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let row = sqlx::query(
        "SELECT id, amount, status FROM payment_intents WHERE intent_id = $1 AND merchant_id = $2 LIMIT 1",
    )
    .bind(&payload.intent_id)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Intent not found")),
    };

    let intent_uuid: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Intent row error"))?;
    let original_amount = row.try_get::<i64, _>("amount").unwrap_or(0).max(0) as u64;
    let status: String = row.try_get("status").unwrap_or_default();

    if status != "succeeded" && status != "partially_refunded" {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Only succeeded intents can be refunded",
        ));
    }

    let already_refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE intent_id = $1::uuid AND status = 'succeeded'",
        intent_uuid,
    )
    .await
    .max(0) as u64;

    let refundable = original_amount.saturating_sub(already_refunded);
    if refundable == 0 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Intent is fully refunded",
        ));
    }

    let refund_amount = payload.amount.unwrap_or(refundable);
    if refund_amount == 0 || refund_amount > refundable {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Refund amount exceeds refundable balance",
        ));
    }

    let refund_id = format!(
        "rf_{}",
        &sha256_hex(format!("{}:{}", payload.intent_id, now_ts()).as_bytes())[..16]
    );

    sqlx::query(
        "INSERT INTO refunds (refund_id, intent_id, merchant_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'succeeded')",
    )
    .bind(&refund_id)
    .bind(intent_uuid)
    .bind(merchant_id)
    .bind(refund_amount as i64)
    .bind(payload.reason)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create refund"))?;

    let new_total_refunded = already_refunded + refund_amount;
    let new_status = if new_total_refunded >= original_amount {
        "refunded"
    } else {
        "partially_refunded"
    };

    sqlx::query("UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_status)
        .bind(intent_uuid)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to update intent status",
            )
        })?;

    dispatch_webhooks(
        &state,
        merchant_id,
        "payment_intent.refunded",
        json!({
            "intent_id": payload.intent_id,
            "refund_id": refund_id,
            "amount": refund_amount,
            "status": new_status
        }),
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/refunds", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "refund_id": refund_id,
        "intent_id": payload.intent_id,
        "amount": refund_amount,
        "status": "succeeded",
        "intent_status": new_status
    })))
}

pub async fn gateway_balance(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "balance:read") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot read balance",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;

    let pending = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status = 'requires_confirmation'",
        merchant_id,
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/balance", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "currency": "TND",
        "gross": gross,
        "refunded": refunded,
        "payouts": payouts,
        "pending": pending,
        "available": (gross - refunded - payouts).max(0)
    })))
}

#[derive(Debug, Deserialize)]
pub struct TransactionsQuery {
    pub status: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

pub async fn gateway_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TransactionsQuery>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "transactions:read")
        && !has_permission(&principal, "intents:read")
    {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot read transactions",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let status_filter = query.status.as_deref().map(|s| s.to_lowercase());
    let status_clause = match status_filter.as_deref() {
        Some("confirmed") => "AND status IN ('succeeded', 'confirmed')",
        Some("pending") => "AND status = 'pending'",
        Some("refunded") => "AND status = 'refunded'",
        Some("failed") => "AND status = 'failed'",
        _ => "",
    };

    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    let sql = format!(
        "SELECT intent_id, amount, currency, status, description, created_at,
                customer_first_name, customer_last_name, customer_phone,
                card_last4, card_brand
         FROM payment_intents
         WHERE merchant_id = $1 AND status != 'requires_confirmation' {}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3",
        status_clause
    );

    let intents_rows = sqlx::query(&sql)
        .bind(merchant_id)
        .bind(limit_i64)
        .bind(offset_i64)
        .fetch_all(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let intents = intents_rows
        .into_iter()
        .map(|row| {
            let first = row.try_get::<Option<String>, _>("customer_first_name").ok().flatten();
            let last = row.try_get::<Option<String>, _>("customer_last_name").ok().flatten();
            let name = match (first, last) {
                (Some(f), Some(l)) => Some(format!("{} {}", f, l)),
                (Some(f), None) => Some(f),
                (None, Some(l)) => Some(l),
                _ => None,
            };
            json!({
                "type": "intent",
                "id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
                "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
                "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
                "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|d| d.to_rfc3339()).ok(),
                "customer_name": name,
                "customer_phone": row.try_get::<Option<String>, _>("customer_phone").ok().flatten(),
                "card_last4": row.try_get::<Option<String>, _>("card_last4").ok().flatten(),
                "card_brand": row.try_get::<Option<String>, _>("card_brand").ok().flatten(),
            })
        })
        .collect::<Vec<_>>();

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/transactions",
        "GET",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "intents": intents,
        "page": page,
        "limit": limit,
    })))
}

pub async fn gateway_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PayoutRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "payouts:write") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot create payouts",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    if payload.amount == 0 || payload.destination.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "amount and destination are required",
        ));
    }

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let pending_payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;
    let available = (gross - refunded - pending_payouts).max(0) as u64;

    if payload.amount > available {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Insufficient available balance for payout",
        ));
    }

    let payout_id = format!(
        "po_{}",
        &sha256_hex(format!("{}:{}", merchant_id, now_ts()).as_bytes())[..16]
    );

    sqlx::query(
        "INSERT INTO payouts (payout_id, merchant_id, amount, destination, status)
         VALUES ($1, $2, $3, $4, 'queued')",
    )
    .bind(&payout_id)
    .bind(merchant_id)
    .bind(payload.amount as i64)
    .bind(&payload.destination)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create payout"))?;

    dispatch_webhooks(
        &state,
        merchant_id,
        "payout.created",
        json!({
            "payout_id": payout_id,
            "amount": payload.amount,
            "destination": payload.destination,
            "status": "queued"
        }),
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/payout", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "payout_id": payout_id,
        "status": "queued",
        "amount": payload.amount
    })))
}

pub async fn create_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWebhookRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot manage webhooks",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    if !payload.url.starts_with("https://") && !payload.url.starts_with("http://") {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "webhook URL must start with https:// or http://",
        ));
    }

    // SSRF protection: block internal/private hosts
    if let Ok(parsed) = reqwest::Url::parse(&payload.url) {
        let host = parsed.host_str().unwrap_or("");
        let host_lower = host.to_lowercase();
        if host_lower == "localhost"
            || host_lower == "127.0.0.1"
            || host_lower == "0.0.0.0"
            || host_lower == "[::1]"
            || host_lower == "[::]"
            || host_lower.starts_with("10.")
            || host_lower.starts_with("192.168.")
            || host_lower.starts_with("172.")
            || host_lower.ends_with(".local")
            || host_lower == "validator-0"
            || host_lower == "validator-1"
            || host_lower == "validator-2"
            || host_lower == "postgres"
            || host_lower == "validator-lb"
        {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "webhook URL must target a public host",
            ));
        }
        // Also check for 172.16.x.x - 172.31.x.x
        if host_lower.starts_with("172.") {
            if let Some(second) = host_lower.split('.').nth(1) {
                if let Ok(n) = second.parse::<u32>() {
                    if n >= 16 && n <= 31 {
                        return Err(api_error(
                            StatusCode::BAD_REQUEST,
                            "webhook URL must target a public host",
                        ));
                    }
                }
            }
        }
    }

    let event_types = payload
        .event_types
        .unwrap_or_else(|| {
            vec![
                "payment_intent.succeeded".to_string(),
                "payment_intent.failed".to_string(),
                "payment_intent.refunded".to_string(),
                "payout.created".to_string(),
            ]
        })
        .join(",");

    let secret = format!(
        "whsec_{}",
        &sha256_hex(format!("{}:{}:{}", merchant_id, payload.url, now_ts()).as_bytes())[..24]
    );

    let row = sqlx::query(
        "INSERT INTO webhooks (merchant_id, url, event_types, signing_secret, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id",
    )
    .bind(merchant_id)
    .bind(&payload.url)
    .bind(&event_types)
    .bind(&secret)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to create webhook",
        )
    })?;

    let webhook_id: Uuid = row.try_get("id").map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to parse webhook ID",
        )
    })?;

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks",
        "POST",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "id": webhook_id,
        "url": payload.url,
        "event_types": event_types.split(',').collect::<Vec<_>>(),
        "signing_secret": secret
    })))
}

pub async fn list_webhooks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot view webhooks",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;

    let rows = sqlx::query(
        "SELECT id, url, event_types, is_active, created_at
         FROM webhooks
         WHERE merchant_id = $1
         ORDER BY created_at DESC",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let webhooks = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.try_get::<Uuid, _>("id").map(|v| v.to_string()).unwrap_or_default(),
                "url": row.try_get::<String, _>("url").unwrap_or_default(),
                "event_types": row.try_get::<String, _>("event_types").unwrap_or_default().split(',').map(|s| s.to_string()).collect::<Vec<_>>(),
                "is_active": row.try_get::<bool, _>("is_active").unwrap_or(false),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    log_api_call(&state, Some(&principal), "/gateway/v1/webhooks", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "webhooks": webhooks
    })))
}

pub async fn webhook_deliveries(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot view webhook deliveries",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    ensure_webhook_ownership(&state, merchant_id, webhook_uuid).await?;

    let rows = sqlx::query(
        "SELECT event_type, response_status, response_body, success, attempt, delivered_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY delivered_at DESC
         LIMIT 100",
    )
    .bind(webhook_uuid)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let deliveries = rows
        .into_iter()
        .map(|row| {
            json!({
                "event_type": row.try_get::<String, _>("event_type").unwrap_or_default(),
                "response_status": row.try_get::<Option<i32>, _>("response_status").ok().flatten(),
                "response_body": row.try_get::<Option<String>, _>("response_body").ok().flatten(),
                "success": row.try_get::<bool, _>("success").unwrap_or(false),
                "attempt": row.try_get::<i32, _>("attempt").unwrap_or(1),
                "delivered_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("delivered_at").map(|v| v.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks/:id/deliveries",
        "GET",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "deliveries": deliveries
    })))
}

pub async fn test_webhook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot test webhooks",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    let webhook = sqlx::query(
        "SELECT id, url, signing_secret FROM webhooks WHERE id = $1 AND merchant_id = $2 AND is_active = TRUE LIMIT 1",
    )
    .bind(webhook_uuid)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let webhook = match webhook {
        Some(row) => row,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found")),
    };

    let url: String = webhook.try_get("url").unwrap_or_default();
    let signing_secret: String = webhook.try_get("signing_secret").unwrap_or_default();

    let event_payload = json!({
        "id": format!("evt_{}", &sha256_hex(format!("{}:{}", webhook_uuid, now_ts()).as_bytes())[..12]),
        "event": "webhook.test",
        "created_at": chrono::Utc::now().to_rfc3339(),
        "message": "NexaPay webhook test delivery"
    });

    let delivery = send_webhook(
        &state,
        webhook_uuid,
        &url,
        "webhook.test",
        &signing_secret,
        &event_payload,
    )
    .await;

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks/:id/test",
        "POST",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "delivery": delivery
    })))
}

pub async fn delete_webhook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot delete webhooks",
        ));
    }

    let merchant_id = merchant_id_from_principal(&state, &principal).await?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    let affected =
        sqlx::query("UPDATE webhooks SET is_active = FALSE WHERE id = $1 AND merchant_id = $2")
            .bind(webhook_uuid)
            .bind(merchant_id)
            .execute(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
            .rows_affected();

    if affected == 0 {
        return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found"));
    }

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks/:id",
        "DELETE",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "deleted": id
    })))
}

pub async fn get_environment(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let test_cards = if state.env == "sandbox" {
        let rows = sqlx::query(
            "SELECT brand, number, expiry_month, expiry_year, cvv, behavior, description FROM sandbox_test_cards ORDER BY id"
        )
        .fetch_all(&state.pg_pool)
        .await
        .unwrap_or_default();

        rows.into_iter()
            .map(|row| {
                json!({
                    "brand": row.try_get::<String, _>("brand").unwrap_or_default(),
                    "number": row.try_get::<String, _>("number").unwrap_or_default(),
                    "expiry_month": row.try_get::<i32, _>("expiry_month").unwrap_or(0),
                    "expiry_year": row.try_get::<i32, _>("expiry_year").unwrap_or(0),
                    "cvv": row.try_get::<String, _>("cvv").unwrap_or_default(),
                    "behavior": row.try_get::<String, _>("behavior").unwrap_or_default(),
                    "description": row.try_get::<String, _>("description").unwrap_or_default(),
                })
            })
            .collect::<Vec<Value>>()
    } else {
        vec![]
    };

    Ok(Json(json!({
        "success": true,
        "environment": state.env,
        "test_cards": test_cards,
    })))
}

fn evaluate_test_card(card_number: &str, pin: Option<&str>) -> Option<bool> {
    if card_number == "4242424242424242" {
        return Some(pin.unwrap_or("1234") == "1234");
    }
    if card_number == "5555555555554444" {
        return Some(pin.unwrap_or("1234") == "1234");
    }
    if card_number == "4000000000000002" {
        return Some(false);
    }
    None
}

async fn merchant_id_from_principal(
    _state: &AppState,
    principal: &ApiPrincipal,
) -> Result<Uuid, (StatusCode, HeaderMap, Json<Value>)> {
    match principal {
        ApiPrincipal::Developer { owner_id, .. } => {
            owner_id.ok_or_else(|| api_error(StatusCode::FORBIDDEN, "Developer workspace not found"))
        }
    }
}

async fn ensure_webhook_ownership(
    state: &AppState,
    merchant_id: Uuid,
    webhook_id: Uuid,
) -> Result<(), (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query("SELECT 1 FROM webhooks WHERE id = $1 AND merchant_id = $2 LIMIT 1")
        .bind(webhook_id)
        .bind(merchant_id)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if row.is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found"));
    }

    Ok(())
}

async fn dispatch_webhooks(state: &AppState, merchant_id: Uuid, event_type: &str, payload: Value) {
    dispatch_webhooks_for_intent(state, merchant_id, event_type, &payload, None).await;
}

async fn dispatch_webhooks_for_intent(
    state: &AppState,
    merchant_id: Uuid,
    event_type: &str,
    payload: &Value,
    intent_id: Option<&str>,
) {
    // 1. Registered webhooks for this merchant
    let rows = sqlx::query(
        "SELECT id, url, signing_secret FROM webhooks WHERE merchant_id = $1 AND is_active = TRUE",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await;

    let Ok(rows) = rows else { return; };

    for row in rows {
        let webhook_id: Uuid = match row.try_get("id") {
            Ok(v) => v,
            Err(_) => continue,
        };
        let url: String = row.try_get("url").unwrap_or_default();
        let secret: String = row.try_get("signing_secret").unwrap_or_default();
        let _ = send_webhook(state, webhook_id, &url, event_type, &secret, payload).await;
    }

    // 2. Intent-specific webhook URLs (success/failure)
    if let Some(iid) = intent_id {
        let intent_row = sqlx::query(
            "SELECT success_webhook_url, failure_webhook_url FROM payment_intents WHERE intent_id = $1 LIMIT 1",
        )
        .bind(iid)
        .fetch_optional(&state.pg_pool)
        .await;

        if let Ok(Some(r)) = intent_row {
            let is_success = event_type.contains("succeeded");
            let url: Option<String> = if is_success {
                r.try_get("success_webhook_url").ok()
            } else {
                r.try_get("failure_webhook_url").ok()
            };
            let fallback_url: Option<String> = r.try_get("webhook_url").ok();
            let target_url = url.or(fallback_url);

            if let Some(target) = target_url {
                if !target.is_empty() {
                    // Use a temp UUID for intent-level webhooks
                    let temp_id = Uuid::new_v4();
                    let _ = send_webhook(state, temp_id, &target, event_type, "", payload).await;
                }
            }
        }
    }
}

async fn send_webhook(
    state: &AppState,
    webhook_id: Uuid,
    url: &str,
    event_type: &str,
    secret: &str,
    payload: &Value,
) -> Value {
    let body = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());
    let timestamp = chrono::Utc::now().timestamp().to_string();

    // HMAC-SHA256 signature: t=timestamp,v1=hex_hmac
    let signature = {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
            .expect("HMAC can take any key size");
        mac.update(timestamp.as_bytes());
        mac.update(b".");
        mac.update(body.as_bytes());
        let result = mac.finalize();
        let code_bytes = result.into_bytes();
        format!("t={},v1={}", timestamp, hex::encode(code_bytes))
    };

    let result = state
        .http_client
        .post(url)
        .header("content-type", "application/json")
        .header("x-nexapay-event", event_type)
        .header("x-nexapay-signature", &signature)
        .body(body.clone())
        .send()
        .await;

    let (response_status, response_body, success) = match result {
        Ok(response) => {
            let status = response.status().as_u16() as i32;
            let text = response
                .text()
                .await
                .unwrap_or_else(|_| "<unable to read response body>".to_string());
            let ok = (200..300).contains(&status);
            (Some(status), Some(truncate_response(&text)), ok)
        }
        Err(err) => (None, Some(truncate_response(&err.to_string())), false),
    };

    let _ = sqlx::query(
        "INSERT INTO webhook_deliveries (webhook_id, event_type, payload, request_signature, response_status, response_body, success, attempt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1)",
    )
    .bind(webhook_id)
    .bind(event_type)
    .bind(payload)
    .bind(&signature)
    .bind(response_status)
    .bind(response_body.clone())
    .bind(success)
    .execute(&state.pg_pool)
    .await;

    // Retry failed webhooks up to 2 more times with backoff
    if !success {
        for attempt in 2..=3 {
            tokio::time::sleep(std::time::Duration::from_secs(attempt * 2)).await;
            let retry_result = state
                .http_client
                .post(url)
                .header("content-type", "application/json")
                .header("x-nexapay-event", event_type)
                .header("x-nexapay-signature", &signature)
                .body(body.clone())
                .send()
                .await;
            let retry_ok = retry_result.as_ref().map(|r| r.status().is_success()).unwrap_or(false);
            let retry_status = retry_result.as_ref().ok().map(|r| r.status().as_u16() as i32);
            let retry_body = match retry_result {
                Ok(r) => r.text().await.unwrap_or_default(),
                Err(e) => e.to_string(),
            };
            let _ = sqlx::query(
                "INSERT INTO webhook_deliveries (webhook_id, event_type, payload, request_signature, response_status, response_body, success, attempt)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(webhook_id).bind(event_type).bind(payload).bind(&signature)
            .bind(retry_status).bind(truncate_response(&retry_body)).bind(retry_ok).bind(attempt as i32)
            .execute(&state.pg_pool).await;
            if retry_ok { break; }
        }
    }

    json!({
        "event_type": event_type,
        "response_status": response_status,
        "response_body": response_body,
        "success": success
    })
}

fn truncate_response(raw: &str) -> String {
    if raw.len() <= 1000 {
        return raw.to_string();
    }
    format!("{}...", &raw[..1000])
}

fn resolve_portal_url(state: &AppState, headers: &HeaderMap) -> String {
    // For local development, extract portal URL from request headers
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        if origin.contains("localhost") || origin.contains("127.0.0.1") {
            return origin.to_string();
        }
    }
    if let Some(referer) = headers.get("referer").and_then(|v| v.to_str().ok()) {
        if referer.contains("localhost") || referer.contains("127.0.0.1") {
            if let Some(end) = referer.find("/agent") {
                return referer[..end].to_string();
            }
            if let Some(end) = referer.find("/checkout") {
                return referer[..end].to_string();
            }
            // Just take the scheme+host+port
            if let Some(idx) = referer.find("/") {
                if idx > 0 && &referer[idx..idx + 2] == "//" {
                    if let Some(next_slash) = referer[idx + 2..].find("/") {
                        return referer[..idx + 2 + next_slash].to_string();
                    }
                }
            }
        }
    }
    state.portal_base_url.clone()
}

fn extract_request_ip(headers: &HeaderMap) -> String {
    // Only trust X-Real-IP (set by nginx). X-Forwarded-For can be spoofed.
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

async fn enforce_confirm_attempt_limit(
    state: &AppState,
    ip: &str,
) -> Result<(), (StatusCode, HeaderMap, Json<Value>)> {
    let now = chrono::Utc::now().timestamp();
    let mut map = state.confirm_ip_attempts.lock().await;
    let entry = map.entry(ip.to_string()).or_default();
    entry.retain(|ts| now - *ts <= 300);

    if entry.len() >= 20 {
        return Err(api_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many confirmation attempts from this IP",
        ));
    }

    entry.push(now);
    Ok(())
}

async fn scalar_by_uuid(state: &AppState, query: &str, merchant_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(merchant_id)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn sum_amount_by_uuid(state: &AppState, query: &str, merchant_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(merchant_id)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

fn is_luhn_valid(number: &str) -> bool {
    if number.len() < 12 || !number.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;
    for ch in number.chars().rev() {
        let mut digit = ch.to_digit(10).unwrap_or(0);
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    sum % 10 == 0
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (
        status,
        HeaderMap::new(),
        Json(json!({ "success": false, "error": message })),
    )
}
