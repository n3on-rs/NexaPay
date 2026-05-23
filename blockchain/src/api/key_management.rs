use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{
    api_principal_kind, api_principal_owner_id, api_principal_prefix, audit_log,
    auth_error_response, can_manage_keys, create_structured_api_key, extract_api_key,
    log_api_call, permissions_to_csv, require_api_key, ApiPrincipal,
};
use crate::api::AppState;

#[derive(Debug, Deserialize)]
pub struct RotateKeyRequest {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RevokeKeyRequest {
    pub key_prefix: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePermissionsRequest {
    pub key_prefix: String,
    pub permissions: Vec<String>,
    pub rate_limit_per_minute: Option<i32>,
    pub daily_limit: Option<i32>,
}

pub async fn rotate_api_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RotateKeyRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !can_manage_keys(&principal) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot manage API keys",
        ));
    }

    let raw_key = extract_api_key(&headers).ok_or_else(|| {
        api_error(
            StatusCode::UNAUTHORIZED,
            "X-API-Key header is required for key rotation",
        )
    })?;
    let current_hash = crate::api::middleware::hash_api_key(&raw_key);

    let existing = sqlx::query(
        "SELECT id, owner_type, owner_id, permissions, rate_limit_per_minute, daily_limit, name
         FROM api_keys WHERE key_hash = $1 AND status = 'active' LIMIT 1",
    )
    .bind(&current_hash)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if let Some(row) = existing {
        let key_id: Uuid = row
            .try_get("id")
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Key row error"))?;
        let owner_type: String = row
            .try_get("owner_type")
            .unwrap_or_else(|_| api_principal_kind(&principal).to_string());
        let owner_id: Option<Uuid> = row.try_get("owner_id").ok();
        let existing_name: String = row
            .try_get("name")
            .unwrap_or_else(|_| "rotated-key".to_string());
        let permissions: String = row
            .try_get("permissions")
            .unwrap_or_else(|_| "*".to_string());
        let rate_limit_per_minute: i32 = row.try_get("rate_limit_per_minute").unwrap_or(60);
        let daily_limit: i32 = row.try_get("daily_limit").unwrap_or(10_000);

        let (new_key, new_hash, new_prefix, checksum) = create_structured_api_key(&owner_type);
        let key_name = payload.name.unwrap_or(existing_name);

        // Use a transaction so old key is only deleted if new key insertion succeeds
        let mut tx = state.pg_pool.begin().await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to start transaction"))?;

        sqlx::query("DELETE FROM api_keys WHERE id = $1")
            .bind(key_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to revoke previous key"))?;

        sqlx::query(
            "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')",
        )
        .bind(&owner_type)
        .bind(owner_id)
        .bind(&key_name)
        .bind(&new_hash)
        .bind(&new_prefix)
        .bind(&checksum)
        .bind(&permissions)
        .bind(rate_limit_per_minute.max(10))
        .bind(daily_limit.max(1000))
        .execute(&mut *tx)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to persist rotated key"))?;

        tx.commit().await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to commit key rotation"))?;

        sync_legacy_key_row(&state, &owner_type, owner_id, &new_hash, &new_prefix).await;

        log_api_call(&state, Some(&principal), "/api-keys/rotate", "POST", 200).await;
        let _ = audit_log(&state, None, "key_rotate", "api_key", None, &"".to_string(),
            None, "success", json!({"prefix": new_prefix})).await;
        return Ok(Json(json!({
            "success": true,
            "api_key": new_key,
            "api_key_prefix": new_prefix,
            "message": "API key rotated successfully"
        })));
    }

    rotate_legacy_key(&state, &principal, payload.name)
        .await
        .map(Json)
}

pub async fn revoke_api_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RevokeKeyRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !can_manage_keys(&principal) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot revoke API keys",
        ));
    }

    let owner_type = api_principal_kind(&principal).to_string();
    let owner_id = api_principal_owner_id(&principal);

    let affected = sqlx::query(
        "DELETE FROM api_keys
         WHERE prefix = $1
           AND owner_type = $2
           AND (($3::uuid IS NULL AND owner_id IS NULL) OR owner_id = $3::uuid)
           AND status = 'active'",
    )
    .bind(&payload.key_prefix)
    .bind(&owner_type)
    .bind(owner_id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .rows_affected();

    if affected == 0 {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "Active key not found for this owner",
        ));
    }

    log_api_call(&state, Some(&principal), "/api-keys/revoke", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "revoked_prefix": payload.key_prefix
    })))
}

pub async fn api_key_usage(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let prefix = api_principal_prefix(&principal);

    let today_calls = scalar_count(
        &state,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;
    let minute_calls = scalar_count(
        &state,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at >= NOW() - INTERVAL '1 minute'",
        &prefix,
    )
    .await;
    let failed_calls = scalar_count(
        &state,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND status_code >= 400 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;

    log_api_call(&state, Some(&principal), "/api-keys/usage", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "prefix": prefix,
        "today_calls": today_calls,
        "minute_calls": minute_calls,
        "failed_calls": failed_calls,
    })))
}

pub async fn update_api_key_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdatePermissionsRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !can_manage_keys(&principal) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot modify key permissions",
        ));
    }

    if payload.permissions.is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "At least one permission is required",
        ));
    }

    let owner_type = api_principal_kind(&principal).to_string();
    let owner_id = api_principal_owner_id(&principal);

    let permissions_csv = permissions_to_csv(&payload.permissions);

    let affected = sqlx::query(
        "UPDATE api_keys
         SET permissions = $1,
             rate_limit_per_minute = COALESCE($2, rate_limit_per_minute),
             daily_limit = COALESCE($3, daily_limit)
         WHERE prefix = $4
           AND owner_type = $5
           AND (($6::uuid IS NULL AND owner_id IS NULL) OR owner_id = $6::uuid)
           AND status = 'active'",
    )
    .bind(&permissions_csv)
    .bind(payload.rate_limit_per_minute.map(|v| v.max(10)))
    .bind(payload.daily_limit.map(|v| v.max(1000)))
    .bind(&payload.key_prefix)
    .bind(&owner_type)
    .bind(owner_id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .rows_affected();

    if affected == 0 {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "Active key not found for this owner",
        ));
    }

    log_api_call(&state, Some(&principal), "/api-keys/permissions", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "key_prefix": payload.key_prefix,
        "permissions": payload.permissions,
        "rate_limit_per_minute": payload.rate_limit_per_minute,
        "daily_limit": payload.daily_limit
    })))
}


async fn rotate_legacy_key(
    state: &AppState,
    principal: &ApiPrincipal,
    key_name: Option<String>,
) -> Result<Value, (StatusCode, HeaderMap, Json<Value>)> {
    let raw_prefix = api_principal_prefix(principal);
    let owner_type = api_principal_kind(principal);
    let owner_id = api_principal_owner_id(principal);

    let (new_key, new_hash, new_prefix, checksum) = create_structured_api_key(owner_type);
    let key_label = key_name.unwrap_or_else(|| "primary".to_string());

    let inserted = sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 60, 10000, 'active')",
    )
    .bind(owner_type)
    .bind(owner_id)
    .bind(&key_label)
    .bind(&new_hash)
    .bind(&new_prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions_for_owner(owner_type)))
    .execute(&state.pg_pool)
    .await;

    if inserted.is_err() {
        return Err(api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to create rotated key",
        ));
    }

    sync_legacy_key_by_prefix(state, owner_type, &raw_prefix, &new_hash, &new_prefix).await;

    Ok(json!({
        "success": true,
        "api_key": new_key,
        "api_key_prefix": new_prefix,
        "message": "Legacy key rotated and migrated"
    }))
}

async fn sync_legacy_key_row(
    state: &AppState,
    owner_type: &str,
    owner_id: Option<Uuid>,
    new_hash: &str,
    new_prefix: &str,
) {
    let legacy_prefix = new_prefix.chars().take(8).collect::<String>();

    if owner_type == "developer" {
        if let Some(owner_id) = owner_id {
            let _ = sqlx::query(
                "UPDATE developers SET api_key = $1, api_key_prefix = $2 WHERE id = $3",
            )
            .bind(new_hash)
            .bind(&legacy_prefix)
            .bind(owner_id)
            .execute(&state.pg_pool)
            .await;
        }
    }

}

async fn sync_legacy_key_by_prefix(
    state: &AppState,
    owner_type: &str,
    current_prefix: &str,
    new_hash: &str,
    new_prefix: &str,
) {
    let legacy_prefix = new_prefix.chars().take(8).collect::<String>();

    if owner_type == "developer" {
        let _ = sqlx::query(
            "UPDATE developers SET api_key = $1, api_key_prefix = $2 WHERE api_key_prefix = $3",
        )
        .bind(new_hash)
        .bind(&legacy_prefix)
        .bind(current_prefix)
        .execute(&state.pg_pool)
        .await;
    }

}

async fn scalar_count(state: &AppState, query: &str, prefix: &str) -> i64 {
    sqlx::query(query)
        .bind(prefix)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

#[allow(dead_code)]
async fn scalar_count_by_uuid(state: &AppState, query: &str, owner: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

fn default_permissions_for_owner(_owner_type: &str) -> Vec<String> {
    vec![
        "api_keys:manage".to_string(),
        "dev:docs".to_string(),
        "balance:read".to_string(),
        "transactions:read".to_string(),
        "payouts:write".to_string(),
        "refunds:write".to_string(),
        "intents:write".to_string(),
        "intents:read".to_string(),
        "webhooks:manage".to_string(),
    ]
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (
        status,
        HeaderMap::new(),
        Json(json!({ "success": false, "error": message })),
    )
}
