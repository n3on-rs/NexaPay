use crate::api::middleware::{
    create_structured_api_key, default_permissions, extract_account_token,
    permissions_to_csv, verify_session_token,
};
use crate::api::AppState;
use axum::{
    extract::Multipart,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

const DEFAULT_COMPANY_CALL_LIMIT: i32 = 1_000_000;

pub async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(address): axum::extract::Path<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // Authenticate
    let token = match extract_account_token(&headers) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error":"missing token"})),
            );
        }
    };
    let claims = match verify_session_token(&state, &token) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error":"invalid token"})),
            );
        }
    };
    if claims.address != address {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error":"address mismatch"})),
        );
    }

    let mut fields = std::collections::HashMap::new();
    let mut tax_doc_path = None;
    const MAX_FILE_SIZE: usize = 5 * 1024 * 1024; // 5MB per file
    const ALLOWED_EXTENSIONS: &[&str] = &["pdf", "png", "jpg", "jpeg"];

    let mut rne_doc_path = None;
    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if let Some(fname) = field.file_name() {
            let ext = fname.split('.').last().unwrap_or("").to_lowercase();
            // Validate file extension
            if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": format!("Invalid file type: .{ext}")})),
                );
            }
            // Sanitize filename: strip any path components
            let safe_name = name.replace("..", "").replace('/', "").replace('\\', "");
            let dir = format!("{}/agents/{}", upload_base, address);
            tokio::fs::create_dir_all(&dir).await.ok();
            let target = format!("{}/{}.{}", dir, safe_name, ext);
            let data = field.bytes().await.unwrap_or_default();
            // Enforce size limit
            if data.len() > MAX_FILE_SIZE {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": format!("File too large: {} bytes (max {})", data.len(), MAX_FILE_SIZE)})),
                );
            }
            tokio::fs::write(&target, &data).await.ok();
            if name == "business_license" {
                tax_doc_path = Some(target);
            } else if name == "rne_doc" {
                rne_doc_path = Some(target);
            }
        } else {
            let text = field.text().await.unwrap_or_default();
            fields.insert(name, text);
        }
    }

    if fields.get("business_name").is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error":"missing business_name"})),
        );
    }

    let application_id = Uuid::new_v4();
    let pool: &PgPool = &state.pg_pool;
    let tax_doc = tax_doc_path.unwrap_or_default();
    let rne_doc = rne_doc_path.unwrap_or_default();

    let is_dev = std::env::var("APP_ENV").as_deref() == Ok("development");
    let initial_status = if is_dev { "APPROVED" } else { "PENDING" };

    let _ = sqlx::query(
        "INSERT INTO agent_applications (id, user_address, business_name, business_type, tax_registration_number, tax_document_path, rne_document_path, business_address, business_governorate, business_description, expected_monthly_volume, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())"
    )
    .bind(application_id)
    .bind(&address)
    .bind(fields.get("business_name").unwrap())
    .bind(fields.get("business_type").unwrap_or(&"".to_string()))
    .bind(fields.get("tax_registration_number").unwrap_or(&"".to_string()))
    .bind(tax_doc)
    .bind(rne_doc)
    .bind(fields.get("business_address").unwrap_or(&"".to_string()))
    .bind(fields.get("business_governorate").unwrap_or(&"".to_string()))
    .bind(fields.get("business_description").unwrap_or(&"".to_string()))
    .bind(fields.get("expected_monthly_volume").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0))
    .bind(initial_status)
    .execute(pool)
    .await;

    let mut created_api_key: Option<String> = None;

    // Auto-create agent_profile + company workspace in dev mode
    if is_dev {
        let _ = sqlx::query(
            "INSERT INTO agent_profiles (user_address, application_id, business_name, business_type, tax_registration_number, is_active, monthly_volume_limit, approved_at) VALUES ($1, $2, $3, $4, $5, true, $6, NOW()) ON CONFLICT (user_address) DO UPDATE SET is_active = true, approved_at = NOW()"
        )
        .bind(&address)
        .bind(application_id)
        .bind(fields.get("business_name").unwrap_or(&"".to_string()))
        .bind(fields.get("business_type").unwrap_or(&"".to_string()))
        .bind(fields.get("tax_registration_number").unwrap_or(&"".to_string()))
        .bind(fields.get("expected_monthly_volume").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0) * 1.5)
        .execute(pool)
        .await;

        // Also create company workspace if missing
        let existing: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM developers WHERE owner_user_address = $1 AND is_active = TRUE LIMIT 1"
        )
        .bind(&address)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        if existing.is_none() {
            if let Ok(Some(user_row)) = sqlx::query(
                "SELECT full_name, cin, email, phone FROM users WHERE chain_address = $1 LIMIT 1"
            )
            .bind(&address)
            .fetch_optional(pool)
            .await
            {
                let full_name: String = user_row.try_get("full_name").unwrap_or_default();
                let cin: String = user_row.try_get("cin").unwrap_or_default();
                let email: String = user_row.try_get::<Option<String>, _>("email").ok().flatten().unwrap_or_default();
                let phone: String = user_row.try_get("phone").unwrap_or_default();
                let business_name = fields.get("business_name").cloned().unwrap_or_else(|| full_name.clone());

                let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
                let legacy_prefix = prefix.chars().take(8).collect::<String>();
                created_api_key = Some(api_key.clone());

                if let Ok(Some(dev_row)) = sqlx::query(
                    "INSERT INTO developers (company_name, contact_name, email, phone, api_key, api_key_prefix, plan, call_limit, owner_user_address, owner_user_cin, settlement_account_holder, settlement_status)
                     VALUES ($1, $2, $3, $4, $5, $6, 'wallet', $7, $8, $9, $10, 'draft')
                     RETURNING id"
                )
                .bind(&business_name)
                .bind(&full_name)
                .bind(&email)
                .bind(&phone)
                .bind(&api_key_hash)
                .bind(&legacy_prefix)
                .bind(DEFAULT_COMPANY_CALL_LIMIT)
                .bind(&address)
                .bind(&cin)
                .bind(&full_name)
                .fetch_optional(pool)
                .await
                {
                    if let Ok(dev_id) = dev_row.try_get::<Uuid, _>("id") {
                        let _ = sqlx::query(
                            "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
                             VALUES ('developer', $1, 'primary', $2, $3, $4, $5, 120, $6, 'active')"
                        )
                        .bind(dev_id)
                        .bind(&api_key_hash)
                        .bind(&prefix)
                        .bind(&checksum)
                        .bind(permissions_to_csv(&default_permissions("developer")))
                        .bind(DEFAULT_COMPANY_CALL_LIMIT)
                        .execute(pool)
                        .await;
                    }
                }
            }
        }
    }

    let mut response = serde_json::json!({"application_id": application_id.to_string(), "status": initial_status});
    if let (Some(obj), Some(key)) = (response.as_object_mut(), created_api_key) {
        obj.insert("api_key".to_string(), serde_json::json!(key));
    }
    (
        StatusCode::OK,
        Json(response),
    )
}

pub async fn status(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> impl IntoResponse {
    use sqlx::Row;

    let pool = &state.pg_pool;

    let row = sqlx::query(
        "SELECT a.id, a.status, a.risk_score, a.rejection_reason, a.reviewer_notes,
                a.tax_document_path, a.rne_document_path, a.business_address,
                a.business_governorate, a.business_description, a.created_at,
                p.business_name, p.monthly_volume_limit
         FROM agent_applications a
         LEFT JOIN agent_profiles p ON a.user_address = p.user_address
         WHERE a.user_address = $1
         ORDER BY a.created_at DESC
         LIMIT 1",
    )
    .bind(&address)
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some(r)) => {
            let application_id: uuid::Uuid = r.try_get("id").unwrap();
            let status: String = r
                .try_get("status")
                .unwrap_or_else(|_| "PENDING".to_string());
            let risk_score: Option<f64> = r.try_get("risk_score").ok().flatten();
            let rejection_reason: Option<String> = r.try_get("rejection_reason").ok().flatten();
            let reviewer_notes: Option<String> = r.try_get("reviewer_notes").ok().flatten();
            let tax_document_path: Option<String> = r.try_get("tax_document_path").ok().flatten();
            let rne_document_path: Option<String> = r.try_get("rne_document_path").ok().flatten();
            let business_address: Option<String> = r.try_get("business_address").ok().flatten();
            let business_governorate: Option<String> = r.try_get("business_governorate").ok().flatten();
            let business_description: Option<String> = r.try_get("business_description").ok().flatten();
            let created_at: chrono::DateTime<chrono::Utc> = r.try_get("created_at").unwrap_or_else(|_| chrono::Utc::now());
            let business_name: String = r.try_get("business_name").unwrap_or_default();
            let monthly_volume_limit: Option<i64> =
                r.try_get("monthly_volume_limit").ok().flatten();

            let mut response = serde_json::json!({
                "application_id": application_id.to_string(),
                "status": status,
                "risk_score": risk_score,
                "rejection_reason": rejection_reason,
                "reviewer_notes": reviewer_notes,
                "tax_document_path": tax_document_path,
                "rne_document_path": rne_document_path,
                "business_address": business_address,
                "business_governorate": business_governorate,
                "business_description": business_description,
                "created_at": created_at.to_rfc3339(),
                "business_name": business_name,
                "monthly_volume_limit": monthly_volume_limit
            });

            if status == "APPROVED" {
                if let Some(obj) = response.as_object_mut() {
                    obj.insert(
                        "docs_url".to_string(),
                        serde_json::json!("https://docs.nexapay.space"),
                    );
                    // Only indicate that an API key exists; the actual key is revealed once on apply
                    let has_key = sqlx::query(
                        "SELECT 1 as ok FROM api_keys ak JOIN developers d ON d.id = ak.owner_id
                         WHERE d.owner_user_address = $1 AND ak.owner_type = 'developer' AND ak.status = 'active'
                         LIMIT 1"
                    )
                    .bind(&address)
                    .fetch_optional(pool)
                    .await
                    .ok()
                    .flatten()
                    .is_some();
                    obj.insert("has_api_key".to_string(), serde_json::json!(has_key));
                }
            }

            (StatusCode::OK, Json(response))
        }
        Ok(None) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "none" })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

pub async fn dashboard(
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> impl IntoResponse {
    let row = sqlx::query("SELECT user_address, business_name, monthly_volume_limit FROM agent_profiles WHERE user_address=$1")
        .bind(address)
        .fetch_optional(&state.pg_pool)
        .await
        .unwrap_or(None);
    if let Some(p) = row {
        let user_address: String = p.try_get("user_address").unwrap_or_default();
        let business_name: String = p.try_get("business_name").unwrap_or_default();
        let monthly_volume_limit: i64 = p.try_get("monthly_volume_limit").unwrap_or(0);
        let api_key = format!("REVEALED_ONCE_{}", user_address);
        return (
            axum::http::StatusCode::OK,
            Json(
                serde_json::json!({"status":"APPROVED","business_name": business_name, "api_key": api_key, "permissions": {}, "monthly_volume_limit": monthly_volume_limit, "docs_url":"https://docs.nexapay.space"}),
            ),
        );
    }
    (
        axum::http::StatusCode::NOT_FOUND,
        Json(serde_json::json!({"error":"profile_not_found"})),
    )
}
