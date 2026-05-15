use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Multipart, Path, Query, State};
use rand::Rng;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Sse;
use axum::Json;
use tokio_stream::wrappers::UnboundedReceiverStream;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::auth::login_phone_variants;
use crate::api::middleware::{
    auth_error_response, log_api_call, require_account_token, try_api_key,
};
use crate::api::AppState;
use crate::account::{AccountType, ChainAccount};
use crate::block::{Transaction, TxType};
use crate::crypto::{decrypt_aes256_gcm, hash_transaction_pin, sha256_hex, sign_hex};

#[derive(Debug, Serialize)]
pub struct CardSummary {
    pub last4: String,
    pub expiry: String,
    #[serde(rename = "type")]
    pub card_type: String,
}

#[derive(Debug, Serialize)]
pub struct AccountDetailsResponse {
    pub address: String,
    pub full_name: String,
    pub balance: u64,
    pub balance_display: String,
    pub account_number: String,
    pub rib: String,
    pub iban: String,
    pub card: CardSummary,
    pub kyc_status: String,
    /// `"User"` or `"Agent"` based on `agent_profiles`.
    pub account_type: String,
    pub tx_count: u64,
    pub created_at: String,
    pub cin: String,
    pub address_line: Option<String>,
    pub delegation: Option<String>,
    pub governorate: Option<String>,
    pub avatar_url: Option<String>,
    pub phone: String,
    pub email: String,
    pub card_frozen: bool,
    pub card_lost_reported: bool,
}

#[derive(Debug, Serialize)]
pub struct TransactionListResponse {
    transactions: Vec<TransactionView>,
}

#[derive(Debug, Serialize)]
pub struct TransactionView {
    id: String,
    #[serde(rename = "type")]
    tx_type: String,
    direction: String,
    amount: u64,
    amount_display: String,
    from: String,
    to: String,
    from_name: String,
    to_name: String,
    memo: String,
    timestamp: String,
    block: u64,
    hash: String,
}

#[derive(Debug, Deserialize)]
pub struct TransferRequest {
    pub to: String,
    pub amount: u64,
    #[serde(default)]
    pub memo: Option<String>,
    pub pin: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchAccountsQuery {
    q: String,
}

#[derive(Debug, Serialize)]
pub struct SearchAccountsResponse {
    results: Vec<SearchAccountItem>,
}

#[derive(Debug, Serialize)]
pub struct SearchAccountItem {
    chain_address: String,
    full_name: String,
    cin: String,
    phone: String,
}

#[derive(Debug, Serialize)]
pub struct PublicAccountResponse {
    chain_address: String,
    full_name: String,
    account_number_masked: String,
    iban_masked: String,
}

#[derive(Debug, Deserialize)]
pub struct SetPinRequest {
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct AccountNotification {
    pub id: String,
    #[serde(rename = "type")]
    pub notification_type: String,
    pub amount: u64,
    pub amount_display: String,
    pub from_address: String,
    pub from_name: String,
    pub memo: String,
    pub created_at: String,
    pub is_read: bool,
}

#[derive(Debug, Serialize)]
pub struct NotificationsResponse {
    pub notifications: Vec<AccountNotification>,
}

#[derive(Debug, Deserialize)]
pub struct CardWalletPayRequest {
    amount: u64,
    card_number: String,
    expiry_month: String,
    expiry_year: String,
    cvv: String,
    pin: String,
    card_holder_name: Option<String>,
    memo: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CardWalletPayResponse {
    success: bool,
    status: String,
    recipient: String,
    amount: u64,
    amount_display: String,
    tx_hash: Option<String>,
    block: Option<u64>,
    recipient_balance: Option<u64>,
    failure_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransferResponse {
    pub success: bool,
    pub tx_hash: String,
    pub block: u64,
    pub new_balance: u64,
    pub to_name: String,
}

#[derive(Debug, Deserialize)]
pub struct RequestTransferOtpPayload {
    pub to: String,
    pub amount: u64,
    #[serde(default)]
    pub memo: Option<String>,
    pub pin: String,
    #[serde(default)]
    pub rib: Option<String>,
    #[serde(default)]
    pub beneficiary_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RequestTransferOtpResponse {
    pub step: String,
    pub otp_id: String,
    pub phone_hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_otp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyTransferOtpPayload {
    pub otp_id: String,
    pub otp_code: String,
}

#[derive(Debug, Deserialize)]
pub struct BankTransferRequest {
    pub rib: String,
    pub beneficiary_name: String,
    pub amount: u64,
    #[serde(default)]
    pub memo: Option<String>,
    pub pin: String,
    pub otp_id: String,
    pub otp_code: String,
}

#[derive(Debug, Serialize)]
pub struct BankTransferResponse {
    pub success: bool,
    pub transfer_id: String,
    pub amount_display: String,
    pub status: String,
}

pub async fn get_public_account(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<PublicAccountResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    if !is_valid_address(&address) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid address"));
    }

    let row = sqlx::query(
        "SELECT u.full_name, b.account_number, b.iban
         FROM users u
         JOIN bank_accounts b ON b.chain_address = u.chain_address
         WHERE u.chain_address = $1
         LIMIT 1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Account not found")),
    };

    Ok(Json(PublicAccountResponse {
        chain_address: address,
        full_name: row.try_get::<String, _>("full_name").unwrap_or_else(|_| "Unknown".to_string()),
        account_number_masked: mask_tail(&row.try_get::<String, _>("account_number").unwrap_or_default(), 4),
        iban_masked: mask_tail(&row.try_get::<String, _>("iban").unwrap_or_default(), 4),
    }))
}

pub async fn get_account(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<AccountDetailsResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let row = sqlx::query(
        "SELECT u.full_name, u.created_at, u.kyc_status, u.cin, u.phone, u.email, u.address_line, u.delegation, u.governorate, u.avatar_url, b.account_number, b.rib, b.iban,
                c.card_last4, c.card_number, c.expiry_month, c.expiry_year, c.frozen, c.lost_reported
         FROM users u
         LEFT JOIN bank_accounts b ON b.chain_address = u.chain_address
         LEFT JOIN cards c ON c.chain_address = u.chain_address
         WHERE u.chain_address = $1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Account not found")),
    };

    let full_name: String = row.try_get("full_name").unwrap_or_else(|_| "Unknown".to_string());
    let created_at: chrono::DateTime<chrono::Utc> = row
        .try_get("created_at")
        .unwrap_or_else(|_| chrono::Utc::now());
    let kyc_status: String = row
        .try_get("kyc_status")
        .unwrap_or_else(|_| "verified".to_string());
    let cin: String = row.try_get("cin").unwrap_or_default();
    let phone: String = row.try_get("phone").unwrap_or_default();
    let email: String = row.try_get("email").unwrap_or_default();
    let address_line: Option<String> = row.try_get("address_line").ok();
    let delegation: Option<String> = row.try_get("delegation").ok();
    let governorate: Option<String> = row.try_get("governorate").ok();
    let avatar_url: Option<String> = row.try_get("avatar_url").ok();
    let account_number: String = row.try_get("account_number").unwrap_or_default();
    let rib: String = row.try_get("rib").unwrap_or_default();
    let iban: String = row.try_get("iban").unwrap_or_default();
    let mut card_last4: String = row.try_get("card_last4").unwrap_or_default();
    if card_last4.len() < 4 {
        let encrypted_card: String = row.try_get("card_number").unwrap_or_default();
        let card_number = decrypt_aes256_gcm(&state.encryption_key, &encrypted_card).unwrap_or_default();
        card_last4 = if card_number.len() >= 4 {
            card_number[card_number.len() - 4..].to_string()
        } else {
            "0000".to_string()
        };
    }
    let expiry_month: String = row.try_get("expiry_month").unwrap_or_else(|_| "01".to_string());
    let expiry_year: String = row.try_get("expiry_year").unwrap_or_else(|_| "2029".to_string());
    let y2 = if expiry_year.len() >= 2 {
        &expiry_year[expiry_year.len() - 2..]
    } else {
        expiry_year.as_str()
    };
    let card_frozen: bool = row.try_get("frozen").unwrap_or(false);
    let card_lost_reported: bool = row.try_get("lost_reported").unwrap_or(false);

    let is_agent: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM agent_profiles WHERE user_address = $1 AND COALESCE(is_active, false) = true)",
    )
    .bind(&address)
    .fetch_one(&state.pg_pool)
    .await
    .unwrap_or(false);
    let account_type = if is_agent {
        "Agent".to_string()
    } else {
        "User".to_string()
    };

    let chain = state.chain.lock().await;
    let chain_account = chain
        .get_account(&address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "On-chain account not found"))?;

    log_api_call(&state, principal.as_ref(), "/accounts/:address", "GET", 200).await;

    Ok(Json(AccountDetailsResponse {
        address: address.clone(),
        full_name,
        balance: chain_account.balance,
        balance_display: format_millimes(chain_account.balance),
        account_number,
        rib,
        iban,
        card: CardSummary {
            last4: card_last4,
            expiry: format!("{}/{}", expiry_month, y2),
            card_type: "VISA".to_string(),
        },
        kyc_status,
        account_type,
        tx_count: chain_account.tx_count,
        created_at: created_at.to_rfc3339(),
        cin,
        phone,
        email,
        address_line,
        delegation,
        governorate,
        avatar_url,
        card_frozen,
        card_lost_reported,
    }))
}

pub async fn get_account_notifications(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<NotificationsResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let mut pending: Vec<(String, u64, String, String, u64)> = Vec::new();

    {
        let chain = state.chain.lock().await;
        for block in chain.blocks() {
            for tx in &block.transactions {
                if tx.to != address || tx.amount == 0 {
                    continue;
                }
                if matches!(tx.tx_type, TxType::Transfer | TxType::AccountCreate) {
                    pending.push((
                        tx.id.clone(),
                        tx.amount,
                        tx.from.clone(),
                        tx.memo.clone(),
                        tx.timestamp,
                    ));
                }
            }
        }
    }

    pending.sort_by(|a, b| b.4.cmp(&a.4));
    pending.truncate(50);

    // Fetch read tx_ids for this user
    let read_rows = sqlx::query("SELECT tx_id FROM notification_reads WHERE user_address = $1")
        .bind(&address)
        .fetch_all(&state.pg_pool)
        .await
        .unwrap_or_default();
    let read_set: std::collections::HashSet<String> = read_rows
        .into_iter()
        .filter_map(|r| r.try_get::<String, _>("tx_id").ok())
        .collect();

    let mut notifications = Vec::new();
    for (id, amount, from, memo, ts) in pending {
        let from_name = lookup_display_name(&state, &from).await;
        notifications.push(AccountNotification {
            id: id.clone(),
            notification_type: "credit".to_string(),
            amount,
            amount_display: format_millimes(amount),
            from_address: from.clone(),
            from_name,
            memo,
            created_at: ts_to_rfc3339(ts),
            is_read: read_set.contains(&id),
        });
    }

    log_api_call(
        &state,
        principal.as_ref(),
        "/accounts/:address/notifications",
        "GET",
        200,
    )
    .await;

    Ok(Json(NotificationsResponse { notifications }))
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    Path((address, tx_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, HeaderMap, Json<serde_json::Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let _ = sqlx::query(
        "INSERT INTO notification_reads (user_address, tx_id) VALUES ($1, $2) ON CONFLICT (user_address, tx_id) DO NOTHING",
    )
    .bind(&address)
    .bind(&tx_id)
    .execute(&state.pg_pool)
    .await;

    log_api_call(&state, principal.as_ref(), "/accounts/:address/notifications/:id/read", "POST", 200).await;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, HeaderMap, Json<serde_json::Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    // Collect all notification tx_ids for this user from the chain
    let tx_ids: Vec<String> = {
        let chain = state.chain.lock().await;
        chain.blocks()
            .iter()
            .flat_map(|b| &b.transactions)
            .filter(|tx| tx.to == address && tx.amount > 0)
            .filter(|tx| matches!(tx.tx_type, TxType::Transfer | TxType::AccountCreate))
            .map(|tx| tx.id.clone())
            .collect()
    };

    for tx_id in tx_ids {
        let _ = sqlx::query(
            "INSERT INTO notification_reads (user_address, tx_id) VALUES ($1, $2) ON CONFLICT (user_address, tx_id) DO NOTHING",
        )
        .bind(&address)
        .bind(&tx_id)
        .execute(&state.pg_pool)
        .await;
    }

    log_api_call(&state, principal.as_ref(), "/accounts/:address/notifications/read-all", "POST", 200).await;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn set_transaction_pin(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(body): Json<SetPinRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if body.pin.len() != 6 || !body.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be 6 digits"));
    }

    let pin_hash = hash_transaction_pin(&address, &body.pin, &state.encryption_key);
    let res = sqlx::query(
        "UPDATE cards SET pin_hash = $1, failed_pin_attempts = 0 WHERE chain_address = $2",
    )
    .bind(&pin_hash)
    .bind(&address)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if res.rows_affected() == 0 {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "Card record not found for this account",
        ));
    }

    log_api_call(&state, principal.as_ref(), "/accounts/:address/set-pin", "POST", 200).await;

    Ok(Json(json!({ "success": true })))
}

pub async fn get_account_transactions(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<TransactionListResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let chain = state.chain.lock().await;
    let mut raw_txs = Vec::new();
    for block in chain.blocks() {
        for tx in &block.transactions {
            if tx.from == address || tx.to == address {
                raw_txs.push((tx.clone(), block.index));
            }
        }
    }
    drop(chain);
    raw_txs.reverse(); // newest first

    // Batch-resolve display names for all unique addresses
    let mut name_map = std::collections::HashMap::new();
    for (tx, _) in &raw_txs {
        name_map.insert(tx.from.clone(), ());
        name_map.insert(tx.to.clone(), ());
    }
    let mut resolved = std::collections::HashMap::new();
    for addr in name_map.keys() {
        let name = lookup_display_name(&state, addr).await;
        resolved.insert(addr.clone(), name);
    }

    let mut transactions = Vec::new();
    for (tx, block_index) in raw_txs {
        transactions.push(TransactionView {
            id: tx.id,
            tx_type: format!("{:?}", tx.tx_type),
            direction: if tx.to == address {
                "credit".to_string()
            } else {
                "debit".to_string()
            },
            amount: tx.amount,
            amount_display: format_millimes(tx.amount),
            from: tx.from.clone(),
            to: tx.to.clone(),
            from_name: resolved.get(&tx.from).cloned().unwrap_or_else(|| tx.from.clone()),
            to_name: resolved.get(&tx.to).cloned().unwrap_or_else(|| tx.to.clone()),
            memo: tx.memo,
            timestamp: ts_to_rfc3339(tx.timestamp),
            block: block_index,
            hash: tx.hash,
        });
    }

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transactions", "GET", 200).await;

    Ok(Json(TransactionListResponse { transactions }))
}

pub async fn search_accounts(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Query(query): Query<SearchAccountsQuery>,
    headers: HeaderMap,
) -> Result<Json<SearchAccountsResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let needle = query.q.trim();
    if needle.len() < 2 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Search query must contain at least 2 characters",
        ));
    }

    let like_pattern = format!("%{}%", needle.to_lowercase());
    let numeric_pattern = format!("%{}%", needle);

    let rows = sqlx::query(
        "SELECT chain_address, full_name, cin, phone
         FROM users
         WHERE chain_address <> $1
           AND (
               LOWER(full_name) LIKE $2
               OR cin LIKE $3
               OR phone LIKE $3
           )
         ORDER BY full_name ASC
         LIMIT 20",
    )
    .bind(&address)
    .bind(&like_pattern)
    .bind(&numeric_pattern)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let results = rows
        .into_iter()
        .map(|row| SearchAccountItem {
            chain_address: row.try_get::<String, _>("chain_address").unwrap_or_default(),
            full_name: row.try_get::<String, _>("full_name").unwrap_or_default(),
            cin: row.try_get::<String, _>("cin").unwrap_or_default(),
            phone: row.try_get::<String, _>("phone").unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    log_api_call(&state, principal.as_ref(), "/accounts/:address/search", "GET", 200).await;

    Ok(Json(SearchAccountsResponse { results }))
}

pub async fn transfer(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<TransferRequest>,
) -> Result<Json<TransferResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }
    if payload.pin.len() != 6 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be 6 digits"));
    }

    let pin_row = sqlx::query("SELECT pin_hash FROM cards WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let stored_pin = pin_row
        .and_then(|r| r.try_get::<String, _>("pin_hash").ok())
        .filter(|s| !s.is_empty());
    let stored_pin = stored_pin.ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "Set your transaction PIN before transferring",
        )
    })?;
    let provided_pin = hash_transaction_pin(&address, &payload.pin, &state.encryption_key);
    if provided_pin != stored_pin {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid PIN"));
    }

    let (to_address, to_name) = resolve_transfer_recipient(&state, &payload.to)
        .await
        .map_err(|msg| match msg {
            "recipient_not_found" => api_error(StatusCode::NOT_FOUND, "Recipient not found"),
            "db_error" => api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            _ => api_error(StatusCode::BAD_REQUEST, "Invalid recipient (use NXP address, email, or phone)"),
        })?;

    let fee = 10u64;
    let tx_hash = sha256_hex(
        format!("{}{}{}{}", address, to_address, payload.amount, now_ts()).as_bytes(),
    );

    let mut chain = state.chain.lock().await;
    let from_balance = chain
        .get_account(&address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Sender account not found"))?
        .balance;
    if chain.get_account(&to_address).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }
    if from_balance < payload.amount.saturating_add(fee) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient balance"));
    }

    let memo = payload.memo.clone().unwrap_or_default();

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: address.clone(),
        to: to_address.clone(),
        amount: payload.amount,
        fee,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo,
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
        .get_account(&address)
        .map(|a| a.balance)
        .unwrap_or(from_balance);

    if let Some(from_acc) = chain.get_account(&address) {
        let _ = state.sqlite_state.upsert_account(
            &from_acc.address,
            from_acc.balance,
            from_acc.tx_count,
            &from_acc.account_type,
            from_acc.is_active,
            now_ts(),
        );
    }
    if let Some(to_acc) = chain.get_account(&to_address) {
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

    // Notify connected SSE clients
    let from_name = lookup_display_name(&state, &address).await;
    let event = serde_json::json!({
        "type": "transfer",
        "from": address,
        "to": to_address,
        "from_name": from_name,
        "to_name": to_name,
        "amount": payload.amount,
        "amount_display": format_millimes(payload.amount),
        "memo": payload.memo.clone().unwrap_or_default(),
        "timestamp": now_ts(),
    });
    let event_str = event.to_string();
    broadcast_event(&state, &address, &event_str);
    broadcast_event(&state, &to_address, &event_str);

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transfer", "POST", 200).await;

    Ok(Json(TransferResponse {
        success: true,
        tx_hash,
        block: block.index,
        new_balance,
        to_name,
    }))
}

fn is_valid_otp(otp: &str) -> bool {
    Regex::new(r"^\d{6}$").map(|re| re.is_match(otp)).unwrap_or(false)
}

fn generate_otp_code() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000))
}

fn hash_transfer_otp(address: &str, otp: &str, pepper: &str) -> String {
    sha256_hex(format!("tx_otp:{}:{}:{}", address, otp, pepper).as_bytes())
}

async fn send_transfer_otp_sms(state: &AppState, to: &str, otp: &str) -> Result<(), ()> {
    let (sid, token, from) = match (
        state.twilio_account_sid.as_ref(),
        state.twilio_auth_token.as_ref(),
        state.twilio_phone_number.as_ref(),
    ) {
        (Some(sid), Some(token), Some(from)) => (sid, token, from),
        _ => return Err(()),
    };
    let to_e164 = if to.starts_with('+') { to.to_string() } else { format!("+{}", to) };
    let body = format!("Your NexaPay transfer code is: {}. Valid for 5 minutes. Never share this code.", otp);
    let response = state
        .http_client
        .post(&format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", sid))
        .basic_auth(sid.clone(), Some(token.clone()))
        .form(&[("To", to_e164.as_str()), ("From", from.as_str()), ("Body", body.as_str())])
        .send()
        .await;
    match response {
        Ok(res) if res.status().is_success() => Ok(()),
        _ => Err(()),
    }
}

pub async fn request_transfer_otp(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<RequestTransferOtpPayload>,
) -> Result<Json<RequestTransferOtpResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }
    if payload.pin.len() != 6 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be 6 digits"));
    }

    let pin_row = sqlx::query("SELECT pin_hash FROM cards WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let stored_pin = pin_row.and_then(|r| r.try_get::<String, _>("pin_hash").ok()).filter(|s| !s.is_empty());
    let stored_pin = stored_pin.ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Set your transaction PIN before transferring"))?;
    let provided_pin = hash_transaction_pin(&address, &payload.pin, &state.encryption_key);
    if provided_pin != stored_pin {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid PIN"));
    }

    // Check for existing locked OTP
    let locked_row = sqlx::query(
        "SELECT id, locked_until FROM transfer_otps WHERE user_address = $1 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    if let Some(r) = locked_row {
        let locked_until: Option<chrono::DateTime<chrono::Utc>> = r.try_get("locked_until").ok();
        if let Some(until) = locked_until {
            if until > chrono::Utc::now() {
                let mins = ((until - chrono::Utc::now()).num_seconds() / 60).max(1);
                return Err(api_error(StatusCode::TOO_MANY_REQUESTS, &format!("Too many attempts. Try again in {} minutes.", mins)));
            }
        }
    }

    // Generate OTP
    let otp = generate_otp_code();
    let otp_hash = hash_transfer_otp(&address, &otp, &state.encryption_key);
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    let otp_id = Uuid::new_v4();
    let memo = payload.memo.clone().unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO transfer_otps (id, user_address, otp_hash, amount, recipient_address, rib, beneficiary_name, memo, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)")
        .bind(otp_id)
        .bind(&address)
        .bind(&otp_hash)
        .bind(payload.amount as i64)
        .bind(&payload.to)
        .bind(&payload.rib)
        .bind(&payload.beneficiary_name)
        .bind(&memo)
        .bind(expires_at)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save OTP"))?;

    // Get phone for SMS
    let phone_row = sqlx::query("SELECT phone FROM users WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await;
    let mut dev_otp: Option<String> = None;
    if let Ok(Some(r)) = phone_row {
        if let Ok(phone) = r.try_get::<String, _>("phone") {
            let _ = send_transfer_otp_sms(&state, &phone, &otp).await;
        }
    }
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
    if app_env == "development" || dev_show == "true" {
        dev_otp = Some(otp.clone());
    }

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transfer/request-otp", "POST", 200).await;

    Ok(Json(RequestTransferOtpResponse {
        step: "otp_required".to_string(),
        otp_id: otp_id.to_string(),
        phone_hint: "***".to_string(),
        dev_otp,
    }))
}

async fn execute_transfer(
    state: &AppState,
    address: &str,
    to_address: &str,
    amount: u64,
    memo: &str,
) -> Result<(String, u64, u64), (StatusCode, HeaderMap, Json<Value>)> {
    let fee = 10u64;
    let tx_hash = sha256_hex(format!("{}{}{}{}", address, to_address, amount, now_ts()).as_bytes());

    let mut chain = state.chain.lock().await;
    let from_balance = chain.get_account(address).ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Sender account not found"))?.balance;
    if chain.get_account(to_address).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }
    if from_balance < amount.saturating_add(fee) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient balance"));
    }

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: address.to_string(),
        to: to_address.to_string(),
        amount,
        fee,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: memo.to_string(),
        hash: tx_hash.clone(),
    };

    chain.add_pending_transaction(tx.clone());
    let block = chain.mine_block(&state.validator_address, &state.validator_private_key, &state.validator_public_key)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to append block"))?;

    let new_balance = chain.get_account(address).map(|a| a.balance).unwrap_or(from_balance);

    if let Some(from_acc) = chain.get_account(address) {
        let _ = state.sqlite_state.upsert_account(&from_acc.address, from_acc.balance, from_acc.tx_count, &from_acc.account_type, from_acc.is_active, now_ts());
    }
    if let Some(to_acc) = chain.get_account(to_address) {
        let _ = state.sqlite_state.upsert_account(&to_acc.address, to_acc.balance, to_acc.tx_count, &to_acc.account_type, to_acc.is_active, now_ts());
    }
    let _ = state.sqlite_state.record_transaction(&tx, block.index);

    Ok((tx_hash, new_balance, block.index))
}

pub async fn verify_transfer_otp(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<VerifyTransferOtpPayload>,
) -> Result<Json<TransferResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if !is_valid_otp(&payload.otp_code) {
        return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
    }

    let otp_uuid = Uuid::parse_str(&payload.otp_id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid OTP ID"))?;
    let otp_row = sqlx::query(
        "SELECT id, otp_hash, amount, recipient_address, memo, expires_at, used, resend_count, locked_until FROM transfer_otps WHERE id = $1 AND user_address = $2 LIMIT 1")
        .bind(otp_uuid)
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let otp_row = match otp_row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "OTP not found")),
    };

    let stored_hash: String = otp_row.try_get("otp_hash").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let amount: i64 = otp_row.try_get("amount").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let recipient: String = otp_row.try_get("recipient_address").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let memo: String = otp_row.try_get("memo").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let expires: chrono::DateTime<chrono::Utc> = otp_row.try_get("expires_at").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let used: bool = otp_row.try_get("used").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let resend_count: i32 = otp_row.try_get("resend_count").unwrap_or(0);
    let locked_until: Option<chrono::DateTime<chrono::Utc>> = otp_row.try_get("locked_until").ok();

    if used {
        return Err(api_error(StatusCode::UNAUTHORIZED, "OTP already used"));
    }
    if expires <= chrono::Utc::now() {
        return Err(api_error(StatusCode::UNAUTHORIZED, "OTP expired"));
    }
    if let Some(until) = locked_until {
        if until > chrono::Utc::now() {
            let mins = ((until - chrono::Utc::now()).num_seconds() / 60).max(1);
            return Err(api_error(StatusCode::TOO_MANY_REQUESTS, &format!("Too many attempts. Try again in {} minutes.", mins)));
        }
    }

    let provided_hash = hash_transfer_otp(&address, &payload.otp_code, &state.encryption_key);
    if provided_hash != stored_hash {
        // Increment resend count logic: after 3 wrong attempts, lock for 1 hour
        let new_count = resend_count + 1;
        if new_count >= 3 {
            let locked = chrono::Utc::now() + chrono::Duration::hours(1);
            let _ = sqlx::query("UPDATE transfer_otps SET resend_count = $1, locked_until = $2 WHERE id = $3")
                .bind(new_count)
                .bind(locked)
                .bind(otp_uuid)
                .execute(&state.pg_pool)
                .await;
            return Err(api_error(StatusCode::TOO_MANY_REQUESTS, "Too many failed attempts. Locked for 1 hour."));
        } else {
            let _ = sqlx::query("UPDATE transfer_otps SET resend_count = $1 WHERE id = $2")
                .bind(new_count)
                .bind(otp_uuid)
                .execute(&state.pg_pool)
                .await;
        }
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
    }

    // Mark OTP used
    let _ = sqlx::query("UPDATE transfer_otps SET used = TRUE WHERE id = $1")
        .bind(otp_uuid)
        .execute(&state.pg_pool)
        .await;

    let (to_address, to_name) = resolve_transfer_recipient(&state, &recipient)
        .await
        .map_err(|msg| match msg {
            "recipient_not_found" => api_error(StatusCode::NOT_FOUND, "Recipient not found"),
            "db_error" => api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            _ => api_error(StatusCode::BAD_REQUEST, "Invalid recipient"),
        })?;

    let (tx_hash, new_balance, block_index) = execute_transfer(&state, &address, &to_address, amount as u64, &memo).await?;

    // Notify connected SSE clients
    let from_name = lookup_display_name(&state, &address).await;
    let event = serde_json::json!({
        "type": "transfer",
        "from": address,
        "to": to_address,
        "from_name": from_name,
        "to_name": to_name,
        "amount": amount,
        "amount_display": format_millimes(amount as u64),
        "memo": memo,
        "timestamp": now_ts(),
    }).to_string();
    broadcast_event(&state, &address, &event);
    broadcast_event(&state, &to_address, &event);

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transfer/verify-otp", "POST", 200).await;

    Ok(Json(TransferResponse {
        success: true,
        tx_hash,
        block: block_index,
        new_balance,
        to_name,
    }))
}

pub async fn bank_transfer(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<BankTransferRequest>,
) -> Result<Json<BankTransferResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }
    if payload.rib.len() < 15 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid RIB"));
    }
    if payload.beneficiary_name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Beneficiary name is required"));
    }
    if !is_valid_otp(&payload.otp_code) {
        return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
    }

    // Verify PIN first
    let pin_row = sqlx::query("SELECT pin_hash FROM cards WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    let stored_pin = pin_row.and_then(|r| r.try_get::<String, _>("pin_hash").ok()).filter(|s| !s.is_empty());
    let stored_pin = stored_pin.ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Set your transaction PIN first"))?;
    let provided_pin = hash_transaction_pin(&address, &payload.pin, &state.encryption_key);
    if provided_pin != stored_pin {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid PIN"));
    }

    // Verify OTP
    let otp_uuid = Uuid::parse_str(&payload.otp_id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid OTP ID"))?;
    let otp_row = sqlx::query(
        "SELECT id, otp_hash, expires_at, used, locked_until FROM transfer_otps WHERE id = $1 AND user_address = $2 LIMIT 1")
        .bind(otp_uuid)
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let otp_row = match otp_row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "OTP not found")),
    };

    let stored_hash: String = otp_row.try_get("otp_hash").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let expires: chrono::DateTime<chrono::Utc> = otp_row.try_get("expires_at").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let used: bool = otp_row.try_get("used").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row"))?;
    let locked_until: Option<chrono::DateTime<chrono::Utc>> = otp_row.try_get("locked_until").ok();

    if used {
        return Err(api_error(StatusCode::UNAUTHORIZED, "OTP already used"));
    }
    if expires <= chrono::Utc::now() {
        return Err(api_error(StatusCode::UNAUTHORIZED, "OTP expired"));
    }
    if let Some(until) = locked_until {
        if until > chrono::Utc::now() {
            let mins = ((until - chrono::Utc::now()).num_seconds() / 60).max(1);
            return Err(api_error(StatusCode::TOO_MANY_REQUESTS, &format!("Too many attempts. Try again in {} minutes.", mins)));
        }
    }

    let provided_hash = hash_transfer_otp(&address, &payload.otp_code, &state.encryption_key);
    if provided_hash != stored_hash {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
    }

    let _ = sqlx::query("UPDATE transfer_otps SET used = TRUE WHERE id = $1")
        .bind(otp_uuid)
        .execute(&state.pg_pool)
        .await;

    // Check if RIB belongs to a NexaPay user; if so, transfer directly to them
    let memo = payload.memo.clone().unwrap_or_else(|| format!("Bank transfer to {} (RIB: {})", payload.beneficiary_name, payload.rib));
    let recipient_address = get_address_by_rib(&state, &payload.rib).await;

    let (_tx_hash, new_balance, _block_index) = if let Some(ref recv_addr) = recipient_address {
        let recv_memo = format!("Bank transfer from {} (RIB: {})", &address, &payload.rib);
        let (h, nb, bi) = execute_transfer(&state, &address, recv_addr, payload.amount, &recv_memo).await?;

        // Notify recipient via SSE
        let to_name = lookup_display_name(&state, &address).await;
        let recv_event = serde_json::json!({
            "type": "transfer",
            "from": address,
            "from_name": to_name,
            "to": recv_addr,
            "amount": payload.amount,
            "amount_display": format_millimes(payload.amount),
            "memo": recv_memo,
            "timestamp": now_ts(),
        }).to_string();
        broadcast_event(&state, recv_addr, &recv_event);
        (h, nb, bi)
    } else {
        // External bank transfer — send to BANK system account
        {
            let mut chain = state.chain.lock().await;
            if chain.get_account("BANK").is_none() {
                chain.create_account(ChainAccount {
                    address: "BANK".to_string(),
                    public_key: String::new(),
                    balance: 0,
                    tx_count: 0,
                    account_type: AccountType::Bank,
                    created_at: now_ts(),
                    is_active: true,
                    kyc_hash: String::new(),
                });
            }
        }
        execute_transfer(&state, &address, "BANK", payload.amount, &memo).await?
    };

    let transfer_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO bank_transfers (id, user_address, rib, beneficiary_name, amount, memo, status, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW())")
        .bind(transfer_id)
        .bind(&address)
        .bind(&payload.rib)
        .bind(&payload.beneficiary_name)
        .bind(payload.amount as i64)
        .bind(&memo)
        .execute(&state.pg_pool)
        .await;

    // Upsert saved beneficiary for quick access next time
    let _ = sqlx::query(
        "INSERT INTO saved_beneficiaries (user_address, rib, beneficiary_name) VALUES ($1, $2, $3)
         ON CONFLICT (user_address, rib) DO UPDATE SET beneficiary_name = EXCLUDED.beneficiary_name, created_at = NOW()")
        .bind(&address)
        .bind(&payload.rib)
        .bind(&payload.beneficiary_name)
        .execute(&state.pg_pool)
        .await;

    let from_name = lookup_display_name(&state, &address).await;
    let event = serde_json::json!({
        "type": "bank_transfer",
        "from": address,
        "from_name": from_name,
        "amount": payload.amount,
        "amount_display": format_millimes(payload.amount),
        "beneficiary": payload.beneficiary_name,
        "rib": payload.rib,
        "new_balance": new_balance,
        "timestamp": now_ts(),
    }).to_string();
    broadcast_event(&state, &address, &event);

    log_api_call(&state, principal.as_ref(), "/accounts/:address/bank-transfer", "POST", 200).await;

    Ok(Json(BankTransferResponse {
        success: true,
        transfer_id: transfer_id.to_string(),
        amount_display: format_millimes(payload.amount),
        status: "completed".to_string(),
    }))
}

// ─── Saved Beneficiaries ───

#[derive(Debug, Serialize)]
pub struct SavedBeneficiaryView {
    pub id: String,
    pub rib: String,
    pub beneficiary_name: String,
    pub bank_name: Option<String>,
    pub created_at: String,
}

pub async fn list_saved_beneficiaries(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<SavedBeneficiaryView>>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let rows = sqlx::query(
        "SELECT id, rib, beneficiary_name, bank_name, created_at FROM saved_beneficiaries WHERE user_address = $1 ORDER BY created_at DESC")
        .bind(&address)
        .fetch_all(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let beneficiaries: Vec<SavedBeneficiaryView> = rows
        .into_iter()
        .filter_map(|r| {
            Some(SavedBeneficiaryView {
                id: r.try_get::<String, _>("id").ok()?,
                rib: r.try_get::<String, _>("rib").ok()?,
                beneficiary_name: r.try_get::<String, _>("beneficiary_name").ok()?,
                bank_name: r.try_get::<String, _>("bank_name").ok(),
                created_at: r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok()?.to_rfc3339(),
            })
        })
        .collect();

    Ok(Json(beneficiaries))
}

#[derive(Debug, Deserialize)]
pub struct AddSavedBeneficiaryRequest {
    pub rib: String,
    pub beneficiary_name: String,
    #[serde(default)]
    pub bank_name: Option<String>,
}

pub async fn add_saved_beneficiary(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<AddSavedBeneficiaryRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if payload.rib.len() < 15 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid RIB"));
    }
    if payload.beneficiary_name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Beneficiary name is required"));
    }

    let _ = sqlx::query(
        "INSERT INTO saved_beneficiaries (user_address, rib, beneficiary_name, bank_name) VALUES ($1, $2, $3, $4)")
        .bind(&address)
        .bind(&payload.rib)
        .bind(&payload.beneficiary_name)
        .bind(&payload.bank_name)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(json!({ "success": true })))
}

pub async fn delete_saved_beneficiary(
    State(state): State<AppState>,
    Path((address, beneficiary_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let _ = sqlx::query(
        "DELETE FROM saved_beneficiaries WHERE id = $1 AND user_address = $2")
        .bind(&beneficiary_id)
        .bind(&address)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(json!({ "success": true })))
}

// ─── Bank Transfer Status ───

#[derive(Debug, Serialize)]
pub struct BankTransferView {
    pub id: String,
    pub rib: String,
    pub beneficiary_name: String,
    pub amount: i64,
    pub amount_display: String,
    pub memo: Option<String>,
    pub status: String,
    pub failure_reason: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

pub async fn list_bank_transfers(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<BankTransferView>>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let rows = sqlx::query(
        "SELECT id, rib, beneficiary_name, amount, memo, status, failure_reason, created_at, updated_at FROM bank_transfers WHERE user_address = $1 ORDER BY created_at DESC LIMIT 100")
        .bind(&address)
        .fetch_all(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let transfers: Vec<BankTransferView> = rows
        .into_iter()
        .filter_map(|r| {
            let amount: i64 = r.try_get("amount").ok()?;
            Some(BankTransferView {
                id: r.try_get::<String, _>("id").ok()?,
                rib: r.try_get::<String, _>("rib").ok()?,
                beneficiary_name: r.try_get::<String, _>("beneficiary_name").ok()?,
                amount,
                amount_display: format_millimes(amount as u64),
                memo: r.try_get::<String, _>("memo").ok(),
                status: r.try_get::<String, _>("status").ok()?,
                failure_reason: r.try_get::<String, _>("failure_reason").ok(),
                created_at: r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok()?.to_rfc3339(),
                updated_at: r.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").ok().map(|d| d.to_rfc3339()),
            })
        })
        .collect();

    Ok(Json(transfers))
}

pub async fn pay_wallet_by_card(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(payload): Json<CardWalletPayRequest>,
) -> Result<Json<CardWalletPayResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    if !is_valid_address(&address) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid recipient address"));
    }

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be greater than 0"));
    }

    let card_number_clean = payload.card_number.replace(' ', "");
    let card_valid = is_luhn_valid(&card_number_clean)
        && payload.cvv.len() >= 3
        && payload.pin.len() == 4
        && payload.pin.chars().all(|c| c.is_ascii_digit());

    let test_card_result = evaluate_test_card(&card_number_clean, &payload.pin);
    let approved = test_card_result.unwrap_or(
        card_valid
            && card_number_clean.len() >= 15
            && payload.pin != "0000"
            && payload
                .expiry_month
                .parse::<u32>()
                .ok()
                .map(|m| (1..=12).contains(&m))
                .unwrap_or(false)
            && payload.expiry_year.len() == 4
            && payload
                .card_holder_name
                .clone()
                .unwrap_or_default()
                .trim()
                .len()
                >= 3,
    );

    if !approved {
        return Ok(Json(CardWalletPayResponse {
            success: false,
            status: "failed".to_string(),
            recipient: address,
            amount: payload.amount,
            amount_display: format_millimes(payload.amount),
            tx_hash: None,
            block: None,
            recipient_balance: None,
            failure_reason: if test_card_result == Some(false) {
                Some("test_card_forced_decline".to_string())
            } else {
                Some("card_validation_failed_or_pin_declined".to_string())
            },
        }));
    }

    let tx_hash = sha256_hex(
        format!("{}:{}:{}:{}", address, payload.amount, payload.pin, now_ts()).as_bytes(),
    );

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: "SYSTEM".to_string(),
        to: address.clone(),
        amount: payload.amount,
        fee: 0,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: payload
            .memo
            .unwrap_or_else(|| "Wallet payment via card checkout".to_string()),
        hash: tx_hash.clone(),
    };

    let mut chain = state.chain.lock().await;
    if chain.get_account(&address).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }

    chain.add_pending_transaction(tx.clone());
    let block = chain
        .mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        )
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to append block"))?;

    let recipient_balance = chain.get_account(&address).map(|a| a.balance).unwrap_or(0);

    if let Some(acc) = chain.get_account(&address) {
        let _ = state.sqlite_state.upsert_account(
            &acc.address,
            acc.balance,
            acc.tx_count,
            &acc.account_type,
            acc.is_active,
            now_ts(),
        );
    }
    let _ = state.sqlite_state.record_transaction(&tx, block.index);

    log_api_call(&state, None, "/wallets/:address/pay-by-card", "POST", 200).await;

    Ok(Json(CardWalletPayResponse {
        success: true,
        status: "succeeded".to_string(),
        recipient: address,
        amount: payload.amount,
        amount_display: format_millimes(payload.amount),
        tx_hash: Some(tx_hash),
        block: Some(block.index),
        recipient_balance: Some(recipient_balance),
        failure_reason: None,
    }))
}

async fn lookup_display_name(state: &AppState, chain_address: &str) -> String {
    if chain_address == "SYSTEM" {
        return "NexaPay".to_string();
    }
    let row = sqlx::query("SELECT full_name FROM users WHERE chain_address = $1")
        .bind(chain_address)
        .fetch_optional(&state.pg_pool)
        .await
        .ok()
        .flatten();
    row.and_then(|r| r.try_get::<String, _>("full_name").ok())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "NexaPay".to_string())
}

async fn get_address_by_rib(state: &AppState, rib: &str) -> Option<String> {
    let row = sqlx::query("SELECT chain_address FROM users WHERE settlement_rib = $1")
        .bind(rib)
        .fetch_optional(&state.pg_pool)
        .await
        .ok()
        .flatten();
    row.and_then(|r| r.try_get::<String, _>("chain_address").ok())
        .filter(|s| !s.is_empty())
}

async fn resolve_transfer_recipient(state: &AppState, to_field: &str) -> Result<(String, String), &'static str> {
    let t = to_field.trim();
    if t.is_empty() {
        return Err("invalid_recipient");
    }
    if is_valid_address(t) {
        {
            let chain = state.chain.lock().await;
            if chain.get_account(t).is_none() {
                return Err("recipient_not_found");
            }
        }
        let name = lookup_display_name(state, t).await;
        return Ok((t.to_string(), name));
    }
    if t.contains('@') {
        let row = sqlx::query(
            "SELECT chain_address, full_name FROM users WHERE LOWER(TRIM(COALESCE(email,''))) = LOWER(TRIM($1))",
        )
        .bind(t)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| "db_error")?;
        let row = row.ok_or("recipient_not_found")?;
        let addr: String = row
            .try_get("chain_address")
            .map_err(|_| "recipient_not_found")?;
        let name: String = row
            .try_get("full_name")
            .unwrap_or_else(|_| "Unknown".to_string());
        {
            let chain = state.chain.lock().await;
            if chain.get_account(&addr).is_none() {
                return Err("recipient_not_found");
            }
        }
        return Ok((addr, name));
    }
    let (n11, n8) = login_phone_variants(t).ok_or("invalid_phone")?;
    let row = sqlx::query(
        "SELECT chain_address, full_name FROM users WHERE cin = $1 OR cin = $2 OR phone = $1 OR phone = $2 LIMIT 1",
    )
    .bind(&n11)
    .bind(&n8)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| "db_error")?;
    let row = row.ok_or("recipient_not_found")?;
    let addr: String = row
        .try_get("chain_address")
        .map_err(|_| "recipient_not_found")?;
    let name: String = row
        .try_get("full_name")
        .unwrap_or_else(|_| "Unknown".to_string());
    {
        let chain = state.chain.lock().await;
        if chain.get_account(&addr).is_none() {
            return Err("recipient_not_found");
        }
    }
    Ok((addr, name))
}

fn is_valid_address(address: &str) -> bool {
    Regex::new(r"^NXP[a-f0-9]{32}$")
        .map(|re| re.is_match(address))
        .unwrap_or(false)
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    format!("{}.{:03} TND", whole, frac)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": false, "error": message })))
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn ts_to_rfc3339(ts: u64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(ts as i64, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339()
}

fn evaluate_test_card(card_number: &str, pin: &str) -> Option<bool> {
    match (card_number, pin) {
        ("4242424242424242", "1234") => Some(true),
        ("5555555555554444", "1234") => Some(true),
        ("4000000000000002", "1234") => Some(false),
        _ => None,
    }
}

fn is_luhn_valid(card_number: &str) -> bool {
    if card_number.len() < 12 || !card_number.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;
    for ch in card_number.chars().rev() {
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

fn mask_tail(value: &str, tail: usize) -> String {
    if value.is_empty() {
        return "".to_string();
    }
    if value.len() <= tail {
        return value.to_string();
    }

    let keep = &value[value.len() - tail..];
    let stars = "*".repeat(value.len().saturating_sub(tail));
    format!("{}{}", stars, keep)
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub address_line: Option<String>,
    pub delegation: Option<String>,
    pub governorate: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateProfileResponse {
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct CardStatusResponse {
    pub success: bool,
    pub frozen: bool,
    pub lost_reported: bool,
}

#[derive(Debug, Serialize)]
pub struct AvatarUploadResponse {
    pub success: bool,
    pub avatar_url: String,
}

pub async fn freeze_card(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<CardStatusResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let row = sqlx::query("SELECT frozen FROM cards WHERE chain_address = $1")
        .bind(&address)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let current = row.and_then(|r| r.try_get::<bool, _>("frozen").ok()).unwrap_or(false);
    let next = !current;

    sqlx::query("UPDATE cards SET frozen = $1 WHERE chain_address = $2")
        .bind(next)
        .bind(&address)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update card status"))?;

    Ok(Json(CardStatusResponse {
        success: true,
        frozen: next,
        lost_reported: false,
    }))
}

pub async fn report_lost_card(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<CardStatusResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    sqlx::query("UPDATE cards SET lost_reported = TRUE, frozen = TRUE WHERE chain_address = $1")
        .bind(&address)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update card status"))?;

    Ok(Json(CardStatusResponse {
        success: true,
        frozen: true,
        lost_reported: true,
    }))
}

pub async fn update_profile(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UpdateProfileResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    sqlx::query(
        "UPDATE users SET address_line = $1, delegation = $2, governorate = $3 WHERE chain_address = $4",
    )
    .bind(&payload.address_line)
    .bind(&payload.delegation)
    .bind(&payload.governorate)
    .bind(&address)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update profile"))?;

    Ok(Json(UpdateProfileResponse { success: true }))
}

pub async fn upload_avatar(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<AvatarUploadResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());
    let dir = format!("{}/avatars", upload_base);
    std::fs::create_dir_all(&dir).map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create upload directory"))?;

    let mut saved_path = None;
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name != "avatar" {
            continue;
        }
        if let Some(fname) = field.file_name() {
            let ext = fname.split('.').last().unwrap_or("jpg");
            let target = format!("{}/{}_{}.{}" , dir, address, uuid::Uuid::new_v4(), ext);
            let data = field.bytes().await.map_err(|_| api_error(StatusCode::BAD_REQUEST, "Failed to read file"))?;
            std::fs::write(&target, &data).map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save file"))?;
            saved_path = Some(target);
            break;
        }
    }

    let path = saved_path.ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "No avatar file provided"))?;
    let avatar_url = format!("/uploads/avatars/{}", path.split('/').last().unwrap_or(""));

    sqlx::query("UPDATE users SET avatar_url = $1 WHERE chain_address = $2")
        .bind(&avatar_url)
        .bind(&address)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save avatar URL"))?;

    Ok(Json(AvatarUploadResponse {
        success: true,
        avatar_url,
    }))
}

pub async fn get_municipalities(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let res = state.http_client
        .get("https://tn-municipality-api.vercel.app/api/municipalities")
        .send()
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch municipalities"))?;

    let data: Value = res.json().await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to parse municipalities"))?;

    Ok(Json(data))
}

/// SSE endpoint for real-time balance/notification events.
/// Token may be passed as `?token=` query param since EventSource cannot set custom headers.
pub async fn account_events(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Sse<UnboundedReceiverStream<std::result::Result<axum::response::sse::Event, std::convert::Infallible>>>, (StatusCode, HeaderMap, Json<Value>)> {
    let token = params.get("token").cloned()
        .or_else(|| crate::api::middleware::extract_account_token(&headers));
    let token = token.ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;
    let claims = crate::api::middleware::verify_session_token(&state, &token)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid token"))?;
    if claims.address != address {
        return Err(api_error(StatusCode::FORBIDDEN, "Address mismatch"));
    }

    let mut bc_rx = {
        let map = state.sse_broadcasters.read().unwrap();
        if let Some(tx) = map.get(&address) {
            tx.subscribe()
        } else {
            drop(map);
            let mut map = state.sse_broadcasters.write().unwrap();
            let (tx, rx) = tokio::sync::broadcast::channel::<String>(64);
            map.insert(address.clone(), tx);
            rx
        }
    };

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<std::result::Result<axum::response::sse::Event, std::convert::Infallible>>();
    tokio::spawn(async move {
        loop {
            match bc_rx.recv().await {
                Ok(msg) => {
                    let ev = axum::response::sse::Event::default().data(msg);
                    if tx.send(Ok(ev)).is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let stream = UnboundedReceiverStream::new(rx);
    let sse = Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    );
    Ok(sse)
}

/// Broadcast an event to all connected SSE clients for the given address.
pub fn broadcast_event(state: &AppState, address: &str, event: &str) {
    let map = state.sse_broadcasters.read().unwrap();
    if let Some(tx) = map.get(address) {
        let _ = tx.send(event.to_string());
    }
}
