use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use jwt_simple::algorithms::MACLike;
use jwt_simple::prelude::{Claims, Duration};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::account::{AccountType, ChainAccount};
use crate::api::middleware::{
    create_structured_api_key, default_permissions, issue_session_token, log_api_call,
    permissions_to_csv, require_api_key,
};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::crypto::{address_from_public_key, generate_keypair, sha256_hex, sign_hex};

const DEFAULT_DEV_CALL_LIMIT: i32 = 1_000_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeveloperSessionClaims {
    developer_id: String,
    email: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalProfile {
    developer_id: String,
    company_name: String,
    contact_name: String,
    email: String,
    phone: Option<String>,
    call_limit: i32,
    monthly_calls: i32,
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperWorkspaceMetrics {
    gross_volume: i64,
    available_balance: i64,
    today_calls: i64,
    failed_calls: i64,
}

#[derive(Debug, Serialize)]
pub struct RegisterDeveloperResponse {
    api_key: String,
    api_key_prefix: String,
    call_limit: i32,
    docs_url: String,
    session_token: String,
    developer: DeveloperPortalProfile,
}

#[derive(Debug, Serialize)]
pub struct LoginDeveloperResponse {
    success: bool,
    session_token: String,
    api_key_prefix: String,
    developer: DeveloperPortalProfile,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalOverviewResponse {
    success: bool,
    developer: DeveloperPortalProfile,
    workspace: DeveloperWorkspaceMetrics,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalRotateResponse {
    success: bool,
    api_key: String,
    api_key_prefix: String,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalApiKeyItem {
    key_prefix: String,
    name: String,
    status: String,
    permissions: Vec<String>,
    rate_limit_per_minute: i32,
    daily_limit: i32,
    created_at: String,
    last_used_at: Option<String>,
    revoked_at: Option<String>,
    is_primary: bool,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalApiKeysResponse {
    success: bool,
    keys: Vec<DeveloperPortalApiKeyItem>,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalCreateKeyResponse {
    success: bool,
    api_key: String,
    api_key_prefix: String,
    key: DeveloperPortalApiKeyItem,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalWalletOverview {
    address: String,
    balance: u64,
    balance_display: String,
    tx_count: u64,
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalWalletTransaction {
    id: String,
    direction: String,
    amount: u64,
    amount_display: String,
    from: String,
    to: String,
    memo: String,
    timestamp: String,
    block: u64,
    hash: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalWalletResponse {
    success: bool,
    wallet: DeveloperPortalWalletOverview,
    transactions: Vec<DeveloperPortalWalletTransaction>,
    account_token: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalWalletTransferResponse {
    success: bool,
    tx_hash: String,
    block: u64,
    new_balance: u64,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDeveloperRequest {
    company_name: String,
    contact_name: String,
    email: String,
    phone: Option<String>,
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginDeveloperRequest {
    identifier: String,
    password: String,
}


#[derive(Debug, Deserialize)]
pub struct DeveloperPortalRotateKeyRequest {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeveloperPortalCreateKeyRequest {
    name: String,
    permissions: Option<Vec<String>>,
    rate_limit_per_minute: Option<i32>,
    daily_limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct DeveloperPortalRevokeKeyRequest {
    key_prefix: String,
}

#[derive(Debug, Deserialize)]
pub struct DeveloperPortalWalletTransferRequest {
    to: String,
    amount: u64,
    memo: Option<String>,
}

pub async fn register_developer(
    State(state): State<AppState>,
    Json(payload): Json<RegisterDeveloperRequest>,
) -> Result<Json<RegisterDeveloperResponse>, (StatusCode, Json<Value>)> {
    let email = payload.email.trim().to_lowercase();
    if payload.company_name.trim().is_empty()
        || payload.contact_name.trim().is_empty()
        || email.is_empty()
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "company_name, contact_name, and email are required",
        ));
    }

    let phone = payload
        .phone
        .as_deref()
        .and_then(normalize_phone)
        .filter(|value| !value.is_empty());

    let password = payload.password.unwrap_or_default();
    if password.len() < 8 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters",
        ));
    }

    let call_limit = DEFAULT_DEV_CALL_LIMIT;
    let password_hash = hash_developer_password(&password, &email, &state.encryption_key);

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = prefix.chars().take(8).collect::<String>();

    let dev_row = sqlx::query(
        "INSERT INTO developers (company_name, contact_name, email, phone, password_hash, api_key, api_key_prefix, plan, call_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id",
    )
    .bind(payload.company_name.trim())
    .bind(payload.contact_name.trim())
    .bind(&email)
    .bind(phone.as_deref())
    .bind(&password_hash)
    .bind(&api_key_hash)
    .bind(&legacy_prefix)
    .bind("wallet")
    .bind(call_limit)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Developer registration failed: {e}")))?;

    let dev_id: Uuid = dev_row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer ID parse error"))?;

    let _ = sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, 'primary', $2, $3, $4, $5, 60, $6, 'active')",
    )
    .bind(dev_id)
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(call_limit.max(1000))
    .execute(&state.pg_pool)
    .await;

    let (_sk, pk) = generate_keypair();
    let dev_address = address_from_public_key(&pk);
    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: dev_address.clone(),
            public_key: pk,
            balance: 0,
            tx_count: 0,
            account_type: AccountType::Developer,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: sha256_hex(email.as_bytes()),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::DevRegister,
            from: "SYSTEM".to_string(),
            to: dev_address.clone(),
            amount: 0,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &email).unwrap_or_default(),
            memo: format!("Developer registered: {}", payload.company_name.trim()),
            hash: sha256_hex(format!("dev:{}:{}", email, now_ts()).as_bytes()),
        };
        chain.add_pending_transaction(tx.clone());
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&dev_address) {
            let _ = state.sqlite_state.upsert_account(
                &acc.address,
                acc.balance,
                acc.tx_count,
                &acc.account_type,
                acc.is_active,
                now_ts(),
            );
        }
    }

    let developer = load_developer_profile(&state, dev_id).await?;
    let session_token = issue_developer_session_token(&state, dev_id, &email)?;

    log_api_call(&state, None, "/dev/register", "POST", 200).await;

    Ok(Json(RegisterDeveloperResponse {
        api_key,
        api_key_prefix: prefix,
        call_limit,
        docs_url: "https://docs.nexapay.space".to_string(),
        session_token,
        developer,
    }))
}

pub async fn login_developer(
    State(state): State<AppState>,
    Json(payload): Json<LoginDeveloperRequest>,
) -> Result<Json<LoginDeveloperResponse>, (StatusCode, Json<Value>)> {
    let identifier = payload.identifier.trim();
    if identifier.is_empty() || payload.password.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "identifier and password are required",
        ));
    }

    let normalized_phone = normalize_phone(identifier);
    let row = sqlx::query(
        "SELECT id, email, password_hash
         FROM developers
         WHERE is_active = TRUE
           AND (LOWER(email) = LOWER($1) OR ($2::varchar IS NOT NULL AND phone = $2))
         LIMIT 1",
    )
    .bind(identifier)
    .bind(normalized_phone.as_deref())
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = row.ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Invalid developer login"))?;
    let developer_id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer ID parse error"))?;
    let email: String = row
        .try_get("email")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer email parse error"))?;
    let stored_password_hash: Option<String> = row.try_get("password_hash").ok();

    if stored_password_hash.as_deref().unwrap_or_default().is_empty() {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "Password login is not configured for this developer",
        ));
    }

    let provided_hash =
        hash_developer_password(payload.password.trim(), &email, &state.encryption_key);
    if stored_password_hash.unwrap_or_default() != provided_hash {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid developer login"));
    }

    let developer = load_developer_profile(&state, developer_id).await?;
    let session_token = issue_developer_session_token(&state, developer_id, &email)?;
    let api_key_prefix = active_developer_api_key_prefix(&state, developer_id).await;

    Ok(Json(LoginDeveloperResponse {
        success: true,
        session_token,
        api_key_prefix,
        developer,
    }))
}

pub async fn developer_portal_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeveloperPortalOverviewResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, prefix) = require_developer_session(&state, &headers).await?;
    let developer = load_developer_profile(&state, developer_id).await?;

    let gross_total = sum_amount_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        developer_id,
    )
    .await;
    let refunded_total = sum_amount_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        developer_id,
    )
    .await;
    let payouts_total = sum_amount_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        developer_id,
    )
    .await;
    let available_total = (gross_total - refunded_total - payouts_total).max(0);

    let today_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;
    let failed_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND status_code >= 400 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;

    Ok(Json(DeveloperPortalOverviewResponse {
        success: true,
        developer,
        workspace: DeveloperWorkspaceMetrics {
            gross_volume: gross_total,
            available_balance: available_total,
            today_calls,
            failed_calls,
        },
    }))
}

pub async fn developer_portal_rotate_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalRotateKeyRequest>,
) -> Result<Json<DeveloperPortalRotateResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, _prefix) = require_developer_session(&state, &headers).await?;
    let (new_key, new_hash, new_prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = new_prefix.chars().take(8).collect::<String>();
    let key_name = payload.name.unwrap_or_else(|| "primary".to_string());
    let call_limit = load_developer_call_limit(&state, developer_id).await;

    let _ = sqlx::query(
        "UPDATE api_keys
         SET status = 'revoked', revoked_at = NOW(), rotated_at = NOW()
         WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'",
    )
    .bind(developer_id)
    .execute(&state.pg_pool)
    .await;

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, $2, $3, $4, $5, $6, 60, $7, 'active')",
    )
    .bind(developer_id)
    .bind(&key_name)
    .bind(&new_hash)
    .bind(&new_prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(call_limit.max(1000))
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to rotate developer API key"))?;

    let _ = sqlx::query("UPDATE developers SET api_key = $1, api_key_prefix = $2 WHERE id = $3")
        .bind(&new_hash)
        .bind(&legacy_prefix)
        .bind(developer_id)
        .execute(&state.pg_pool)
        .await;

    Ok(Json(DeveloperPortalRotateResponse {
        success: true,
        api_key: new_key,
        api_key_prefix: new_prefix,
        message: "Developer API key rotated successfully".to_string(),
    }))
}

pub async fn developer_portal_api_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeveloperPortalApiKeysResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, primary_prefix) = require_developer_session(&state, &headers).await?;

    let rows = sqlx::query(
        "SELECT prefix, name, status, permissions, rate_limit_per_minute, daily_limit, created_at, last_used_at, revoked_at
         FROM api_keys
         WHERE owner_type = 'developer' AND owner_id = $1
         ORDER BY created_at DESC",
    )
    .bind(developer_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let keys = rows
        .into_iter()
        .map(|row| developer_api_key_item_from_row(row, &primary_prefix))
        .collect::<Vec<_>>();

    log_api_call(&state, None, "/dev/portal/api-keys", "GET", 200).await;

    Ok(Json(DeveloperPortalApiKeysResponse {
        success: true,
        keys,
    }))
}

pub async fn developer_portal_create_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalCreateKeyRequest>,
) -> Result<Json<DeveloperPortalCreateKeyResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, primary_prefix) = require_developer_session(&state, &headers).await?;

    if payload.name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Key name is required"));
    }

    let permissions = payload
        .permissions
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| default_permissions("developer"));
    let rate_limit_per_minute = payload.rate_limit_per_minute.unwrap_or(120).max(10);
    let daily_limit = payload
        .daily_limit
        .unwrap_or(DEFAULT_DEV_CALL_LIMIT)
        .max(rate_limit_per_minute);

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");

    let row = sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING prefix, name, status, permissions, rate_limit_per_minute, daily_limit, created_at, last_used_at, revoked_at",
    )
    .bind(developer_id)
    .bind(payload.name.trim())
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&permissions))
    .bind(rate_limit_per_minute)
    .bind(daily_limit)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create developer API key"))?;

    log_api_call(&state, None, "/dev/portal/api-keys/create", "POST", 200).await;

    Ok(Json(DeveloperPortalCreateKeyResponse {
        success: true,
        api_key,
        api_key_prefix: prefix,
        key: developer_api_key_item_from_row(row, &primary_prefix),
    }))
}

pub async fn developer_portal_revoke_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalRevokeKeyRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (developer_id, primary_prefix) = require_developer_session(&state, &headers).await?;

    let active_count = scalar_count_by_uuid(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_keys WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'",
        developer_id,
    )
    .await;

    if payload.key_prefix == primary_prefix && active_count <= 1 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Create a replacement key before revoking your last active key",
        ));
    }

    let affected = sqlx::query(
        "DELETE FROM api_keys
         WHERE owner_type = 'developer' AND owner_id = $1 AND prefix = $2 AND status = 'active'",
    )
    .bind(developer_id)
    .bind(payload.key_prefix.trim())
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .rows_affected();

    if affected == 0 {
        return Err(api_error(StatusCode::NOT_FOUND, "Active developer key not found"));
    }

    log_api_call(&state, None, "/dev/portal/api-keys/revoke", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "revoked_prefix": payload.key_prefix.trim(),
    })))
}

pub async fn developer_portal_wallet(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeveloperPortalWalletResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, _prefix) = require_developer_session(&state, &headers).await?;
    let developer = load_developer_profile(&state, developer_id).await?;
    let wallet = ensure_developer_wallet(&state, &developer.company_name, &developer.email).await?;

    let session_id = Uuid::new_v4().to_string();
    let account_token = issue_session_token(&state, &wallet.address, &sha256_hex(developer.email.as_bytes()), &session_id)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to issue wallet token"))?;

    let transactions = collect_wallet_transactions(&state, &wallet.address).await;

    log_api_call(&state, None, "/dev/portal/wallet", "GET", 200).await;

    Ok(Json(DeveloperPortalWalletResponse {
        success: true,
        wallet: DeveloperPortalWalletOverview {
            address: wallet.address,
            balance: wallet.balance,
            balance_display: format_millimes(wallet.balance),
            tx_count: wallet.tx_count,
            created_at: ts_to_rfc3339(wallet.created_at),
        },
        transactions,
        account_token,
    }))
}

pub async fn developer_portal_wallet_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalWalletTransferRequest>,
) -> Result<Json<DeveloperPortalWalletTransferResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, _prefix) = require_developer_session(&state, &headers).await?;
    let developer = load_developer_profile(&state, developer_id).await?;
    let sender_wallet = ensure_developer_wallet(&state, &developer.company_name, &developer.email).await?;

    if !is_valid_address(payload.to.trim()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid recipient address"));
    }
    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }

    let fee = 10u64;
    let tx_hash = sha256_hex(
        format!(
            "{}{}{}{}",
            sender_wallet.address,
            payload.to.trim(),
            payload.amount,
            now_ts()
        )
        .as_bytes(),
    );

    let mut chain = state.chain.lock().await;
    let from_balance = chain
        .get_account(&sender_wallet.address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Developer wallet not found"))?
        .balance;

    if chain.get_account(payload.to.trim()).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }
    if from_balance < payload.amount.saturating_add(fee) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient balance"));
    }

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: sender_wallet.address.clone(),
        to: payload.to.trim().to_string(),
        amount: payload.amount,
        fee,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: payload.memo.unwrap_or_default(),
        hash: tx_hash.clone(),
    };

    chain.add_pending_transaction(tx.clone());
    let block = chain
        .mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        )
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to append block"))?;

    let new_balance = chain
        .get_account(&sender_wallet.address)
        .map(|account| account.balance)
        .unwrap_or(from_balance);

    if let Some(from_acc) = chain.get_account(&sender_wallet.address) {
        let _ = state.sqlite_state.upsert_account(
            &from_acc.address,
            from_acc.balance,
            from_acc.tx_count,
            &from_acc.account_type,
            from_acc.is_active,
            now_ts(),
        );
    }
    if let Some(to_acc) = chain.get_account(payload.to.trim()) {
        let _ = state.sqlite_state.upsert_account(
            &to_acc.address,
            to_acc.balance,
            to_acc.tx_count,
            &to_acc.account_type,
            to_acc.is_active,
            now_ts(),
        );
    }

    let _ = state.sqlite_state.record_transaction(&tx, block.index);

    log_api_call(&state, None, "/dev/portal/wallet/transfer", "POST", 200).await;

    Ok(Json(DeveloperPortalWalletTransferResponse {
        success: true,
        tx_hash,
        block: block.index,
        new_balance,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RepairAccountRequest {
    pub address: String,
    pub balance: Option<u64>,
}

pub async fn repair_account(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<RepairAccountRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    if app_env != "development" {
        if let Ok(principal) = require_api_key(&state, &headers).await {
            if !matches!(principal, crate::api::middleware::ApiPrincipal::Developer { .. }) {
                return Err((StatusCode::FORBIDDEN, Json(json!({"success": false, "error": "Forbidden"}))));
            }
        } else {
            return Err((StatusCode::FORBIDDEN, Json(json!({"success": false, "error": "Forbidden"}))));
        }
    }

    if payload.address.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"success": false, "error": "address required"}))));
    }

    let initial = payload.balance.unwrap_or(0u64);

    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: payload.address.clone(),
            public_key: String::new(),
            balance: initial,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: String::new(),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::AccountCreate,
            from: "SYSTEM".to_string(),
            to: payload.address.clone(),
            amount: initial,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &payload.address).unwrap_or_default(),
            memo: "Repair account created by dev tool".to_string(),
            hash: sha256_hex(format!("repair:{}:{}", payload.address, now_ts()).as_bytes()),
        };

        chain.add_pending_transaction(tx.clone());
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&payload.address) {
            let _ = state.sqlite_state.upsert_account(
                &acc.address,
                acc.balance,
                acc.tx_count,
                &acc.account_type,
                acc.is_active,
                now_ts(),
            );
        }
    }

    log_api_call(&state, None, "/dev/repair_account", "POST", 200).await;

    Ok(Json(json!({"success": true, "address": payload.address})))
}

async fn require_developer_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Uuid, String), (StatusCode, Json<Value>)> {
    let token = headers
        .get("X-Developer-Token")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "X-Developer-Token header is required"))?;

    let claims = state
        .jwt_key
        .verify_token::<DeveloperSessionClaims>(&token, None)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid developer session"))?;

    let developer_id = Uuid::parse_str(&claims.custom.developer_id)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid developer session"))?;

    let prefix = active_developer_api_key_prefix(state, developer_id).await;
    Ok((developer_id, prefix))
}

fn issue_developer_session_token(
    state: &AppState,
    developer_id: Uuid,
    email: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    let claims = Claims::with_custom_claims(
        DeveloperSessionClaims {
            developer_id: developer_id.to_string(),
            email: email.to_string(),
        },
        Duration::from_hours(24 * 14),
    );

    state
        .jwt_key
        .authenticate(claims)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to issue developer session"))
}

async fn load_developer_profile(
    state: &AppState,
    developer_id: Uuid,
) -> Result<DeveloperPortalProfile, (StatusCode, Json<Value>)> {
    let row = sqlx::query(
        "SELECT id, company_name, contact_name, email, phone, call_limit, monthly_calls, created_at
         FROM developers
         WHERE id = $1 AND is_active = TRUE
         LIMIT 1",
    )
    .bind(developer_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Developer not found"))?;

    Ok(DeveloperPortalProfile {
        developer_id: row.try_get::<Uuid, _>("id").map(|value| value.to_string()).unwrap_or_default(),
        company_name: row.try_get::<String, _>("company_name").unwrap_or_default(),
        contact_name: row.try_get::<String, _>("contact_name").unwrap_or_default(),
        email: row.try_get::<String, _>("email").unwrap_or_default(),
        phone: row.try_get::<Option<String>, _>("phone").ok().flatten(),
        call_limit: row.try_get::<i32, _>("call_limit").unwrap_or(1000),
        monthly_calls: row.try_get::<i32, _>("monthly_calls").unwrap_or(0),
        created_at: row
            .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
            .map(|value| value.to_rfc3339())
            .unwrap_or_default(),
    })
}

async fn active_developer_api_key_prefix(state: &AppState, developer_id: Uuid) -> String {
    sqlx::query(
        "SELECT prefix
         FROM api_keys
         WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(developer_id)
    .fetch_optional(&state.pg_pool)
    .await
    .ok()
    .flatten()
    .and_then(|row| row.try_get::<String, _>("prefix").ok())
    .unwrap_or_else(|| "nxp_developer".to_string())
}

async fn load_developer_call_limit(state: &AppState, developer_id: Uuid) -> i32 {
    sqlx::query("SELECT call_limit FROM developers WHERE id = $1 LIMIT 1")
        .bind(developer_id)
        .fetch_optional(&state.pg_pool)
        .await
        .ok()
        .flatten()
        .and_then(|row| row.try_get::<i32, _>("call_limit").ok())
        .unwrap_or(1_000_000)
}

fn developer_api_key_item_from_row(
    row: sqlx::postgres::PgRow,
    primary_prefix: &str,
) -> DeveloperPortalApiKeyItem {
    let prefix = row.try_get::<String, _>("prefix").unwrap_or_default();

    DeveloperPortalApiKeyItem {
        key_prefix: prefix.clone(),
        name: row
            .try_get::<String, _>("name")
            .unwrap_or_else(|_| "API key".to_string()),
        status: row
            .try_get::<String, _>("status")
            .unwrap_or_else(|_| "active".to_string()),
        permissions: split_permissions(row.try_get::<String, _>("permissions").unwrap_or_default()),
        rate_limit_per_minute: row.try_get::<i32, _>("rate_limit_per_minute").unwrap_or(60),
        daily_limit: row.try_get::<i32, _>("daily_limit").unwrap_or(DEFAULT_DEV_CALL_LIMIT),
        created_at: row
            .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
            .map(|value| value.to_rfc3339())
            .unwrap_or_default(),
        last_used_at: row
            .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_used_at")
            .ok()
            .flatten()
            .map(|value| value.to_rfc3339()),
        revoked_at: row
            .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("revoked_at")
            .ok()
            .flatten()
            .map(|value| value.to_rfc3339()),
        is_primary: prefix == primary_prefix,
    }
}

async fn ensure_developer_wallet(
    state: &AppState,
    company_name: &str,
    email: &str,
) -> Result<ChainAccount, (StatusCode, Json<Value>)> {
    let email_hash = sha256_hex(email.as_bytes());
    let registration_memo = format!("Developer registered: {}", company_name.trim());
    let fallback_address = developer_wallet_address(email);

    let mut chain = state.chain.lock().await;

    let located_address = chain
        .accounts
        .values()
        .find(|account| account.account_type == AccountType::Developer && account.kyc_hash == email_hash)
        .map(|account| account.address.clone())
        .or_else(|| {
            chain
                .blocks()
                .iter()
                .rev()
                .flat_map(|block| block.transactions.iter().rev())
                .find(|tx| tx.tx_type == TxType::DevRegister && tx.memo == registration_memo)
                .map(|tx| tx.to.clone())
        })
        .or_else(|| {
            if chain.get_account(&fallback_address).is_some() {
                Some(fallback_address.clone())
            } else {
                None
            }
        })
        .unwrap_or_else(|| fallback_address.clone());

    let wallet = chain
        .accounts
        .entry(located_address.clone())
        .or_insert(ChainAccount {
            address: located_address.clone(),
            public_key: String::new(),
            balance: 0,
            tx_count: 0,
            account_type: AccountType::Developer,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: email_hash.clone(),
        });

    wallet.account_type = AccountType::Developer;
    wallet.is_active = true;
    if wallet.kyc_hash.is_empty() {
        wallet.kyc_hash = email_hash;
    }

    let snapshot = wallet.clone();
    drop(chain);

    let _ = state.sqlite_state.upsert_account(
        &snapshot.address,
        snapshot.balance,
        snapshot.tx_count,
        &snapshot.account_type,
        snapshot.is_active,
        now_ts(),
    );

    Ok(snapshot)
}

async fn collect_wallet_transactions(
    state: &AppState,
    address: &str,
) -> Vec<DeveloperPortalWalletTransaction> {
    let chain = state.chain.lock().await;
    let mut transactions = chain
        .blocks()
        .iter()
        .flat_map(|block| {
            block.transactions.iter().filter_map(move |tx| {
                if tx.from != address && tx.to != address {
                    return None;
                }

                Some(DeveloperPortalWalletTransaction {
                    id: tx.id.clone(),
                    direction: if tx.to == address {
                        "credit".to_string()
                    } else {
                        "debit".to_string()
                    },
                    amount: tx.amount,
                    amount_display: format_millimes(tx.amount),
                    from: tx.from.clone(),
                    to: tx.to.clone(),
                    memo: tx.memo.clone(),
                    timestamp: ts_to_rfc3339(tx.timestamp),
                    block: block.index,
                    hash: tx.hash.clone(),
                })
            })
        })
        .collect::<Vec<_>>();

    transactions.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    transactions
}

fn split_permissions(raw: String) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect()
}

fn developer_wallet_address(email: &str) -> String {
    format!(
        "NXP{}",
        &sha256_hex(format!("dev-wallet:{email}:nexapay").as_bytes())[..32]
    )
}

fn is_valid_address(address: &str) -> bool {
    address.len() == 35
        && address.starts_with("NXP")
        && address
            .chars()
            .skip(3)
            .all(|ch| matches!(ch, '0'..='9' | 'a'..='f'))
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    format!("{}.{:03} TND", whole, frac)
}

fn ts_to_rfc3339(ts: u64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(ts as i64, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339()
}

async fn scalar_count_by_prefix(pool: &sqlx::PgPool, query: &str, prefix: &str) -> i64 {
    sqlx::query(query)
        .bind(prefix)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn scalar_count_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn sum_amount_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

fn normalize_phone(raw: &str) -> Option<String> {
    let digits = raw.chars().filter(|c| c.is_ascii_digit()).collect::<String>();
    if digits.len() == 8 {
        return Some(format!("216{digits}"));
    }
    if (10..=15).contains(&digits.len()) {
        return Some(digits);
    }
    None
}

fn hash_developer_password(password: &str, email: &str, pepper: &str) -> String {
    sha256_hex(
        format!("developer-password:{}:{}:{}", email.trim().to_lowercase(), password, pepper)
            .as_bytes(),
    )
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
