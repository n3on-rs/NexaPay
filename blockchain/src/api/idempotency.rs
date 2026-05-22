//! Idempotency helper for preventing duplicate transactions.
//!
//! Usage in a handler:
//! ```ignore
//! let idem = IdempotencyGuard::extract(&state, &headers, &address, "/endpoint").await?;
//! if let Some(cached) = idem.check().await? {
//!     return Ok(cached);  // Return cached response
//! }
//! // ... process request ...
//! idem.store(&response, 200).await?;  // Cache for 24h
//! ```

use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use serde_json::Value;
use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

use crate::crypto::sha256_hex;

/// Guards a request against duplicate processing.
pub struct IdempotencyGuard {
    pool: PgPool,
    key_hash: String,
    user_address: String,
    endpoint: String,
}

impl IdempotencyGuard {
    /// Extract the `X-Idempotency-Key` header for the given user and endpoint.
    /// Returns `None` if no idempotency key was provided (request proceeds normally).
    pub async fn extract(
        pool: &PgPool,
        headers: &HeaderMap,
        user_address: &str,
        endpoint: &str,
    ) -> Result<Option<Self>, StatusCode> {
        let raw_key = match headers
            .get("X-Idempotency-Key")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            Some(k) => k,
            None => return Ok(None),
        };

        // Hash: sha256(user_address + key) — scoped per user
        let key_hash = sha256_hex(format!("idem:{}:{}", user_address, raw_key).as_bytes());

        Ok(Some(Self {
            pool: pool.clone(),
            key_hash,
            user_address: user_address.to_string(),
            endpoint: endpoint.to_string(),
        }))
    }

    /// Check if this idempotency key has already been processed.
    /// Returns `Some(cached_response)` if a cached result exists (caller should return it).
    /// Returns `None` if the key is new (caller should process the request).
    pub async fn check(&self) -> Result<Option<(StatusCode, Value)>, StatusCode> {
        let row = sqlx::query(
            "SELECT response_body, status_code, endpoint FROM idempotency_keys
             WHERE key_hash = $1 AND expires_at > NOW()",
        )
        .bind(&self.key_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let row = match row {
            Some(r) => r,
            None => return Ok(None),
        };

        let stored_endpoint: String = row
            .try_get("endpoint")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Key reuse across different endpoints is rejected
        if stored_endpoint != self.endpoint {
            return Ok(Some((
                StatusCode::CONFLICT,
                serde_json::json!({
                    "error": "idempotency_key_mismatch",
                    "message": "This key was already used for a different operation"
                }),
            )));
        }

        let status_code: i16 = row
            .try_get("status_code")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let response_body: Value = row
            .try_get("response_body")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(Some((
            StatusCode::from_u16(status_code as u16).unwrap_or(StatusCode::OK),
            response_body,
        )))
    }

    /// Store the response for this idempotency key (valid for 24 hours).
    pub async fn store(
        &self,
        response_body: &Value,
        status_code: StatusCode,
    ) -> Result<(), StatusCode> {
        let expires_at = Utc::now() + chrono::Duration::hours(24);

        sqlx::query(
            "INSERT INTO idempotency_keys (key_hash, user_address, endpoint, response_body, status_code, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (key_hash) DO NOTHING",
        )
        .bind(&self.key_hash)
        .bind(&self.user_address)
        .bind(&self.endpoint)
        .bind(response_body)
        .bind(status_code.as_u16() as i16)
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(())
    }
}
