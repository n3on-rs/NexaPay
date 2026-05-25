//! Admin API — user management, transaction monitoring, dashboard, audit log.
//! All endpoints require admin authentication via X-Admin-Token header.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::admin_auth::{hash_admin_password, require_admin, AdminClaims};
use crate::api::AppState;
use crate::chain::NEXAPAY_REVENUE;

fn api_error(sc: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (sc, Json(json!({"error": msg})))
}

// ─── Admin audit helper ───
async fn log_admin_action(
    state: &AppState,
    admin: &AdminClaims,
    action: &str,
    resource_type: &str,
    resource_id: Option<&str>,
    details: Value,
) {
    let admin_uuid = Uuid::parse_str(&admin.admin_id).ok();
    let _ = sqlx::query(
        "INSERT INTO admin_audit_log (admin_id, admin_username, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(admin_uuid)
    .bind(&admin.username)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(details)
    .execute(&state.pg_pool)
    .await;
}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════

#[derive(Serialize)]
pub struct AdminDashboard {
    pub total_users: i64,
    pub active_users_today: i64,
    pub total_transactions: i64,
    pub total_volume_millimes: i64,
    pub pending_withdrawals: i64,
    pub frozen_accounts: i64,
    pub chain_height: u64,
    pub validator_count: usize,
    pub today_transactions: i64,
    pub today_volume_millimes: i64,
    // Revenue tracking
    pub revenue_balance_millimes: u64,
    pub revenue_address: String,
    pub total_fees_collected: u64,
    pub fee_brackets_count: i64,
}

/// GET /admin/dashboard
pub async fn dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminDashboard>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pg_pool)
        .await
        .unwrap_or(0);

    let today = chrono::Utc::now().date_naive();
    let active_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT chain_address) FROM cards WHERE last_used_at::date = $1",
    )
    .bind(today)
    .fetch_one(&state.pg_pool)
    .await
    .unwrap_or(0);

    let pending_withdrawals: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM bank_withdrawals WHERE status = 'PENDING_REVIEW'")
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0);

    let frozen: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM user_freeze_records WHERE unfrozen_at IS NULL")
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0);

    // Chain stats
    let chain = state.chain.lock().await;
    let chain_height = chain.chain_height();
    let total_txs = chain.total_tx_count() as i64;
    let validator_count = chain.active_validator_count();
    // Revenue account
    let revenue_balance = chain
        .get_account(NEXAPAY_REVENUE)
        .map(|a| a.balance)
        .unwrap_or(0);
    // Count total fees from all blocks
    let total_fees: u64 = chain
        .blocks()
        .iter()
        .flat_map(|b| b.transactions.iter())
        .map(|tx| tx.fee as u64)
        .sum();
    drop(chain);

    // Today's transactions (from funding_transactions + blockchain)
    let today_txs: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM funding_transactions WHERE created_at::date = $1")
            .bind(today)
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0);

    let today_vol: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount),0)::bigint FROM funding_transactions WHERE created_at::date = $1"
    ).bind(today).fetch_one(&state.pg_pool).await.unwrap_or(0);

    // Active fee brackets count
    let fee_brackets_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM fee_brackets WHERE active = true")
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0);

    log_admin_action(
        &state,
        &admin,
        "view_dashboard",
        "dashboard",
        None,
        json!({}),
    )
    .await;

    Ok(Json(AdminDashboard {
        total_users,
        active_users_today: active_today,
        total_transactions: total_txs,
        total_volume_millimes: 0, // Computed from chain
        pending_withdrawals,
        frozen_accounts: frozen,
        chain_height,
        validator_count,
        today_transactions: today_txs,
        today_volume_millimes: today_vol,
        revenue_balance_millimes: revenue_balance,
        revenue_address: NEXAPAY_REVENUE.to_string(),
        total_fees_collected: total_fees,
        fee_brackets_count,
    }))
}

// ═══════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════

#[derive(Serialize)]
#[allow(dead_code)]
pub struct AdminUserView {
    pub address: String,
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub cin: String,
    pub balance: u64,
    pub balance_display: String,
    pub kyc_status: String,
    pub is_frozen: bool,
    pub created_at: String,
    pub tx_count: u64,
    pub public_key: Option<String>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct UserListQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
    pub search: Option<String>,
    pub status: Option<String>,
}

/// GET /admin/users
pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<UserListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(20).min(100);
    let offset = ((page - 1) * limit) as i64;

    let search = q.search.as_deref().unwrap_or("");
    let search_pattern = format!("%{}%", search);

    let rows = if search.is_empty() {
        sqlx::query(
            "SELECT u.chain_address, u.full_name, u.phone, u.email, u.cin, u.kyc_status, u.created_at, u.public_key,
                    COALESCE(c.balance, 0) as balance
             FROM users u
             LEFT JOIN cards c ON c.chain_address = u.chain_address
             ORDER BY u.created_at DESC
             LIMIT $1 OFFSET $2"
        )
        .bind(limit as i64)
        .bind(offset)
        .fetch_all(&state.pg_pool).await.unwrap_or_default()
    } else {
        sqlx::query(
            "SELECT u.chain_address, u.full_name, u.phone, u.email, u.cin, u.kyc_status, u.created_at, u.public_key,
                    COALESCE(c.balance, 0) as balance
             FROM users u
             LEFT JOIN cards c ON c.chain_address = u.chain_address
             WHERE u.full_name ILIKE $1 OR u.phone ILIKE $1 OR u.email ILIKE $1 OR u.cin ILIKE $1
             ORDER BY u.created_at DESC
             LIMIT $2 OFFSET $3"
        )
        .bind(&search_pattern)
        .bind(limit as i64)
        .bind(offset)
        .fetch_all(&state.pg_pool).await.unwrap_or_default()
    };

    let total: i64 = if search.is_empty() {
        sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&state.pg_pool)
            .await
            .unwrap_or(0)
    } else {
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE full_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1")
            .bind(&search_pattern).fetch_one(&state.pg_pool).await.unwrap_or(0)
    };

    let chain = state.chain.lock().await;
    let users: Vec<Value> = rows.iter().map(|r| {
        let addr: String = r.try_get("chain_address").unwrap_or_default();
        let chain_balance = chain.get_account(&addr).map(|a| a.balance).unwrap_or(0);
        let is_frozen = chain.get_account(&addr).map(|a| !a.is_active).unwrap_or(false);
        json!({
            "address": addr,
            "full_name": r.try_get::<String,_>("full_name").unwrap_or_default(),
            "phone": r.try_get::<String,_>("phone").unwrap_or_default(),
            "email": r.try_get::<String,_>("email").unwrap_or_default(),
            "cin": r.try_get::<String,_>("cin").unwrap_or_default(),
            "balance": chain_balance,
            "balance_display": format_millimes(chain_balance),
            "kyc_status": r.try_get::<String,_>("kyc_status").unwrap_or_default(),
            "is_frozen": is_frozen,
            "created_at": r.try_get::<chrono::DateTime<chrono::Utc>,_>("created_at").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "public_key": r.try_get::<String,_>("public_key").ok(),
        })
    }).collect();
    drop(chain);

    log_admin_action(
        &state,
        &admin,
        "list_users",
        "user",
        None,
        json!({"page": page, "search": search}),
    )
    .await;

    Ok(Json(json!({
        "users": users,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": ((total as f64) / (limit as f64)).ceil() as i64,
    })))
}

/// GET /admin/users/:address
pub async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(address): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let row = sqlx::query(
        "SELECT u.*, c.card_last4, c.expiry_month, c.expiry_year, c.frozen as card_frozen,
                c.lost_reported, c.pin_set_at, c.failed_pin_attempts,
                ba.account_number, ba.rib, ba.iban
         FROM users u
         LEFT JOIN cards c ON c.chain_address = u.chain_address
         LEFT JOIN bank_accounts ba ON ba.chain_address = u.chain_address
         WHERE u.chain_address = $1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "User not found")),
    };

    let chain = state.chain.lock().await;
    let acc = chain.get_account(&address);
    let chain_balance = acc.map(|a| a.balance).unwrap_or(0);
    let is_frozen = acc.map(|a| !a.is_active).unwrap_or(false);
    let tx_count = acc.map(|a| a.tx_count).unwrap_or(0);
    let public_key = acc.map(|a| a.public_key.clone()).unwrap_or_default();
    drop(chain);

    // Freeze history
    let freeze_rows = sqlx::query(
        "SELECT fr.*, au.username as admin_username FROM user_freeze_records fr
         LEFT JOIN admin_users au ON au.id = fr.admin_id
         WHERE fr.user_address = $1 ORDER BY fr.frozen_at DESC LIMIT 10",
    )
    .bind(&address)
    .fetch_all(&state.pg_pool)
    .await
    .unwrap_or_default();

    let freeze_history: Vec<Value> = freeze_rows.iter().map(|r| {
        json!({
            "id": r.try_get::<Uuid,_>("id").map(|u| u.to_string()).unwrap_or_default(),
            "reason": r.try_get::<String,_>("reason").unwrap_or_default(),
            "legal_basis": r.try_get::<String,_>("legal_basis").unwrap_or_default(),
            "frozen_at": r.try_get::<chrono::DateTime<chrono::Utc>,_>("frozen_at").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "unfrozen_at": r.try_get::<chrono::DateTime<chrono::Utc>,_>("unfrozen_at").ok().map(|d| d.to_rfc3339()),
            "admin": r.try_get::<String,_>("admin_username").unwrap_or_default(),
        })
    }).collect();

    log_admin_action(
        &state,
        &admin,
        "view_user",
        "user",
        Some(&address),
        json!({}),
    )
    .await;

    Ok(Json(json!({
        "address": address,
        "full_name": row.try_get::<String,_>("full_name").unwrap_or_default(),
        "phone": row.try_get::<String,_>("phone").unwrap_or_default(),
        "email": row.try_get::<String,_>("email").unwrap_or_default(),
        "cin": row.try_get::<String,_>("cin").unwrap_or_default(),
        "date_of_birth": row.try_get::<String,_>("date_of_birth").ok(),
        "address_line": row.try_get::<String,_>("address_line").ok(),
        "governorate": row.try_get::<String,_>("governorate").ok(),
        "kyc_status": row.try_get::<String,_>("kyc_status").unwrap_or_default(),
        "balance": chain_balance,
        "balance_display": format_millimes(chain_balance),
        "is_frozen": is_frozen,
        "tx_count": tx_count,
        "public_key": if public_key.is_empty() { None } else { Some(public_key) },
        "card": {
            "last4": row.try_get::<String,_>("card_last4").unwrap_or_default(),
            "expiry": format!("{}/{}", row.try_get::<String,_>("expiry_month").unwrap_or_default(), row.try_get::<String,_>("expiry_year").unwrap_or_default()),
            "frozen": row.try_get::<bool,_>("card_frozen").unwrap_or(false),
            "lost_reported": row.try_get::<bool,_>("lost_reported").unwrap_or(false),
        },
        "bank": {
            "account_number": row.try_get::<String,_>("account_number").unwrap_or_default(),
            "rib": row.try_get::<String,_>("rib").unwrap_or_default(),
            "iban": row.try_get::<String,_>("iban").unwrap_or_default(),
        },
        "created_at": row.try_get::<chrono::DateTime<chrono::Utc>,_>("created_at").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "freeze_history": freeze_history,
    })))
}

#[derive(Deserialize)]
pub struct FreezeUserRequest {
    pub reason: String,
    pub legal_basis: String, // 'suspicious_activity', 'court_order', 'compliance', 'user_request'
}

/// POST /admin/users/:address/freeze
pub async fn freeze_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(address): Path<String>,
    Json(payload): Json<FreezeUserRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    if payload.reason.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Reason is required"));
    }

    let valid_bases = [
        "suspicious_activity",
        "court_order",
        "compliance",
        "user_request",
    ];
    if !valid_bases.contains(&payload.legal_basis.as_str()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid legal_basis"));
    }

    let admin_uuid = Uuid::parse_str(&admin.admin_id)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid admin ID"))?;

    // Set account inactive on chain
    {
        let mut chain = state.chain.lock().await;
        if let Some(acc) = chain.accounts.get_mut(&address) {
            acc.is_active = false;
        }
    }

    // Record freeze
    let freeze_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO user_freeze_records (id, user_address, admin_id, reason, legal_basis)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(freeze_id)
    .bind(&address)
    .bind(admin_uuid)
    .bind(&payload.reason)
    .bind(&payload.legal_basis)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to freeze account",
        )
    })?;

    log_admin_action(
        &state,
        &admin,
        "freeze_user",
        "user",
        Some(&address),
        json!({
            "reason": payload.reason,
            "legal_basis": payload.legal_basis,
            "freeze_id": freeze_id.to_string(),
        }),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "freeze_id": freeze_id.to_string(),
        "message": "Account frozen successfully",
    })))
}

#[derive(Deserialize)]
pub struct UnfreezeUserRequest {
    pub reason: String,
}

/// POST /admin/users/:address/unfreeze
pub async fn unfreeze_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(address): Path<String>,
    Json(payload): Json<UnfreezeUserRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let admin_uuid = Uuid::parse_str(&admin.admin_id)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid admin ID"))?;

    // Reactivate on chain
    {
        let mut chain = state.chain.lock().await;
        if let Some(acc) = chain.accounts.get_mut(&address) {
            acc.is_active = true;
        }
    }

    // Update latest freeze record
    sqlx::query(
        "UPDATE user_freeze_records SET unfrozen_at = NOW(), unfrozen_by = $1, unfreeze_reason = $2
         WHERE user_address = $3 AND unfrozen_at IS NULL",
    )
    .bind(admin_uuid)
    .bind(&payload.reason)
    .bind(&address)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to unfreeze"))?;

    log_admin_action(
        &state,
        &admin,
        "unfreeze_user",
        "user",
        Some(&address),
        json!({"reason": payload.reason}),
    )
    .await;

    Ok(Json(
        json!({"success": true, "message": "Account unfrozen"}),
    ))
}

// ═══════════════════════════════════════
// TRANSACTION MONITORING
// ═══════════════════════════════════════

/// GET /admin/transactions
pub async fn list_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<UserListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(30).min(100);
    let offset = ((page - 1) * limit) as usize;

    let chain = state.chain.lock().await;
    let all_blocks = chain.blocks().to_vec();
    drop(chain);

    let mut all_txs: Vec<Value> = Vec::new();
    for block in all_blocks.iter().rev() {
        for tx in &block.transactions {
            all_txs.push(json!({
                "hash": tx.hash,
                "type": format!("{:?}", tx.tx_type),
                "from": tx.from,
                "to": tx.to,
                "amount": tx.amount,
                "amount_display": format_millimes(tx.amount),
                "fee": tx.fee,
                "memo": tx.memo,
                "timestamp": tx.timestamp,
                "block": block.index,
                "signature": if tx.signature.len() > 20 { format!("{}...", &tx.signature[..20]) } else { tx.signature.clone() },
            }));
        }
    }

    let total = all_txs.len();
    let page_txs: Vec<Value> = all_txs.into_iter().skip(offset).take(limit).collect();

    log_admin_action(
        &state,
        &admin,
        "list_transactions",
        "transaction",
        None,
        json!({"page": page}),
    )
    .await;

    Ok(Json(json!({
        "transactions": page_txs,
        "total": total,
        "page": page,
        "limit": limit,
    })))
}

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════

/// GET /admin/audit
pub async fn audit_log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<UserListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers)
        .await
        .map_err(|s| api_error(s, "Unauthorized"))?;

    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = ((page - 1) * limit) as i64;

    let rows = sqlx::query(
        "SELECT al.*, au.username as admin_username
         FROM admin_audit_log al
         LEFT JOIN admin_users au ON au.id = al.admin_id
         ORDER BY al.created_at DESC
         LIMIT $1 OFFSET $2",
    )
    .bind(limit as i64)
    .bind(offset)
    .fetch_all(&state.pg_pool)
    .await
    .unwrap_or_default();

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM admin_audit_log")
        .fetch_one(&state.pg_pool)
        .await
        .unwrap_or(0);

    let entries: Vec<Value> = rows.iter().map(|r| {
        json!({
            "id": r.try_get::<Uuid,_>("id").map(|u| u.to_string()).unwrap_or_default(),
            "admin_username": r.try_get::<String,_>("admin_username").unwrap_or_default(),
            "action": r.try_get::<String,_>("action").unwrap_or_default(),
            "resource_type": r.try_get::<String,_>("resource_type").unwrap_or_default(),
            "resource_id": r.try_get::<String,_>("resource_id").unwrap_or_default(),
            "details": r.try_get::<Value,_>("details").unwrap_or(json!({})),
            "created_at": r.try_get::<chrono::DateTime<chrono::Utc>,_>("created_at").map(|d| d.to_rfc3339()).unwrap_or_default(),
        })
    }).collect();

    Ok(Json(json!({
        "entries": entries,
        "total": total,
        "page": page,
        "limit": limit,
    })))
}

/// POST /admin/seed — Create initial admin user (only in development or with superadmin key)
#[derive(Deserialize)]
pub struct SeedAdminRequest {
    pub username: String,
    pub password: String,
    pub full_name: String,
    pub seed_key: String,
}

pub async fn seed_admin(
    State(state): State<AppState>,
    Json(payload): Json<SeedAdminRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let expected_key = std::env::var("NEXAPAY_ADMIN_SEED_KEY")
        .map_err(|_| api_error(StatusCode::FORBIDDEN, "NEXAPAY_ADMIN_SEED_KEY is required"))?;
    if payload.seed_key != expected_key {
        return Err(api_error(StatusCode::FORBIDDEN, "Invalid seed key"));
    }

    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM admin_users")
        .fetch_one(&state.pg_pool)
        .await
        .unwrap_or(0);

    if existing > 0 && state.env == "production" {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "Admin users already exist",
        ));
    }

    let pw_hash = hash_admin_password(&payload.password);
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO admin_users (id, username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, 'superadmin')
         ON CONFLICT (username) DO UPDATE SET password_hash = $3, full_name = $4",
    )
    .bind(id)
    .bind(&payload.username)
    .bind(&pw_hash)
    .bind(&payload.full_name)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create admin"))?;

    Ok(Json(
        json!({"success": true, "message": "Admin user created"}),
    ))
}

// ─── Helpers ───
fn format_millimes(value: u64) -> String {
    let tnd = (value as f64) / 1000.0;
    format!("{:.3} TND", tnd)
}

// ─── Legacy agent endpoints ───
pub async fn list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let _admin = match require_admin(&state, &headers).await {
        Ok(a) => a,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let status = q
        .get("status")
        .cloned()
        .unwrap_or_else(|| "UNDER_REVIEW".to_string());
    let rows = sqlx::query("SELECT id, user_address, business_name, status, risk_score FROM agent_applications WHERE status=$1")
        .bind(status).fetch_all(&state.pg_pool).await.unwrap_or_default();
    let items: Vec<Value> = rows.into_iter().map(|r| {
        json!({"id": r.try_get::<String,_>("id").unwrap_or_default(), "user_address": r.try_get::<String,_>("user_address").unwrap_or_default(), "business_name": r.try_get::<String,_>("business_name").unwrap_or_default(), "status": r.try_get::<String,_>("status").unwrap_or_default(), "risk_score": r.try_get::<f64,_>("risk_score").unwrap_or(0.0)})
    }).collect();
    (StatusCode::OK, Json(json!(items)))
}

pub async fn get_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let _admin = match require_admin(&state, &headers).await {
        Ok(a) => a,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let row = sqlx::query("SELECT * FROM agent_applications WHERE id=$1")
        .bind(&id)
        .fetch_optional(&state.pg_pool)
        .await
        .unwrap_or(None);
    match row {
        Some(r) => (
            StatusCode::OK,
            Json(
                json!({"id": r.try_get::<String,_>("id").unwrap_or_default(), "user_address": r.try_get::<String,_>("user_address").unwrap_or_default(), "business_name": r.try_get::<String,_>("business_name").unwrap_or_default(), "status": r.try_get::<String,_>("status").unwrap_or_default(), "risk_score": r.try_get::<f64,_>("risk_score").unwrap_or(0.0), "reviewer_notes": r.try_get::<String,_>("reviewer_notes").ok()}),
            ),
        ),
        None => (StatusCode::NOT_FOUND, Json(json!({"error":"not_found"}))),
    }
}

pub async fn approve(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let _admin = match require_admin(&state, &headers).await {
        Ok(a) => a,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let notes = body
        .get("reviewer_notes")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let _ = sqlx::query("UPDATE agent_applications SET status='APPROVED', reviewer_notes=$1, reviewed_at=NOW() WHERE id=$2").bind(notes).bind(&id).execute(&state.pg_pool).await;
    (StatusCode::OK, Json(json!({"status":"APPROVED"})))
}

pub async fn reject(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let _admin = match require_admin(&state, &headers).await {
        Ok(a) => a,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let reason = body
        .get("rejection_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("Rejected by admin");
    let _ = sqlx::query("UPDATE agent_applications SET status='REJECTED', rejection_reason=$1, reviewed_at=NOW() WHERE id=$2").bind(reason).bind(&id).execute(&state.pg_pool).await;
    (StatusCode::OK, Json(json!({"status":"REJECTED"})))
}

pub async fn process_withdrawal(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let _admin = match require_admin(&state, &headers).await {
        Ok(a) => a,
        Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))),
    };
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if action == "COMPLETE" {
        let _ = sqlx::query(
            "UPDATE bank_withdrawals SET status='COMPLETED', processed_at=NOW() WHERE id=$1",
        )
        .bind(&id)
        .execute(&state.pg_pool)
        .await;
        return (StatusCode::OK, Json(json!({"status":"COMPLETED"})));
    }
    if action == "REJECT" {
        let reason = body
            .get("rejection_reason")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let _ = sqlx::query("UPDATE bank_withdrawals SET status='REJECTED', rejection_reason=$1, processed_at=NOW() WHERE id=$2").bind(reason).bind(&id).execute(&state.pg_pool).await;
        return (StatusCode::OK, Json(json!({"status":"REJECTED"})));
    }
    (
        StatusCode::BAD_REQUEST,
        Json(json!({"error":"invalid_action"})),
    )
}

// ═══════════════════════════════════════
// NODES — validator status
// ═══════════════════════════════════════

/// GET /admin/nodes — validator node status
pub async fn nodes_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let chain = state.chain.lock().await;
    let validators: Vec<Value> = chain
        .validators
        .iter()
        .map(|(addr, info)| {
            json!({
                "address": addr,
                "url": info.url,
                "is_active": info.is_active,
                "joined_at": info.joined_at,
            })
        })
        .collect();

    let peers_configured = state.validator_peers.len();
    let is_multi = state.is_multi_validator;
    let chain_height = chain.chain_height();
    let mempool_size = chain.pending_transactions.len();
    let total_accounts = chain.accounts.len();
    let revenue_balance = chain
        .get_account(NEXAPAY_REVENUE)
        .map(|a| a.balance)
        .unwrap_or(0);
    drop(chain);

    Ok(Json(json!({
        "success": true,
        "is_multi_validator": is_multi,
        "peers_configured": peers_configured,
        "validators": validators,
        "chain_height": chain_height,
        "mempool_size": mempool_size,
        "total_accounts": total_accounts,
        "revenue_balance_millimes": revenue_balance,
    })))
}

// ═══════════════════════════════════════
// LOGS — recent system events
// ═══════════════════════════════════════

/// GET /admin/logs — recent system events (last 200 lines from audit + chain)
pub async fn system_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    // Recent admin audit log entries
    let audit_rows = sqlx::query(
        "SELECT al.action, al.resource_type, al.resource_id, al.details, al.created_at, au.username
         FROM admin_audit_log al
         JOIN admin_users au ON au.id = al.admin_id
         ORDER BY al.created_at DESC LIMIT 50",
    )
    .fetch_all(&state.pg_pool)
    .await
    .unwrap_or_default();

    let audit_entries: Vec<Value> = audit_rows
        .iter()
        .map(|r| {
            let ts: chrono::DateTime<chrono::Utc> = r.try_get("created_at").unwrap_or_else(|_| chrono::Utc::now());
            json!({
                "source": "audit",
                "message": format!(
                    "{}: {} {} {}",
                    r.try_get::<String, _>("username").unwrap_or_default(),
                    r.try_get::<String, _>("action").unwrap_or_default(),
                    r.try_get::<String, _>("resource_type").unwrap_or_default(),
                    r.try_get::<String, _>("details").unwrap_or_default(),
                ),
                "timestamp": ts.to_rfc3339(),
            })
        })
        .collect();

    // Recent chain transactions
    let chain = state.chain.lock().await;
    let txs: Vec<Value> = chain
        .blocks()
        .iter()
        .rev()
        .take(20)
        .flat_map(|b| {
            b.transactions.iter().map(|tx| {
                json!({
                    "source": "chain",
                    "message": format!(
                        "Block #{}: {} {} -> {} {} millimes (fee: {})",
                        b.index,
                        format!("{:?}", tx.tx_type),
                        &tx.from[..tx.from.len().min(12)],
                        &tx.to[..tx.to.len().min(12)],
                        tx.amount,
                        tx.fee,
                    ),
                    "timestamp": chrono::DateTime::from_timestamp(tx.timestamp as i64, 0)
                        .map(|t| t.to_rfc3339())
                        .unwrap_or_default(),
                })
            })
        })
        .collect();
    drop(chain);

    // Merge and sort by timestamp descending
    let mut all: Vec<Value> = audit_entries;
    all.extend(txs);
    all.sort_by(|a, b| {
        b.get("timestamp")
            .and_then(|v| v.as_str())
            .cmp(&a.get("timestamp").and_then(|v| v.as_str()))
    });
    all.truncate(100);

    Ok(Json(json!({
        "success": true,
        "entries": all,
        "total": all.len(),
    })))
}
