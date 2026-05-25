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
    check_auth_rate_limit, extract_client_ip, record_auth_attempt,
};
use crate::api::AppState;
use crate::api::auth::is_valid_otp;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub totp_qr_url: Option<String>,
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
        .admin_jwt_key
        .authenticate(claims)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Verify an admin JWT and extract claims.
pub fn verify_admin_token(state: &AppState, token: &str) -> Result<AdminClaims, StatusCode> {
    use jwt_simple::prelude::*;
    let claims = state
        .admin_jwt_key
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
#[allow(dead_code)]
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
    let _role: String = row.try_get("role").unwrap_or_default();

    let admin_uuid = Uuid::parse_str(&admin_id).unwrap_or_else(|_| Uuid::new_v4());

    // Check if admin has TOTP configured
    let totp_secret: Option<String> = sqlx::query_scalar(
        "SELECT otp_secret FROM admin_users WHERE id = $1"
    )
    .bind(admin_uuid)
    .fetch_optional(&state.pg_pool)
    .await
    .unwrap_or(None)
    .flatten();

    let step: String;
    let dev_otp: Option<String>;
    let totp_qr_url: Option<String>;

    if totp_secret.is_none() || totp_secret.as_deref() == Some("") {
        // No TOTP configured — generate a secret and return QR code URL
        use totp_rs::{Algorithm, TOTP, Secret};
        let secret = Secret::generate_secret();
        let secret_bytes = secret.to_bytes().unwrap();
        
        let totp = TOTP::new(
            Algorithm::SHA256,
            6,
            1,
            30,
            secret_bytes,
            Some("NexaPay Admin".to_string()),
            payload.username.clone(),
        ).unwrap();
        
        let qr_url = totp.get_url();
        
        // Store the secret as base32 string
        let secret_str = secret.to_string();
        let _ = sqlx::query("UPDATE admin_users SET otp_secret = $1 WHERE id = $2")
            .bind(&secret_str)
            .bind(admin_uuid)
            .execute(&state.pg_pool)
            .await;

        let current_totp = totp.generate_current().unwrap_or_default();
        dev_otp = if state.env == "development" {
            Some(format!("TOTP Secret: {} | Code: {}", secret_str, current_totp))
        } else { None };

        // Store OTP hash so admin can verify and complete setup
        let otp_hash =
            sha256_hex(format!("admin:{}:{}", admin_uuid, current_totp).as_bytes());
        let _ = sqlx::query(
            "INSERT INTO admin_login_otps (admin_id, otp_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')",
        )
        .bind(admin_uuid)
        .bind(&otp_hash)
        .execute(&state.pg_pool)
        .await;

        step = "totp_setup".to_string();
        totp_qr_url = Some(qr_url);
        
        record_auth_attempt(&state, &ip, "/admin/login", true, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
        
        return Ok(Json(AdminLoginResponse {
            step,
            admin_id: admin_id.clone(),
            dev_otp,
            totp_qr_url,
        }));
    } else {
        // TOTP configured — use it
        let secret_str = totp_secret.unwrap();
        let secret_bytes = match totp_rs::Secret::Encoded(secret_str.clone()).to_bytes() {
            Ok(b) => b,
            Err(_) => {
                // Old format: secret was stored as hex/raw
                let raw = totp_rs::Secret::Raw(secret_str.as_bytes().to_vec());
                raw.to_bytes().unwrap()
            }
        };
        let totp = totp_rs::TOTP::new(
            totp_rs::Algorithm::SHA256,
            6,
            1,
            30,
            secret_bytes,
            Some("NexaPay Admin".to_string()),
            payload.username.clone(),
        ).unwrap();
        
        let current_code = totp.generate_current().unwrap_or_default();
        
        // Store OTP hash with pepper from encryption key for offline brute-force resistance
        let otp_hash = sha256_hex(format!("admin:{}:{}:{}", admin_id, current_code, state.encryption_key).as_bytes());
        let expires_at = Utc::now() + chrono::Duration::minutes(5);
        
        let _ = sqlx::query(
            "INSERT INTO admin_login_otps (admin_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
        )
        .bind(admin_uuid)
        .bind(&otp_hash)
        .bind(expires_at)
        .execute(&state.pg_pool)
        .await;

        dev_otp = if state.env == "development" {
            Some(format!("TOTP code: {}", current_code))
        } else { None };
        
        step = "otp_required".to_string();
        totp_qr_url = None;
        
        record_auth_attempt(&state, &ip, "/admin/login", true, MAX_ATTEMPTS, LOCKOUT_MINUTES).await;
    }

    Ok(Json(AdminLoginResponse {
        step,
        admin_id: admin_id.clone(),
        dev_otp,
        totp_qr_url,
    }))
}

/// POST /admin/login/verify-otp — Step 2: verify OTP, issue admin JWT
pub async fn admin_verify_otp(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdminVerifyOtpRequest>,
) -> Result<Json<AdminTokenResponse>, (StatusCode, Json<Value>)> {
    let ip = crate::api::middleware::extract_client_ip(&headers);
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
    .bind(&ip)
    .execute(&state.pg_pool)
    .await;

    Ok(Json(AdminTokenResponse {
        token,
        admin_id: payload.admin_id,
        username,
        role,
    }))
}
