use sqlx::PgPool;
use serde_json::Value;
use uuid::Uuid;
use std::path::Path;
use crate::services::liveness_client::LivenessClient;
use crate::crypto::sha256_hex;
use reqwest::Client as HttpClient;
use std::env;
use chrono::{NaiveDate, Utc, Duration};
use sqlx::Row;
use rand::Rng;

fn normalize_phone_digits(phone: &str) -> Option<String> {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 8 {
        Some(format!("216{}", digits))
    } else if digits.len() == 11 && digits.starts_with("216") {
        Some(digits)
    } else {
        None
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LivenessOutcome {
    Approved,
    Failed { reason: Option<String> },
}

pub struct KycService {
    pub pool: PgPool,
    pub liveness_client: LivenessClient,
    pub upload_base: String,
}

impl KycService {
    pub fn new(pool: PgPool) -> Self {
        let liveness_client = LivenessClient::new();
        let upload_base = env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());
        Self { pool, liveness_client, upload_base }
    }

    pub async fn init_registration(
        &self,
        full_name: &str,
        phone: &str,
        email: &str,
        date_of_birth: &str,
        cin_number: &str,
    ) -> Result<Uuid, String> {
        let normalized_phone = normalize_phone_digits(phone).ok_or_else(|| {
            "phone must be 8 digits or start with 216".to_string()
        })?;
        let dob = NaiveDate::parse_from_str(date_of_birth, "%Y-%m-%d")
            .map_err(|_| "date_of_birth must be YYYY-MM-DD".to_string())?;
        // generate session id and store PENDING_PHONE_VERIFY
        let session_id = Uuid::new_v4();
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO kyc_sessions (id, full_name, phone, email, cin_number, date_of_birth, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_PHONE_VERIFY', $7, $7)",
        )
            .bind(session_id)
            .bind(full_name)
            .bind(phone)
            .bind(email)
            .bind(cin_number)
            .bind(dob)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        // Generate OTP and store hash + expiry (optional fixed OTP for integration tests: `KYC_DEV_OTP`)
        let otp = match env::var("KYC_DEV_OTP") {
            Ok(s) if s.chars().all(|c| c.is_ascii_digit()) && s.len() == 6 => s,
            _ => format!("{:06}", rand::thread_rng().gen_range(0..1_000_000)),
        };
        let otp_hash = sha256_hex(otp.as_bytes());
        let expires_at = Utc::now() + Duration::minutes(5);
        sqlx::query("UPDATE kyc_sessions SET otp_code_hash=$1, otp_expires_at=$2 WHERE id=$3")
            .bind(&otp_hash)
            .bind(expires_at)
            .bind(session_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        // Try send via Twilio if configured (best-effort)
        if let (Ok(sid), Ok(token), Ok(from)) = (
            std::env::var("TWILIO_ACCOUNT_SID"),
            std::env::var("TWILIO_AUTH_TOKEN"),
            std::env::var("TWILIO_FROM"),
        ) {
            let client = HttpClient::new();
            let body = format!("Your NexaPay verification code: {}", otp);
            let _ = client.post(&format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", sid))
                .basic_auth(sid.clone(), Some(token))
                .form(&[("To", phone), ("From", &from), ("Body", &body)])
                .send()
                .await;
        }

        Ok(session_id)
    }

    pub async fn verify_phone(&self, session_id: &str, otp_code: &str) -> Result<(), sqlx::Error> {
        let sid = Uuid::parse_str(session_id).map_err(|_| sqlx::Error::RowNotFound)?;
        // fetch stored hash and expiry
        let row = sqlx::query("SELECT otp_code_hash, otp_expires_at, otp_attempts FROM kyc_sessions WHERE id=$1")
            .bind(sid)
            .fetch_optional(&self.pool)
            .await?;
        let r = match row { Some(r) => r, None => return Err(sqlx::Error::RowNotFound) };
        let stored_hash: Option<String> = r.try_get("otp_code_hash").ok();
        let expires: Option<chrono::DateTime<Utc>> = r.try_get("otp_expires_at").ok();
        let attempts: i32 = r.try_get("otp_attempts").unwrap_or(0);
        if stored_hash.is_none() || expires.is_none() { return Err(sqlx::Error::RowNotFound); }
        let stored_hash = stored_hash.unwrap();
        let expires = expires.unwrap();
        if Utc::now() > expires { return Err(sqlx::Error::RowNotFound); }
        let provided_hash = sha256_hex(otp_code.as_bytes());
        if provided_hash != stored_hash {
            let _ = sqlx::query("UPDATE kyc_sessions SET otp_attempts = $1 WHERE id=$2").bind(attempts+1).bind(sid).execute(&self.pool).await;
            return Err(sqlx::Error::RowNotFound);
        }
        // mark verified
        sqlx::query("UPDATE kyc_sessions SET status='PENDING_DOCUMENTS', otp_code_hash=NULL, otp_expires_at=NULL, otp_attempts=0, updated_at=NOW() WHERE id=$1").bind(sid).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn upload_documents(&self, session_id: &str, cin_front_path: &str, cin_back_path: &str, proof_path: &str, address_line: &str, delegation: &str, governorate: &str, postal_code: &str) -> Result<(), sqlx::Error> {
        let sid = Uuid::parse_str(session_id).map_err(|_| sqlx::Error::RowNotFound)?;
        let documents = serde_json::json!({
            "cin_front": cin_front_path,
            "cin_back": cin_back_path,
            "proof_of_address": proof_path,
            "address_line": address_line,
            "delegation": delegation,
            "governorate": governorate,
            "postal_code": postal_code,
        });

        // Basic pre-check: ensure file exists and not tiny
        for p in [&cin_front_path, &cin_back_path, &proof_path] {
            if !Path::new(p).exists() {
                return Err(sqlx::Error::RowNotFound);
            }
            let meta = std::fs::metadata(p).map_err(|_| sqlx::Error::RowNotFound)?;
            if meta.len() < 1024 {
                return Err(sqlx::Error::RowNotFound);
            }
        }

        sqlx::query("UPDATE kyc_sessions SET documents=$1, status='PENDING_LIVENESS', updated_at=NOW() WHERE id=$2")
            .bind(documents as Value)
            .bind(sid)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn run_liveness(
        &self,
        session_id: &str,
        cin_front_path: &str,
        liveness_video_path: &str,
    ) -> Result<LivenessOutcome, sqlx::Error> {
        let resp = self
            .liveness_client
            .analyze(cin_front_path, liveness_video_path)
            .await
            .map_err(|_| sqlx::Error::RowNotFound)?;
        let sid = Uuid::parse_str(session_id).map_err(|_| sqlx::Error::RowNotFound)?;
        if resp.passed {
            let kyc_hash = sid.to_string();
            sqlx::query("UPDATE kyc_sessions SET status='APPROVED', liveness_result=$1, kyc_hash=$2, updated_at=NOW() WHERE id=$3")
                .bind(serde_json::json!(resp))
                .bind(&kyc_hash)
                .bind(sid)
                .execute(&self.pool)
                .await?;
            Ok(LivenessOutcome::Approved)
        } else {
            sqlx::query("UPDATE kyc_sessions SET status='LIVENESS_FAILED', liveness_result=$1, liveness_retries = liveness_retries + 1, updated_at=NOW() WHERE id=$2")
                .bind(serde_json::json!(resp))
                .bind(sid)
                .execute(&self.pool)
                .await?;
            Ok(LivenessOutcome::Failed {
                reason: resp.stage_failed,
            })
        }
    }
}
