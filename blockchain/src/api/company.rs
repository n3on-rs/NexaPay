use std::collections::BTreeMap;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{
    create_structured_api_key, default_permissions, log_api_call, permissions_to_csv,
    require_account_token,
};
use crate::api::AppState;
use crate::crypto::{sha256_hex, sign_hex};
use crate::account::{AccountType, ChainAccount};
use crate::block::{Transaction, TxType};

const DEFAULT_COMPANY_CALL_LIMIT: i32 = 1_000_000;

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Debug, Deserialize)]
pub struct CreateCompanyWorkspaceRequest {
    pub company_name: String,
    pub company_email: Option<String>,
    pub company_phone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVendorRequest {
    pub company_name: String,
    pub company_email: Option<String>,
    pub company_phone: Option<String>,
    pub business_type: Option<String>,
    pub legal_name: String,
    pub signature: String,
    pub accepted_terms: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettlementSettingsRequest {
    pub account_holder: Option<String>,
    pub bank_name: Option<String>,
    pub rib: Option<String>,
    pub iban: Option<String>,
    pub bic: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCompanyApiKeyRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RotateCompanyApiKeyRequest {
    pub key_prefix: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RevokeCompanyApiKeyRequest {
    pub key_prefix: String,
}

#[derive(Debug, Deserialize)]
pub struct CompanyWithdrawRequest {
    pub amount: u64,
}

#[derive(Debug, Serialize)]
pub struct CompanyWorkspaceCreateResponse {
    pub success: bool,
    pub company_id: String,
    pub api_key: String,
    pub api_key_prefix: String,
}

#[derive(Debug)]
struct UserOwner {
    chain_address: String,
    full_name: String,
    cin: String,
    email: Option<String>,
    phone: String,
}

#[derive(Debug, Clone)]
struct CompanyWorkspace {
    id: Uuid,
    company_name: String,
    contact_name: String,
    email: String,
    phone: Option<String>,
    monthly_calls: i32,
    created_at: chrono::DateTime<chrono::Utc>,
    settlement_account_holder: Option<String>,
    settlement_bank_name: Option<String>,
    settlement_rib: Option<String>,
    settlement_iban: Option<String>,
    settlement_bic: Option<String>,
    settlement_status: Option<String>,
}

#[derive(Debug, Clone)]
struct VendorRequestRecord {
    company_name: String,
    company_email: String,
    company_phone: Option<String>,
    business_type: Option<String>,
    legal_name: String,
    signature: String,
    status: String,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    reviewed_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn get_account_settings(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;

    let row = sqlx::query(
        "SELECT settlement_account_holder, settlement_bank_name, settlement_rib, settlement_iban, settlement_bic
         FROM users
         WHERE chain_address = $1
         LIMIT 1",
    )
    .bind(&owner.chain_address)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let company = load_company_workspace(&state, &owner.chain_address).await.ok();

    log_api_call(&state, None, "/accounts/:address/settings", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "personal_bank": {
            "account_holder": string_or_default(row.try_get::<Option<String>, _>("settlement_account_holder").ok().flatten(), &owner.full_name),
            "bank_name": row.try_get::<Option<String>, _>("settlement_bank_name").ok().flatten().unwrap_or_default(),
            "rib": row.try_get::<Option<String>, _>("settlement_rib").ok().flatten().unwrap_or_default(),
            "iban": row.try_get::<Option<String>, _>("settlement_iban").ok().flatten().unwrap_or_default(),
            "bic": row.try_get::<Option<String>, _>("settlement_bic").ok().flatten().unwrap_or_default(),
            "email": owner.email.unwrap_or_default(),
            "phone": owner.phone,
        },
        "company_bank": company.as_ref().map(|workspace| {
            json!({
                "account_holder": workspace.settlement_account_holder.clone().unwrap_or_else(|| workspace.contact_name.clone()),
                "bank_name": workspace.settlement_bank_name.clone().unwrap_or_default(),
                "rib": workspace.settlement_rib.clone().unwrap_or_default(),
                "iban": workspace.settlement_iban.clone().unwrap_or_default(),
                "bic": workspace.settlement_bic.clone().unwrap_or_default(),
                "status": workspace.settlement_status.clone().unwrap_or_else(|| "draft".to_string()),
            })
        })
    })))
}

pub async fn update_account_settings(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSettlementSettingsRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;

    sqlx::query(
        "UPDATE users
         SET settlement_account_holder = $1,
             settlement_bank_name = $2,
             settlement_rib = $3,
             settlement_iban = $4,
             settlement_bic = $5
         WHERE chain_address = $6",
    )
    .bind(normalize_optional(payload.account_holder, Some(owner.full_name)))
    .bind(normalize_optional(payload.bank_name, None))
    .bind(normalize_optional(payload.rib, None))
    .bind(normalize_optional(payload.iban, None))
    .bind(normalize_optional(payload.bic, None))
    .bind(&owner.chain_address)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update personal bank settings"))?;

    log_api_call(&state, None, "/accounts/:address/settings", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "message": "Personal bank settings updated",
    })))
}

pub async fn get_company_workspace(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;

    let company = match load_company_workspace(&state, &owner.chain_address).await {
        Ok(workspace) => workspace,
        Err((StatusCode::NOT_FOUND, _, _)) => {
            let vendor_request = load_vendor_request(&state, &owner.chain_address).await?;
            log_api_call(&state, None, "/accounts/:address/company", "GET", 200).await;
            return Ok(Json(json!({
                "success": true,
                "has_company": false,
                "vendor_request": vendor_request.map(|request| json!({
                    "company_name": request.company_name,
                    "company_email": request.company_email,
                    "company_phone": request.company_phone,
                    "business_type": request.business_type,
                    "legal_name": request.legal_name,
                    "signature": request.signature,
                    "status": request.status,
                    "notes": request.notes,
                    "created_at": request.created_at.to_rfc3339(),
                    "updated_at": request.updated_at.to_rfc3339(),
                    "reviewed_at": request.reviewed_at.map(|value| value.to_rfc3339()),
                })),
            })));
        }
        Err(err) => return Err(err),
    };

    let api_keys = load_company_api_keys(&state, company.id).await?;
    let business_transactions = load_company_transactions(&state, company.id).await?;
    let charts = load_company_charts(&state, company.id).await?;
    let workspace = load_company_metrics(&state, company.id).await?;

    log_api_call(&state, None, "/accounts/:address/company", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "has_company": true,
        "company": {
            "company_id": company.id.to_string(),
            "company_name": company.company_name,
            "contact_name": company.contact_name,
            "email": company.email,
            "phone": company.phone,
            "monthly_calls": company.monthly_calls,
            "created_at": company.created_at.to_rfc3339(),
            "settlement_account_holder": company.settlement_account_holder.unwrap_or_default(),
            "settlement_bank_name": company.settlement_bank_name.unwrap_or_default(),
            "settlement_rib": company.settlement_rib.unwrap_or_default(),
            "settlement_iban": company.settlement_iban.unwrap_or_default(),
            "settlement_bic": company.settlement_bic.unwrap_or_default(),
            "settlement_status": company.settlement_status.unwrap_or_else(|| "draft".to_string()),
        },
        "workspace": workspace,
        "api_keys": api_keys,
        "business_transactions": business_transactions,
        "charts": charts,
    })))
}

pub async fn create_company_workspace(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateCompanyWorkspaceRequest>,
) -> Result<Json<CompanyWorkspaceCreateResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;

    if payload.company_name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "company_name is required"));
    }

    let existing = sqlx::query(
        "SELECT id FROM developers WHERE owner_user_address = $1 AND is_active = TRUE LIMIT 1",
    )
    .bind(&owner.chain_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if existing.is_some() {
        return Err(api_error(StatusCode::CONFLICT, "Company workspace already exists for this user"));
    }

    let email = payload
        .company_email
        .clone()
        .or_else(|| owner.email.clone())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "A company email is required"))?;

    let company_phone = payload
        .company_phone
        .clone()
        .or_else(|| Some(owner.phone.clone()))
        .and_then(|value| normalize_phone(value));

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = prefix.chars().take(8).collect::<String>();

    let row = sqlx::query(
        "INSERT INTO developers
         (company_name, contact_name, email, phone, api_key, api_key_prefix, plan, call_limit, owner_user_address, owner_user_cin, settlement_account_holder, settlement_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'wallet', $7, $8, $9, $10, 'draft')
         RETURNING id",
    )
    .bind(payload.company_name.trim())
    .bind(&owner.full_name)
    .bind(&email)
    .bind(company_phone.as_deref())
    .bind(&api_key_hash)
    .bind(&legacy_prefix)
    .bind(DEFAULT_COMPANY_CALL_LIMIT)
    .bind(&owner.chain_address)
    .bind(&owner.cin)
    .bind(&owner.full_name)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Company creation failed: {e}")))?;

    let developer_id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Company ID parse error"))?;

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, 'primary', $2, $3, $4, $5, 120, $6, 'active')",
    )
    .bind(developer_id)
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(DEFAULT_COMPANY_CALL_LIMIT)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to store company API key"))?;

    log_api_call(&state, None, "/accounts/:address/company", "POST", 200).await;

    Ok(Json(CompanyWorkspaceCreateResponse {
        success: true,
        company_id: developer_id.to_string(),
        api_key,
        api_key_prefix: prefix,
    }))
}

pub async fn submit_vendor_request(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateVendorRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;

    if payload.company_name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "company_name is required"));
    }
    if payload.legal_name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "legal_name is required"));
    }
    if payload.signature.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "signature is required"));
    }
    if !payload.accepted_terms {
        return Err(api_error(StatusCode::BAD_REQUEST, "accepted_terms must be true"));
    }

    let existing_company = sqlx::query(
        "SELECT id FROM developers WHERE owner_user_address = $1 AND is_active = TRUE LIMIT 1",
    )
    .bind(&owner.chain_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if existing_company.is_some() {
        return Err(api_error(StatusCode::CONFLICT, "Company workspace already exists for this user"));
    }

    let company_email = payload
        .company_email
        .clone()
        .or_else(|| owner.email.clone())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "A company email is required"))?;

    let company_phone = payload
        .company_phone
        .clone()
        .or_else(|| Some(owner.phone.clone()))
        .and_then(normalize_phone);

    sqlx::query(
        "INSERT INTO vendor_requests
         (owner_user_address, company_name, company_email, company_phone, business_type, legal_name, signature, accepted_terms, status, updated_at, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'pending', NOW(), NULL)
         ON CONFLICT (owner_user_address)
         DO UPDATE SET company_name = EXCLUDED.company_name,
                       company_email = EXCLUDED.company_email,
                       company_phone = EXCLUDED.company_phone,
                       business_type = EXCLUDED.business_type,
                       legal_name = EXCLUDED.legal_name,
                       signature = EXCLUDED.signature,
                       accepted_terms = TRUE,
                       status = 'pending',
                       notes = NULL,
                       updated_at = NOW(),
                       reviewed_at = NULL",
    )
    .bind(&owner.chain_address)
    .bind(payload.company_name.trim())
    .bind(&company_email)
    .bind(company_phone.as_deref())
    .bind(normalize_optional(payload.business_type, None))
    .bind(payload.legal_name.trim())
    .bind(payload.signature.trim())
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to submit vendor request"))?;

    log_api_call(&state, None, "/accounts/:address/company/request", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "status": "pending",
        "message": "Vendor request submitted. Our team can now review your company activation details.",
    })))
}

pub async fn update_company_settings(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSettlementSettingsRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;
    let company = load_company_workspace(&state, &owner.chain_address).await?;

    sqlx::query(
        "UPDATE developers
         SET settlement_account_holder = $1,
             settlement_bank_name = $2,
             settlement_rib = $3,
             settlement_iban = $4,
             settlement_bic = $5,
             settlement_status = CASE
                WHEN COALESCE(NULLIF($3, ''), NULLIF($4, '')) IS NOT NULL THEN 'ready'
                ELSE 'draft'
             END
         WHERE id = $6",
    )
    .bind(normalize_optional(payload.account_holder, Some(company.contact_name)))
    .bind(normalize_optional(payload.bank_name, None))
    .bind(normalize_optional(payload.rib, None))
    .bind(normalize_optional(payload.iban, None))
    .bind(normalize_optional(payload.bic, None))
    .bind(company.id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update company settlement settings"))?;

    log_api_call(&state, None, "/accounts/:address/company/settings", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "message": "Company settlement settings updated",
    })))
}

pub async fn create_company_api_key(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateCompanyApiKeyRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;
    let company = load_company_workspace(&state, &owner.chain_address).await?;

    if payload.name.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "name is required"));
    }

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, $2, $3, $4, $5, $6, 120, $7, 'active')",
    )
    .bind(company.id)
    .bind(payload.name.trim())
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(DEFAULT_COMPANY_CALL_LIMIT)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create company API key"))?;

    log_api_call(&state, None, "/accounts/:address/company/api-keys/create", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "api_key": api_key,
        "api_key_prefix": prefix,
    })))
}

pub async fn rotate_company_api_key(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<RotateCompanyApiKeyRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;
    let company = load_company_workspace(&state, &owner.chain_address).await?;

    let target_prefix = payload
        .key_prefix
        .clone()
        .unwrap_or_else(|| "primary".to_string());
    let target_prefix = if target_prefix == "primary" {
        load_primary_company_api_key_prefix(&state, company.id).await
    } else {
        target_prefix
    };

    sqlx::query(
        "UPDATE api_keys
         SET status = 'revoked', revoked_at = NOW(), rotated_at = NOW()
         WHERE owner_type = 'developer' AND owner_id = $1 AND prefix = $2 AND status = 'active'",
    )
    .bind(company.id)
    .bind(&target_prefix)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to revoke previous key"))?;

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
    let key_name = payload.name.unwrap_or_else(|| "primary".to_string());

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, $2, $3, $4, $5, $6, 120, $7, 'active')",
    )
    .bind(company.id)
    .bind(&key_name)
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(DEFAULT_COMPANY_CALL_LIMIT)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to rotate company API key"))?;

    let legacy_prefix = prefix.chars().take(8).collect::<String>();
    let _ = sqlx::query("UPDATE developers SET api_key = $1, api_key_prefix = $2 WHERE id = $3")
        .bind(&api_key_hash)
        .bind(&legacy_prefix)
        .bind(company.id)
        .execute(&state.pg_pool)
        .await;

    log_api_call(&state, None, "/accounts/:address/company/api-keys/rotate", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "api_key": api_key,
        "api_key_prefix": prefix,
    })))
}

pub async fn revoke_company_api_key(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<RevokeCompanyApiKeyRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;
    let company = load_company_workspace(&state, &owner.chain_address).await?;

    let active_count = sqlx::query(
        "SELECT COUNT(*) AS count FROM api_keys WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'",
    )
    .bind(company.id)
    .fetch_one(&state.pg_pool)
    .await
    .ok()
    .and_then(|row| row.try_get::<i64, _>("count").ok())
    .unwrap_or(0);

    if active_count <= 1 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Create or rotate a replacement key before revoking your last active company key",
        ));
    }

    let affected = sqlx::query(
        "DELETE FROM api_keys
         WHERE owner_type = 'developer' AND owner_id = $1 AND prefix = $2 AND status = 'active'",
    )
    .bind(company.id)
    .bind(payload.key_prefix.trim())
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete company API key"))?
    .rows_affected();

    if affected == 0 {
        return Err(api_error(StatusCode::NOT_FOUND, "Active company API key not found"));
    }

    log_api_call(&state, None, "/accounts/:address/company/api-keys/revoke", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "revoked_prefix": payload.key_prefix.trim(),
    })))
}

pub async fn withdraw_company_balance(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CompanyWithdrawRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let owner = require_wallet_owner(&state, &headers, &address).await?;
    let company = load_company_workspace(&state, &owner.chain_address).await?;

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "amount must be positive"));
    }

    let destination = company_destination(&company)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Complete company settlement settings before withdrawing"))?;

    let available = company_available_balance(&state, company.id).await? as u64;
    if payload.amount > available {
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient available business balance for withdrawal"));
    }

    let payout_id = format!(
        "po_{}",
        &sha256_hex(format!("{}:{}", company.id, Utc::now().timestamp()).as_bytes())[..16]
    );

    // Transfer funds on-chain from company developer wallet to owner personal wallet
    let email_hash = sha256_hex(company.email.as_bytes());
    let mut chain = state.chain.lock().await;

    let company_wallet_addr = chain
        .accounts
        .values()
        .find(|acc| acc.account_type == AccountType::Developer && acc.kyc_hash == email_hash)
        .map(|acc| acc.address.clone());

    let company_address = match company_wallet_addr {
        Some(addr) => addr,
        None => {
            drop(chain);
            return Err(api_error(StatusCode::NOT_FOUND, "Company wallet not found on chain"));
        }
    };

    if chain.get_account(&owner.chain_address).is_none() {
        chain.create_account(ChainAccount {
            address: owner.chain_address.clone(),
            public_key: String::new(),
            balance: 0,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: String::new(),
        });
    }

    let from_balance = chain
        .get_account(&company_address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Company wallet not found"))?
        .balance;

    if from_balance < payload.amount {
        drop(chain);
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient on-chain balance"));
    }

    let tx_hash = sha256_hex(
        format!("{}{}{}{}", company_address, owner.chain_address, payload.amount, now_ts())
            .as_bytes(),
    );

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: company_address.clone(),
        to: owner.chain_address.clone(),
        amount: payload.amount,
        fee: 0,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: format!("Company withdrawal: {}", payout_id),
        hash: tx_hash.clone(),
    };

    chain.add_pending_transaction(tx.clone());
    let block = chain
        .mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        )
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to mine transfer block"))?;

    if let Some(from_acc) = chain.get_account(&company_address) {
        let _ = state.sqlite_state.upsert_account(
            &from_acc.address,
            from_acc.balance,
            from_acc.tx_count,
            &from_acc.account_type,
            from_acc.is_active,
            now_ts(),
        );
    }
    if let Some(to_acc) = chain.get_account(&owner.chain_address) {
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

    drop(chain);

    sqlx::query(
        "INSERT INTO payouts (payout_id, merchant_id, amount, destination, status)\n         VALUES ($1, $2, $3, $4, 'paid')",
    )
    .bind(&payout_id)
    .bind(company.id)
    .bind(payload.amount as i64)
    .bind(destination)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to record withdrawal"))?;

    log_api_call(&state, None, "/accounts/:address/company/withdraw", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "payout_id": payout_id,
        "status": "paid",
        "amount": payload.amount,
    })))
}

async fn require_wallet_owner(
    state: &AppState,
    headers: &HeaderMap,
    address: &str,
) -> Result<UserOwner, (StatusCode, HeaderMap, Json<Value>)> {
    require_account_token(state, headers, address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let row = sqlx::query(
        "SELECT chain_address, full_name, cin, email, phone
         FROM users
         WHERE chain_address = $1
         LIMIT 1",
    )
    .bind(address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "User not found"))?;

    Ok(UserOwner {
        chain_address: row.try_get::<String, _>("chain_address").unwrap_or_default(),
        full_name: row.try_get::<String, _>("full_name").unwrap_or_default(),
        cin: row.try_get::<String, _>("cin").unwrap_or_default(),
        email: row.try_get::<Option<String>, _>("email").ok().flatten(),
        phone: row.try_get::<String, _>("phone").unwrap_or_default(),
    })
}

async fn load_company_workspace(
    state: &AppState,
    owner_user_address: &str,
) -> Result<CompanyWorkspace, (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query(
        "SELECT id, company_name, contact_name, email, phone, monthly_calls, created_at,
                settlement_account_holder, settlement_bank_name, settlement_rib, settlement_iban, settlement_bic, settlement_status
         FROM developers
         WHERE owner_user_address = $1 AND is_active = TRUE
         LIMIT 1",
    )
    .bind(owner_user_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => {
            // Auto-create workspace for approved agents who don't have one
            let agent = sqlx::query(
                "SELECT business_name, tax_registration_number FROM agent_profiles WHERE user_address = $1 AND is_active = TRUE LIMIT 1"
            )
            .bind(owner_user_address)
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

            let (business_name, _tax_id) = match agent {
                Some(a) => {
                    let bn: String = a.try_get("business_name").unwrap_or_default();
                    let tid: String = a.try_get("tax_registration_number").unwrap_or_default();
                    (bn, tid)
                }
                None => return Err(api_error(StatusCode::NOT_FOUND, "Company workspace not found")),
            };

            let user_row = sqlx::query(
                "SELECT full_name, cin, email, phone FROM users WHERE chain_address = $1 LIMIT 1"
            )
            .bind(owner_user_address)
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "User not found"))?;

            let full_name: String = user_row.try_get("full_name").unwrap_or_default();
            let cin: String = user_row.try_get("cin").unwrap_or_default();
            let email: String = user_row.try_get::<Option<String>, _>("email").ok().flatten().unwrap_or_default();
            let phone: String = user_row.try_get("phone").unwrap_or_default();
            let company_name = if business_name.trim().is_empty() { full_name.clone() } else { business_name };

            let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
            let legacy_prefix = prefix.chars().take(8).collect::<String>();

            let dev_row = sqlx::query(
                "INSERT INTO developers (company_name, contact_name, email, phone, api_key, api_key_prefix, plan, call_limit, owner_user_address, owner_user_cin, settlement_account_holder, settlement_status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'wallet', $7, $8, $9, $10, 'draft')
                 RETURNING id"
            )
            .bind(&company_name)
            .bind(&full_name)
            .bind(&email)
            .bind(&phone)
            .bind(&api_key_hash)
            .bind(&legacy_prefix)
            .bind(DEFAULT_COMPANY_CALL_LIMIT)
            .bind(owner_user_address)
            .bind(&cin)
            .bind(&full_name)
            .fetch_one(&state.pg_pool)
            .await
            .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Company creation failed: {e}")))?;

            let dev_id: Uuid = dev_row.try_get::<Uuid, _>("id")
                .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Company ID parse error"))?;

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
            .execute(&state.pg_pool)
            .await;

            // Re-fetch the newly created workspace
            sqlx::query(
                "SELECT id, company_name, contact_name, email, phone, monthly_calls, created_at,
                        settlement_account_holder, settlement_bank_name, settlement_rib, settlement_iban, settlement_bic, settlement_status
                 FROM developers
                 WHERE owner_user_address = $1 AND is_active = TRUE
                 LIMIT 1",
            )
            .bind(owner_user_address)
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Company workspace not found"))?
        }
    };

    Ok(CompanyWorkspace {
        id: row.try_get::<Uuid, _>("id").map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Company ID parse error"))?,
        company_name: row.try_get::<String, _>("company_name").unwrap_or_default(),
        contact_name: row.try_get::<String, _>("contact_name").unwrap_or_default(),
        email: row.try_get::<String, _>("email").unwrap_or_default(),
        phone: row.try_get::<Option<String>, _>("phone").ok().flatten(),
        monthly_calls: row.try_get::<i32, _>("monthly_calls").unwrap_or(0),
        created_at: row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").unwrap_or_else(|_| Utc::now()),
        settlement_account_holder: row.try_get::<Option<String>, _>("settlement_account_holder").ok().flatten(),
        settlement_bank_name: row.try_get::<Option<String>, _>("settlement_bank_name").ok().flatten(),
        settlement_rib: row.try_get::<Option<String>, _>("settlement_rib").ok().flatten(),
        settlement_iban: row.try_get::<Option<String>, _>("settlement_iban").ok().flatten(),
        settlement_bic: row.try_get::<Option<String>, _>("settlement_bic").ok().flatten(),
        settlement_status: row.try_get::<Option<String>, _>("settlement_status").ok().flatten(),
    })
}

async fn load_vendor_request(
    state: &AppState,
    owner_user_address: &str,
) -> Result<Option<VendorRequestRecord>, (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query(
        "SELECT company_name, company_email, company_phone, business_type, legal_name, signature, status, notes, created_at, updated_at, reviewed_at
         FROM vendor_requests
         WHERE owner_user_address = $1
         LIMIT 1",
    )
    .bind(owner_user_address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(row.map(|row| VendorRequestRecord {
        company_name: row.try_get::<String, _>("company_name").unwrap_or_default(),
        company_email: row.try_get::<String, _>("company_email").unwrap_or_default(),
        company_phone: row.try_get::<Option<String>, _>("company_phone").ok().flatten(),
        business_type: row.try_get::<Option<String>, _>("business_type").ok().flatten(),
        legal_name: row.try_get::<String, _>("legal_name").unwrap_or_default(),
        signature: row.try_get::<String, _>("signature").unwrap_or_default(),
        status: row.try_get::<String, _>("status").unwrap_or_else(|_| "pending".to_string()),
        notes: row.try_get::<Option<String>, _>("notes").ok().flatten(),
        created_at: row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").unwrap_or_else(|_| Utc::now()),
        updated_at: row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").unwrap_or_else(|_| Utc::now()),
        reviewed_at: row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("reviewed_at").ok().flatten(),
    }))
}

async fn load_company_api_keys(
    state: &AppState,
    developer_id: Uuid,
) -> Result<Vec<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let primary_prefix = load_primary_company_api_key_prefix(state, developer_id).await;

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

    Ok(rows
        .into_iter()
        .map(|row| {
            let prefix = row.try_get::<String, _>("prefix").unwrap_or_default();
            json!({
                "key_prefix": prefix,
                "name": row.try_get::<String, _>("name").unwrap_or_default(),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "active".to_string()),
                "permissions": split_permissions(row.try_get::<String, _>("permissions").unwrap_or_default()),
                "rate_limit_per_minute": row.try_get::<i32, _>("rate_limit_per_minute").unwrap_or(120),
                "daily_limit": row.try_get::<i32, _>("daily_limit").unwrap_or(DEFAULT_COMPANY_CALL_LIMIT),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|value| value.to_rfc3339()).unwrap_or_default(),
                "last_used_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_used_at").ok().flatten().map(|value| value.to_rfc3339()),
                "revoked_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("revoked_at").ok().flatten().map(|value| value.to_rfc3339()),
                "is_primary": prefix == primary_prefix,
            })
        })
        .collect())
}

async fn load_company_transactions(
    state: &AppState,
    developer_id: Uuid,
) -> Result<Vec<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let rows = sqlx::query(
        "SELECT intent_id, amount, currency, status, description, customer_name, customer_email, updated_at
         FROM payment_intents
         WHERE merchant_id = $1
         ORDER BY updated_at DESC
         LIMIT 12",
    )
    .bind(developer_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
                "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
                "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
                "status": row.try_get::<String, _>("status").unwrap_or_default(),
                "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
                "customer_name": row.try_get::<Option<String>, _>("customer_name").ok().flatten(),
                "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
                "updated_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").map(|value| value.to_rfc3339()).unwrap_or_default(),
            })
        })
        .collect())
}

async fn load_company_charts(
    state: &AppState,
    developer_id: Uuid,
) -> Result<Value, (StatusCode, HeaderMap, Json<Value>)> {
    let rows = sqlx::query(
        "SELECT amount, updated_at
         FROM payment_intents
         WHERE merchant_id = $1
           AND status = 'succeeded'
           AND updated_at >= NOW() - INTERVAL '190 days'",
    )
    .bind(developer_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let today = Utc::now().date_naive();
    let mut daily_map: BTreeMap<NaiveDate, i64> = BTreeMap::new();
    let mut monthly_map: BTreeMap<(i32, u32), i64> = BTreeMap::new();

    for row in rows {
        let amount = row.try_get::<i64, _>("amount").unwrap_or(0);
        let ts = row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").unwrap_or_else(|_| Utc::now());
        let day = ts.date_naive();
        *daily_map.entry(day).or_insert(0) += amount;
        *monthly_map.entry((day.year(), day.month())).or_insert(0) += amount;
    }

    let daily = (0..7)
        .rev()
        .map(|offset| {
            let date = today - Duration::days(offset);
            json!({
                "label": date.format("%d %b").to_string(),
                "amount": daily_map.get(&date).copied().unwrap_or(0),
            })
        })
        .collect::<Vec<_>>();

    let monthly = (0..6)
        .rev()
        .map(|offset| {
            let date = today.with_day(1).unwrap_or(today) - Duration::days(30 * offset as i64);
            let key = (date.year(), date.month());
            json!({
                "label": date.format("%b").to_string(),
                "amount": monthly_map.get(&key).copied().unwrap_or(0),
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "daily": daily,
        "monthly": monthly,
    }))
}

async fn load_company_metrics(
    state: &AppState,
    developer_id: Uuid,
) -> Result<Value, (StatusCode, HeaderMap, Json<Value>)> {
    let gross = sum_by_developer(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount
         FROM payment_intents
         WHERE merchant_id = $1
           AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        developer_id,
    )
    .await;
    let refunded = sum_by_developer(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount
         FROM refunds
         WHERE merchant_id = $1
           AND status = 'succeeded'",
        developer_id,
    )
    .await;
    let payouts = sum_by_developer(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount
         FROM payouts
         WHERE merchant_id = $1
           AND status IN ('queued', 'processing', 'paid')",
        developer_id,
    )
    .await;
    let today_income = sum_by_developer(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount
         FROM payment_intents
         WHERE merchant_id = $1
           AND status = 'succeeded'
           AND updated_at::date = NOW()::date",
        developer_id,
    )
    .await;
    let month_income = sum_by_developer(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount
         FROM payment_intents
         WHERE merchant_id = $1
           AND status = 'succeeded'
           AND date_trunc('month', updated_at) = date_trunc('month', NOW())",
        developer_id,
    )
    .await;

    let primary_prefix = load_primary_company_api_key_prefix(state, developer_id).await;
    let today_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
        &primary_prefix,
    )
    .await;
    let failed_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND status_code >= 400 AND called_at::date = NOW()::date",
        &primary_prefix,
    )
    .await;

    Ok(json!({
        "gross_volume": gross,
        "available_balance": (gross - refunded - payouts).max(0),
        "today_calls": today_calls,
        "failed_calls": failed_calls,
        "today_income": today_income,
        "month_income": month_income,
    }))
}

async fn load_primary_company_api_key_prefix(state: &AppState, developer_id: Uuid) -> String {
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

fn company_destination(company: &CompanyWorkspace) -> Option<String> {
    let iban = company.settlement_iban.clone().unwrap_or_default();
    let rib = company.settlement_rib.clone().unwrap_or_default();
    let account_holder = company
        .settlement_account_holder
        .clone()
        .unwrap_or_else(|| company.contact_name.clone());
    let bank_name = company.settlement_bank_name.clone().unwrap_or_default();
    let bic = company.settlement_bic.clone().unwrap_or_default();

    if iban.trim().is_empty() && rib.trim().is_empty() {
        return None;
    }

    Some(format!(
        "{} | {} | {} | {} | {}",
        account_holder.trim(),
        bank_name.trim(),
        rib.trim(),
        iban.trim(),
        bic.trim()
    ))
}

async fn company_available_balance(
    state: &AppState,
    developer_id: Uuid,
) -> Result<i64, (StatusCode, HeaderMap, Json<Value>)> {
    let gross = sum_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        developer_id,
    )
    .await;
    let refunded = sum_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        developer_id,
    )
    .await;
    let payouts = sum_by_uuid(
        &state.pg_pool,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        developer_id,
    )
    .await;

    Ok((gross - refunded - payouts).max(0))
}

async fn sum_by_developer(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

async fn sum_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

async fn count_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
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

fn normalize_optional(value: Option<String>, fallback: Option<String>) -> Option<String> {
    match value {
        Some(raw) => {
            let trimmed = raw.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => fallback.filter(|item| !item.trim().is_empty()),
    }
}

fn string_or_default(value: Option<String>, default: &str) -> String {
    value.filter(|item| !item.trim().is_empty()).unwrap_or_else(|| default.to_string())
}

fn split_permissions(raw: String) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect()
}

fn normalize_phone(raw: String) -> Option<String> {
    let digits = raw.trim().chars().filter(|ch| ch.is_ascii_digit()).collect::<String>();
    if digits.len() == 8 {
        Some(format!("216{digits}"))
    } else if digits.len() == 11 && digits.starts_with("216") {
        Some(digits)
    } else {
        None
    }
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": status.is_success(), "error": message })))
}
