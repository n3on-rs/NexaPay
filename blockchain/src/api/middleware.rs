use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::Json;
use chrono::Utc;
use jwt_simple::algorithms::MACLike;
use jwt_simple::prelude::{Claims, Duration};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::api::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClaims {
    pub address: String,
    pub cin_hash: String,
    #[serde(default = "default_session_id")]
    pub session_id: String,
}

fn default_session_id() -> String {
    String::new()
}

#[derive(Debug, Clone)]
pub enum ApiPrincipal {
    Developer {
        prefix: String,
        call_limit: i32,
        owner_id: Option<Uuid>,
        key_id: Option<Uuid>,
        permissions: Vec<String>,
        rate_limit_per_minute: i32,
        daily_limit: i32,
    },
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum AuthError {
    Unauthorized,
    Forbidden,
    TooManyRequests { retry_after_seconds: u64 },
    Internal,
}

pub fn hash_api_key(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn api_principal_prefix(principal: &ApiPrincipal) -> String {
    match principal {
        ApiPrincipal::Developer { prefix, .. } => prefix.clone(),
    }
}

pub fn api_principal_kind(principal: &ApiPrincipal) -> &'static str {
    match principal {
        ApiPrincipal::Developer { .. } => "developer",
    }
}

pub fn api_principal_owner_id(principal: &ApiPrincipal) -> Option<Uuid> {
    match principal {
        ApiPrincipal::Developer { owner_id, .. } => *owner_id,
    }
}

pub fn parse_permissions_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect()
}

pub fn permissions_to_csv(values: &[String]) -> String {
    values.join(",")
}

pub fn default_permissions(_owner_type: &str) -> Vec<String> {
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

pub fn has_permission(principal: &ApiPrincipal, needed: &str) -> bool {
    let permissions = match principal {
        ApiPrincipal::Developer {
            permissions,
            ..
        } => {
            permissions
        }
    };

    permissions.iter().any(|granted| {
        if granted == "*" || granted == needed {
            return true;
        }
        if let Some(prefix) = granted.strip_suffix(":*") {
            return needed.starts_with(&format!("{prefix}:"));
        }
        false
    })
}

pub fn create_structured_api_key(owner_type: &str) -> (String, String, String, String) {
    let owner_tag = owner_type.to_lowercase();
    let mut random = [0u8; 24];
    OsRng.fill_bytes(&mut random);
    let entropy = sha256_hex(&random);
    let token = &entropy[..24];
    let body = format!("nxp_{owner_tag}_{token}");
    let checksum = &sha256_hex(format!("{owner_tag}:{token}:nexapay").as_bytes())[..8];
    let plain = format!("{body}_{checksum}");
    let hash = hash_api_key(&plain);
    let prefix = plain.chars().take(16).collect::<String>();
    (plain, hash, prefix, checksum.to_string())
}

pub fn validate_structured_api_key(raw_key: &str) -> bool {
    let parts = raw_key.split('_').collect::<Vec<_>>();
    if parts.len() != 4 || parts[0] != "nxp" {
        return false;
    }
    let owner_tag = parts[1];
    let token = parts[2];
    let checksum = parts[3];
    if token.len() < 16 || checksum.len() != 8 {
        return false;
    }
    let expected = &sha256_hex(format!("{owner_tag}:{token}:nexapay").as_bytes())[..8];
    checksum == expected
}

pub fn issue_session_token(
    state: &AppState,
    address: &str,
    cin_hash: &str,
    session_id: &str,
) -> Result<String, StatusCode> {
    let claims = Claims::with_custom_claims(
        SessionClaims {
            address: address.to_string(),
            cin_hash: cin_hash.to_string(),
            session_id: session_id.to_string(),
        },
        Duration::from_hours(24),
    );

    state
        .jwt_key
        .authenticate(claims)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn verify_session_token(state: &AppState, token: &str) -> Result<SessionClaims, StatusCode> {
    let claims = state
        .jwt_key
        .verify_token::<SessionClaims>(token, None)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    Ok(claims.custom)
}

/// Verify session token AND check DB revocation. Use this instead of
/// verify_session_token for all authenticated endpoints.
pub async fn verify_session_with_revocation_check(
    state: &AppState,
    token: &str,
) -> Result<SessionClaims, StatusCode> {
    let claims = verify_session_token(state, token)?;
    if !claims.session_id.is_empty() {
        let session_uuid =
            Uuid::parse_str(&claims.session_id).map_err(|_| StatusCode::UNAUTHORIZED)?;
        let row = sqlx::query(
            "SELECT is_revoked FROM user_sessions WHERE user_address = $1 AND id = $2 LIMIT 1",
        )
        .bind(&claims.address)
        .bind(session_uuid)
        .fetch_optional(&state.pg_pool)
        .await;
        if let Ok(Some(r)) = row {
            let revoked: i32 = r.try_get("is_revoked").unwrap_or(0);
            if revoked != 0 {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }
    Ok(claims)
}

pub fn extract_account_token(headers: &HeaderMap) -> Option<String> {
    // 1. Try X-Account-Token header first (API clients / mobile apps)
    if let Some(token) = headers
        .get("X-Account-Token")
        .and_then(|v| v.to_str().ok())
    {
        return Some(token.to_string());
    }
    // 2. Try Cookie header (browser clients with httpOnly cookies)
    if let Some(cookie_header) = headers.get(http::header::COOKIE).and_then(|v| v.to_str().ok()) {
        for part in cookie_header.split(';') {
            let kv = part.trim();
            if let Some(value) = kv.strip_prefix("nexapay_session=") {
                return Some(value.to_string());
            }
        }
    }
    None
}

pub fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    headers
        .get("X-API-Key")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string())
}

pub async fn require_account_token(
    state: &AppState,
    headers: &HeaderMap,
    address: &str,
) -> Result<SessionClaims, StatusCode> {
    let token = extract_account_token(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let claims = verify_session_with_revocation_check(state, &token).await?;
    if claims.address != address {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(claims)
}

pub async fn require_api_key(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<ApiPrincipal, AuthError> {
    let raw_key = extract_api_key(headers).ok_or(AuthError::Unauthorized)?;

    if let Some(retry_after) = locked_retry_after_seconds(state, &raw_key).await {
        return Err(AuthError::TooManyRequests {
            retry_after_seconds: retry_after,
        });
    }

    let principal = resolve_api_key(state, &raw_key).await?;

    clear_auth_failures(state, &raw_key).await;
    enforce_rate_limit(state, &principal).await?;
    touch_last_used(state, &principal).await;
    Ok(principal)
}

pub async fn try_api_key(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<ApiPrincipal>, AuthError> {
    match extract_api_key(headers) {
        Some(raw_key) => {
            if let Some(retry_after) = locked_retry_after_seconds(state, &raw_key).await {
                return Err(AuthError::TooManyRequests {
                    retry_after_seconds: retry_after,
                });
            }
            let principal = resolve_api_key(state, &raw_key).await?;
            clear_auth_failures(state, &raw_key).await;
            enforce_rate_limit(state, &principal).await?;
            touch_last_used(state, &principal).await;
            Ok(Some(principal))
        }
        None => Ok(None),
    }
}

async fn resolve_api_key(state: &AppState, raw_key: &str) -> Result<ApiPrincipal, AuthError> {
    let looks_structured = raw_key.starts_with("nxp_");
    if looks_structured && !validate_structured_api_key(raw_key) {
        register_auth_failure(state, raw_key).await;
        return Err(AuthError::Unauthorized);
    }

    let api_key_hash = hash_api_key(raw_key);

    if let Ok(Some(row)) = sqlx::query(
        "SELECT id, owner_type, owner_id, prefix, permissions, rate_limit_per_minute, daily_limit, status, expires_at\n         FROM api_keys WHERE key_hash = $1 LIMIT 1",
    )
    .bind(&api_key_hash)
    .fetch_optional(&state.pg_pool)
    .await
    {
        let status: String = row.try_get("status").unwrap_or_else(|_| "active".to_string());
        if status != "active" {
            register_auth_failure(state, raw_key).await;
            return Err(AuthError::Unauthorized);
        }

        let expires_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("expires_at").ok();
        if let Some(expires_at) = expires_at {
            if expires_at < Utc::now() {
                register_auth_failure(state, raw_key).await;
                return Err(AuthError::Unauthorized);
            }
        }

        let key_id: Uuid = row.try_get("id").map_err(|_| AuthError::Internal)?;
        let owner_type: String = row.try_get("owner_type").unwrap_or_default();
        let owner_id: Option<Uuid> = row.try_get("owner_id").ok();
        let prefix: String = row.try_get("prefix").unwrap_or_else(|_| "nxp_key".to_string());
        let permissions = parse_permissions_csv(
            &row.try_get::<String, _>("permissions")
                .unwrap_or_else(|_| "*".to_string()),
        );
        let rate_limit_per_minute: i32 = row.try_get("rate_limit_per_minute").unwrap_or(60);
        let daily_limit: i32 = row.try_get("daily_limit").unwrap_or(10000);

        return match owner_type.as_str() {
            "developer" => {
                let call_limit = if let Some(dev_id) = owner_id {
                    if let Ok(Some(dev_row)) = sqlx::query(
                        "SELECT call_limit FROM developers WHERE id = $1 AND is_active = TRUE LIMIT 1",
                    )
                    .bind(dev_id)
                    .fetch_optional(&state.pg_pool)
                    .await
                    {
                        dev_row.try_get::<i32, _>("call_limit").unwrap_or(1_000_000)
                    } else {
                        1_000_000
                    }
                } else {
                    1_000_000
                };

                Ok(ApiPrincipal::Developer {
                    prefix,
                    call_limit,
                    owner_id,
                    key_id: Some(key_id),
                    permissions,
                    rate_limit_per_minute,
                    daily_limit,
                })
            }
            _ => {
                register_auth_failure(state, raw_key).await;
                Err(AuthError::Unauthorized)
            }
        };
    }

    if let Ok(Some(row)) = sqlx::query(
        "SELECT id, api_key_prefix, call_limit FROM developers WHERE api_key = $1 AND is_active = TRUE",
    )
    .bind(&api_key_hash)
    .fetch_optional(&state.pg_pool)
    .await
    {
        let prefix: String = row.try_get("api_key_prefix").unwrap_or_else(|_| "nxp_dev_".to_string());
        let call_limit: i32 = row.try_get("call_limit").unwrap_or(1_000_000);
        let owner_id: Option<Uuid> = row.try_get("id").ok();
        return Ok(ApiPrincipal::Developer {
            prefix,
            call_limit,
            owner_id,
            key_id: None,
            permissions: default_permissions("developer"),
            rate_limit_per_minute: 60,
            daily_limit: call_limit.max(1000),
        });
    }

    register_auth_failure(state, raw_key).await;
    Err(AuthError::Unauthorized)
}

pub async fn enforce_rate_limit(
    state: &AppState,
    principal: &ApiPrincipal,
) -> Result<(), AuthError> {
    match principal {
        ApiPrincipal::Developer {
            prefix,
            call_limit,
            key_id,
            rate_limit_per_minute,
            daily_limit,
            ..
        } => {
            if key_id.is_some() {
                return enforce_window_limits(
                    state,
                    prefix,
                    (*rate_limit_per_minute).max(20) as i64,
                    (*daily_limit).max(*call_limit) as i64,
                )
                .await;
            }

            let legacy_day_limit = (*call_limit).max(1000) as i64;

            let row = sqlx::query(
                "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
            )
            .bind(prefix)
            .fetch_one(&state.pg_pool)
            .await
            .map_err(|_| AuthError::Internal)?;

            let count: i64 = row.try_get("count").unwrap_or(0);
            if count >= legacy_day_limit {
                return Err(AuthError::TooManyRequests {
                    retry_after_seconds: seconds_until_next_day(),
                });
            }

            Ok(())
        }
    }
}

pub fn auth_error_response(err: AuthError, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    let (status, retry_after) = match err {
        AuthError::Unauthorized => (StatusCode::UNAUTHORIZED, None),
        AuthError::Forbidden => (StatusCode::FORBIDDEN, None),
        AuthError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, None),
        AuthError::TooManyRequests {
            retry_after_seconds,
        } => (StatusCode::TOO_MANY_REQUESTS, Some(retry_after_seconds)),
    };

    let mut headers = HeaderMap::new();
    if let Some(seconds) = retry_after {
        if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
            headers.insert("retry-after", value);
        }
    }

    (
        status,
        headers,
        Json(json!({
            "success": false,
            "error": message
        })),
    )
}

pub async fn log_api_call(
    state: &AppState,
    principal: Option<&ApiPrincipal>,
    endpoint: &str,
    method: &str,
    status_code: i32,
) {
    let prefix = principal.map(|p| match p {
        ApiPrincipal::Developer { prefix, .. } => prefix.clone(),
    });
    let prefix_for_log = prefix.clone();

    let _ = sqlx::query(
        "INSERT INTO api_logs (api_key_prefix, endpoint, method, status_code) VALUES ($1, $2, $3, $4)",
    )
    .bind(prefix_for_log)
    .bind(endpoint)
    .bind(method)
    .bind(status_code)
    .execute(&state.pg_pool)
    .await;

    if let Some(prefix) = prefix {
        let _ = sqlx::query(
            "UPDATE developers SET monthly_calls = monthly_calls + 1 WHERE api_key_prefix = $1 AND is_active = TRUE",
        )
        .bind(prefix)
        .execute(&state.pg_pool)
        .await;
    }
}

fn seconds_until_next_day() -> u64 {
    let now = Utc::now();
    let tomorrow = (now + chrono::Duration::days(1)).date_naive();
    let midnight_tomorrow = tomorrow.and_hms_opt(0, 0, 0).unwrap_or_else(|| {
        now.date_naive()
            .and_hms_opt(23, 59, 59)
            .expect("valid fallback time")
    });
    (midnight_tomorrow.and_utc().timestamp() - now.timestamp()).max(1) as u64
}

fn seconds_until_next_minute() -> u64 {
    let now = Utc::now();
    let sec = now.timestamp() % 60;
    (60 - sec).max(1) as u64
}

async fn enforce_window_limits(
    state: &AppState,
    prefix: &str,
    per_minute_limit: i64,
    daily_limit: i64,
) -> Result<(), AuthError> {
    let minute_row = sqlx::query(
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at >= NOW() - INTERVAL '1 minute'",
    )
    .bind(prefix)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| AuthError::Internal)?;

    let minute_count: i64 = minute_row.try_get("count").unwrap_or(0);
    if minute_count >= per_minute_limit {
        return Err(AuthError::TooManyRequests {
            retry_after_seconds: seconds_until_next_minute(),
        });
    }

    let day_row = sqlx::query(
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
    )
    .bind(prefix)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| AuthError::Internal)?;

    let day_count: i64 = day_row.try_get("count").unwrap_or(0);
    if day_count >= daily_limit {
        return Err(AuthError::TooManyRequests {
            retry_after_seconds: seconds_until_next_day(),
        });
    }

    Ok(())
}

fn auth_failure_key(raw_key: &str) -> String {
    hash_api_key(raw_key).chars().take(16).collect::<String>()
}

async fn locked_retry_after_seconds(state: &AppState, raw_key: &str) -> Option<u64> {
    let now = Utc::now().timestamp();
    let key = auth_failure_key(raw_key);
    let map = state.auth_failures.lock().await;
    if let Some((_, locked_until)) = map.get(&key) {
        if *locked_until > now {
            return Some((*locked_until - now) as u64);
        }
    }
    None
}

async fn register_auth_failure(state: &AppState, raw_key: &str) {
    let now = Utc::now().timestamp();
    let key = auth_failure_key(raw_key);
    let mut map = state.auth_failures.lock().await;
    let entry = map.entry(key).or_insert((0, 0));
    entry.0 += 1;

    if entry.0 >= 5 {
        entry.0 = 0;
        entry.1 = now + (5 * 60);
    }
}

async fn clear_auth_failures(state: &AppState, raw_key: &str) {
    let key = auth_failure_key(raw_key);
    let mut map = state.auth_failures.lock().await;
    map.remove(&key);
}

async fn touch_last_used(state: &AppState, principal: &ApiPrincipal) {
    let key_id = match principal {
        ApiPrincipal::Developer { key_id, .. } => *key_id,
    };

    if let Some(key_id) = key_id {
        let _ = sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(key_id)
            .execute(&state.pg_pool)
            .await;
    }
}

pub fn can_manage_keys(principal: &ApiPrincipal) -> bool {
    match principal {
        ApiPrincipal::Developer { permissions, .. } => {
            permissions.iter().any(|p| p == "api_keys:manage")
        }
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

// ─── IP-Based Auth Rate Limiting ───

pub fn extract_client_ip(headers: &HeaderMap) -> String {
    // Only trust X-Real-IP (set by nginx to the real client address).
    // Do NOT trust X-Forwarded-For from untrusted sources — it can be
    // injected by clients to bypass IP-based rate limiting.
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

pub async fn check_auth_rate_limit(
    state: &AppState,
    ip: &str,
    endpoint: &str,
    max_attempts: i32,
    lockout_minutes: i32,
) -> Result<(), AuthError> {
    let now = chrono::Utc::now();

    let row = sqlx::query(
        "SELECT attempt_count, locked_until FROM auth_rate_limits WHERE ip_address = $1 AND endpoint = $2 LIMIT 1"
    )
    .bind(ip)
    .bind(endpoint)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| AuthError::Internal)?;

    if let Some(r) = row {
        let locked_until: Option<chrono::DateTime<chrono::Utc>> = r.try_get("locked_until").ok();
        if let Some(until) = locked_until {
            if until > now {
                let secs = (until - now).num_seconds().max(1) as u64;
                return Err(AuthError::TooManyRequests {
                    retry_after_seconds: secs,
                });
            }
        }
        // Also check attempt count before lockout is set
        let attempt_count: i32 = r.try_get("attempt_count").unwrap_or(0);
        if attempt_count >= max_attempts {
            return Err(AuthError::TooManyRequests {
                retry_after_seconds: (lockout_minutes * 60) as u64,
            });
        }
    }

    Ok(())
}

pub async fn record_auth_attempt(
    state: &AppState,
    ip: &str,
    endpoint: &str,
    success: bool,
    max_attempts: i32,
    lockout_minutes: i32,
) {
    let now = chrono::Utc::now();

    if success {
        let _ = sqlx::query("DELETE FROM auth_rate_limits WHERE ip_address = $1 AND endpoint = $2")
            .bind(ip)
            .bind(endpoint)
            .execute(&state.pg_pool)
            .await;
        return;
    }

    let row = sqlx::query(
        "SELECT attempt_count FROM auth_rate_limits WHERE ip_address = $1 AND endpoint = $2 LIMIT 1"
    )
    .bind(ip)
    .bind(endpoint)
    .fetch_optional(&state.pg_pool)
    .await;

    let attempts: i32 = match row {
        Ok(Some(r)) => r.try_get("attempt_count").unwrap_or(0),
        _ => 0,
    };

    let new_attempts = attempts + 1;
    let locked_until = if new_attempts >= max_attempts {
        Some(now + chrono::Duration::minutes(lockout_minutes as i64))
    } else {
        None
    };

    let _ = sqlx::query(
        "INSERT INTO auth_rate_limits (ip_address, endpoint, attempt_count, locked_until, last_attempt_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ip_address, endpoint) DO UPDATE SET
         attempt_count = EXCLUDED.attempt_count,
         locked_until = EXCLUDED.locked_until,
         last_attempt_at = EXCLUDED.last_attempt_at"
    )
    .bind(ip)
    .bind(endpoint)
    .bind(new_attempts)
    .bind(locked_until)
    .bind(now)
    .execute(&state.pg_pool)
    .await;
}

// ─── Audit Logging ───

pub async fn audit_log(
    state: &AppState,
    user_address: Option<&str>,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    ip: &str,
    user_agent: Option<&str>,
    status: &str,
    details: Value,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_logs (user_address, action, resource_type, resource_id, ip_address, user_agent, status, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(user_address)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(ip)
    .bind(user_agent)
    .bind(status)
    .bind(details)
    .execute(&state.pg_pool)
    .await;
}

// ─── Request correlation ID ───

/// Tower Layer that ensures every request has an X-Request-ID header.
/// Inherits existing IDs or generates a new UUIDv4.
/// Axum middleware that ensures every request/response has an X-Request-ID.
pub async fn request_id_middleware(
    req: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut response = next.run(req).await;
    response.headers_mut().insert(
        axum::http::HeaderName::from_static("x-request-id"),
        axum::http::HeaderValue::from_str(&request_id).unwrap(),
    );
    response
}
