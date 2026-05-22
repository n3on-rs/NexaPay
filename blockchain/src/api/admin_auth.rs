//! Admin authentication — password + OTP 2FA with Argon2id.
//! Separate from user auth. Admin JWTs carry an "admin" role claim.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{
    audit_log, check_auth_rate_limit, extract_client_ip, record_auth_attempt,
};
use crate::api::AppState;
use crate::api::auth::send_twilio_sms;
use crate::api::auth::{generate_otp_code as gen_otp, is_valid_otp};
use crate::crypto::sha256_hex;

#[derive(Deserialize)]
pub struct AdminLoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AdminLoginResponse {
    pub step: String,
    pub admin_id: String,
    pub dev_otp: Option<String>,
}

#[derive(Deserialize)]
pub struct AdminVerifyOtpRequest {
    pub admin_id: String,
    pub otp_code: String,
}

#[derive(Serialize)]
pub struct AdminTokenResponse {
    pub token: String,
    pub admin_id: String,
    pub username: String,
    pub role: String,
}

/// Hash an admin password with Argon2id.
pub fn hash_admin_password(password: &str) -> String {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default()
}

/// Verify an admin password against its Argon2id hash.
pub fn verify_admin_password(password: &str, hash: &str) -> bool {
    use argon2::{password_hash::PasswordHash, Argon2, PasswordVerifier};
    PasswordHash::new(hash)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

/// Issue a JWT with admin role claim.
pub fn issue_admin_token(
    state: &AppState,
    admin_id: &str,
    username: &str,
    role: &str,
) -> Result<String, StatusCode> {
    use jwt_simple::prelude::*;
    let claims = Claims::with_custom_claims(
        serde_json::json!({
            "admin_id": admin_id,
            "username": username,
            "role": role,
            "scope": "admin",
        }),
        Duration::from_hours(8),
    );
    state
        .jwt_key
        .authenticate(claims)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Verify an admin JWT and extract claims.
pub fn verify_admin_token(state: &AppState, token: &str) -> Result<AdminClaims, StatusCode> {
    use jwt_simple::prelude::*;
    let claims = state
        .jwt_key
        .verify_token::<serde_json::Value>(token, None)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let custom = claims.custom;
    let scope = custom.get("scope").and_then(|v| v.as_str()).unwrap_or("");
    if scope != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(AdminClaims {
        admin_id: custom
            .get("admin_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        username: custom
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        role: custom
            .get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[derive(Debug, Clone)]
pub struct AdminClaims {
    pub admin_id: String,
    pub username: String,
    pub role: String,
}

/// Extract admin token from X-Admin-Token header and verify.
pub async fn require_admin(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AdminClaims, StatusCode> {
    let token = headers
        .get("X-Admin-Token")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    verify_admin_token(state, token)
}

// ─── Admin Login Handler ───

/// POST /admin/login — Step 1: verify password, send OTP
pub async fn admin_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminLoginRequest>,
) -> Result<Json<AdminLoginResponse>, (StatusCode, Json<Value>)> {
    let ip = extract_client_ip(&headers);
    const MAX_ATTEMPTS: i32 = 5;
    const LOCKOUT_MINUTES: i32 = 30;

    if let Err(_) =
        check_auth_rate_limit(&state, &ip, "/admin/login", MAX_ATTEMPTS, LOCKOUT_MINUTES).await
    {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Too many attempts. Try again later."})),
        ));
    }

    let row = sqlx::query(
        "SELECT id, username, password_hash, role, is_active FROM admin_users WHERE username = $1",
    )
    .bind(&payload.username)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Database error"})),
        )
    })?;

    let row = match row {
        Some(r) => r,
        None => {
            record_auth_attempt(
                &state,
                &ip,
                "/admin/login",
                false,
                MAX_ATTEMPTS,
                LOCKOUT_MINUTES,
            )
            .await;
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid credentials"})),
            ));
        }
    };

    let is_active: bool = row.try_get("is_active").unwrap_or(false);
    if !is_active {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Account disabled"})),
        ));
    }

    let pw_hash: String = row.try_get("password_hash").unwrap_or_default();
    if !verify_admin_password(&payload.password, &pw_hash) {
        record_auth_attempt(
            &state,
            &ip,
            "/admin/login",
            false,
            MAX_ATTEMPTS,
            LOCKOUT_MINUTES,
        )
        .await;
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid credentials"})),
        ));
    }

    let admin_id: String = row
        .try_get::<Uuid, _>("id")
        .map(|u| u.to_string())
        .unwrap_or_default();
    let role: String = row.try_get("role").unwrap_or_default();

    // Generate OTP
    let otp = gen_otp();
    let otp_hash = sha256_hex(format!("admin:{}:{}", admin_id, otp).as_bytes());
    let expires_at = Utc::now() + chrono::Duration::minutes(5);

    // Send OTP via SMS to admin phone
    let admin_phone = std::env::var("NEXAPAY_ADMIN_PHONE").unwrap_or_default();
    if !admin_phone.is_empty() {
        let msg = format!("NexaPay Admin login code: {}. Valid for 5 minutes. Never share this code.", otp);
        match send_twilio_sms(&state, &admin_phone, &msg).await {
            Ok(_) => tracing::info!("[admin] OTP SMS sent to {}", admin_phone),
            Err(e) => tracing::error!("[admin] Failed to send OTP SMS: {:?}", e),
        }
    }

    sqlx::query(
        "INSERT INTO admin_login_otps (admin_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(Uuid::parse_str(&admin_id).unwrap_or_else(|_| Uuid::new_v4()))
    .bind(&otp_hash)
    .bind(expires_at)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to save OTP"})),
        )
    })?;

    record_auth_attempt(
        &state,
        &ip,
        "/admin/login",
        true,
        MAX_ATTEMPTS,
        LOCKOUT_MINUTES,
    )
    .await;

    let dev_otp =
        if state.env == "development" || state.env == "demo" || std::env::var("DEV_SHOW_OTP").as_deref() == Ok("true") {
            Some(otp.clone())
        } else {
            None
        };

    Ok(Json(AdminLoginResponse {
        step: "otp_required".to_string(),
        admin_id,
        dev_otp,
    }))
}

/// POST /admin/login/verify-otp — Step 2: verify OTP, issue admin JWT
pub async fn admin_verify_otp(
    State(state): State<AppState>,
    Json(payload): Json<AdminVerifyOtpRequest>,
) -> Result<Json<AdminTokenResponse>, (StatusCode, Json<Value>)> {
    let admin_uuid = Uuid::parse_str(&payload.admin_id).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid admin ID"})),
        )
    })?;

    if !is_valid_otp(&payload.otp_code) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid OTP format"})),
        ));
    }

    let otp_hash =
        sha256_hex(format!("admin:{}:{}", payload.admin_id, payload.otp_code).as_bytes());

    let row = sqlx::query(
        "SELECT id, otp_hash, expires_at, used FROM admin_login_otps
         WHERE admin_id = $1 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(admin_uuid)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Database error"})),
        )
    })?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid or expired OTP"})),
            ))
        }
    };

    let stored_hash: String = row.try_get("otp_hash").unwrap_or_default();
    if otp_hash != stored_hash {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid OTP"})),
        ));
    }

    // Mark OTP as used
    let otp_id: Uuid = row.try_get("id").unwrap_or_else(|_| Uuid::new_v4());
    let _ = sqlx::query("UPDATE admin_login_otps SET used = TRUE WHERE id = $1")
        .bind(otp_id)
        .execute(&state.pg_pool)
        .await;

    // Get admin user info
    let admin_row = sqlx::query("SELECT username, role, full_name FROM admin_users WHERE id = $1")
        .bind(admin_uuid)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Database error"})),
            )
        })?
        .ok_or((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Admin not found"})),
        ))?;

    let username: String = admin_row.try_get("username").unwrap_or_default();
    let role: String = admin_row.try_get("role").unwrap_or_default();

    let token = issue_admin_token(&state, &payload.admin_id, &username, &role).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Token creation failed"})),
        )
    })?;

    // Update last login
    let _ = sqlx::query("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1")
        .bind(admin_uuid)
        .execute(&state.pg_pool)
        .await;

    // Audit log
    let _ = sqlx::query(
        "INSERT INTO admin_audit_log (admin_id, admin_username, action, ip_address)
         VALUES ($1, $2, 'login', $3)",
    )
    .bind(admin_uuid)
    .bind(&username)
    .bind("127.0.0.1") // Will be filled by middleware
    .execute(&state.pg_pool)
    .await;

    Ok(Json(AdminTokenResponse {
        token,
        admin_id: payload.admin_id,
        username,
        role,
    }))
}
