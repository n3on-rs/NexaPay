use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Datelike;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{require_account_token, try_api_key, auth_error_response, log_api_call};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::chain::now_ts;
use crate::crypto::sha256_hex;

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": false, "error": message })))
}

async fn log_audit(
    state: &AppState,
    user_address: Option<&str>,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    status: &str,
    details: Value,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_logs (user_address, action, resource_type, resource_id, status, details) VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(user_address)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(status)
    .bind(details)
    .execute(&state.pg_pool)
    .await;
}

async fn next_invoice_number(state: &AppState) -> Result<String, sqlx::Error> {
    let year = chrono::Utc::now().year();
    let row = sqlx::query(
        "INSERT INTO invoice_sequences (year, last_number) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_number = invoice_sequences.last_number + 1
         RETURNING last_number"
    )
    .bind(year)
    .fetch_one(&state.pg_pool)
    .await?;
    let num: i32 = row.try_get("last_number")?;
    Ok(format!("INV-{}-{:06}", year, num))
}

async fn submit_invoice_anchor(
    state: &AppState,
    user_address: &str,
    doc_hash: &str,
    invoice_id: &str,
    tx_id: Option<Uuid>,
    amount: i64,
    currency: &str,
) -> Result<(String, u64), String> {
    let nonce = sha256_hex(format!("{}:{}:{}", user_address, doc_hash, chrono::Utc::now().timestamp()).as_bytes());
    let payload = serde_json::json!({
        "type": "invoice_anchor",
        "invoice_id": invoice_id,
        "transaction_id": tx_id.map(|u| u.to_string()),
        "user_id": user_address,
        "amount": amount,
        "currency": currency,
        "doc_hash": doc_hash,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    let memo = serde_json::json!({
        "type": "InvoiceAnchor",
        "doc_hash": doc_hash,
        "payload": payload,
        "nonce": nonce,
    }).to_string();

    let transaction = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::InvoiceAnchor,
        from: "SYSTEM".to_string(),
        to: user_address.to_string(),
        amount: 0,
        fee: 0,
        timestamp: now_ts(),
        signature: String::new(),
        memo,
        hash: String::new(),
    };

    let mut chain = state.chain.lock().await;
    chain.add_pending_transaction(transaction.clone());
    let hash = transaction.hash.clone();

    let block_result = chain.mine_block(
        &state.validator_address,
        &state.validator_private_key,
        &state.validator_public_key,
    );

    let block_number = match block_result {
        Ok(block) => block.index,
        Err(_) => return Ok((hash, 0)),
    };

    Ok((hash, block_number))
}

// ─── Generate Invoice ───

#[derive(Debug, Deserialize)]
pub struct GenerateInvoiceRequest {
    pub transaction_id: Option<String>,
    pub transaction_type: String, // 'transfer', 'bank_transfer', 'loan', 'fee'
    pub sender_name: String,
    pub sender_account: String,
    pub recipient_name: String,
    pub recipient_account: String,
    pub amount: i64,
    pub fee: i64,
    pub tax: i64,
    pub currency: String,
    pub payment_method: String,
    pub tx_hash: Option<String>,
    pub status: String, // 'pending' | 'paid' | 'failed'
}

#[derive(Debug, Serialize)]
pub struct InvoiceResponse {
    pub success: bool,
    pub invoice_id: String,
    pub invoice_number: String,
    pub doc_hash: String,
    pub tx_hash: String,
    pub block_number: u64,
    pub status: String,
}

pub async fn generate_invoice(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<GenerateInvoiceRequest>,
) -> Result<Json<InvoiceResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let invoice_number = next_invoice_number(&state).await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate invoice number"))?;

    let invoice_id = Uuid::new_v4();
    let tx_uuid = payload.transaction_id.as_ref().and_then(|s| Uuid::parse_str(s).ok());
    let now = chrono::Utc::now();

    // Build invoice text for hashing
    let invoice_text = format!(
        "INVOICE {}\nDate: {}\nFrom: {} ({})
To: {} ({})
Amount: {} {}\nFee: {} {}\nTax: {} {}\nTotal: {} {}\nPayment Method: {}\nTransaction Type: {}\nStatus: {}",
        invoice_number,
        now.to_rfc3339(),
        payload.sender_name,
        payload.sender_account,
        payload.recipient_name,
        payload.recipient_account,
        payload.amount,
        payload.currency,
        payload.fee,
        payload.currency,
        payload.tax,
        payload.currency,
        payload.amount + payload.fee + payload.tax,
        payload.currency,
        payload.payment_method,
        payload.transaction_type,
        payload.status,
    );
    let doc_hash = sha256_hex(invoice_text.as_bytes());

    let (tx_hash, block_number) = match submit_invoice_anchor(
        &state, &address, &doc_hash, &invoice_number, tx_uuid, payload.amount, &payload.currency
    ).await {
        Ok(r) => r,
        Err(e) => {
            log_audit(&state, Some(&address), "invoice_generate", "invoice", Some(invoice_id), "failure", json!({"error": e})).await;
            return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, &e));
        }
    };

    let anchor_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO blockchain_anchors (id, anchor_type, doc_hash, tx_hash, block_number, user_address, related_id, nonce, payload, status, anchored_at)
         VALUES ($1, 'invoice_anchor', $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9)"
    )
    .bind(anchor_id)
    .bind(&doc_hash)
    .bind(&tx_hash)
    .bind(block_number as i64)
    .bind(&address)
    .bind(invoice_id)
    .bind(sha256_hex(tx_hash.as_bytes()))
    .bind(serde_json::json!({"invoice_number": &invoice_number, "amount": payload.amount}))
    .bind(now)
    .execute(&state.pg_pool)
    .await;

    let _ = sqlx::query(
        "INSERT INTO invoices (id, invoice_number, user_address, transaction_id, transaction_type, sender_name, sender_account, recipient_name, recipient_account, amount, fee, tax, currency, status, payment_method, tx_hash, blockchain_anchor_id, doc_hash, invoice_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)"
    )
    .bind(invoice_id)
    .bind(&invoice_number)
    .bind(&address)
    .bind(tx_uuid)
    .bind(&payload.transaction_type)
    .bind(&payload.sender_name)
    .bind(&payload.sender_account)
    .bind(&payload.recipient_name)
    .bind(&payload.recipient_account)
    .bind(payload.amount)
    .bind(payload.fee)
    .bind(payload.tax)
    .bind(&payload.currency)
    .bind(&payload.status)
    .bind(&payload.payment_method)
    .bind(&payload.tx_hash)
    .bind(anchor_id)
    .bind(&doc_hash)
    .bind(now)
    .execute(&state.pg_pool)
    .await;

    log_audit(&state, Some(&address), "invoice_generate", "invoice", Some(invoice_id), "success", json!({"invoice_number": &invoice_number, "tx_hash": &tx_hash})).await;
    log_api_call(&state, principal.as_ref(), "/accounts/:address/invoices/generate", "POST", 200).await;

    Ok(Json(InvoiceResponse {
        success: true,
        invoice_id: invoice_id.to_string(),
        invoice_number,
        doc_hash,
        tx_hash,
        block_number,
        status: payload.status,
    }))
}

// ─── List Invoices ───

#[derive(Debug, Serialize)]
pub struct InvoiceView {
    pub id: String,
    pub invoice_number: String,
    pub transaction_type: String,
    pub sender_name: String,
    pub recipient_name: String,
    pub amount: i64,
    pub amount_display: String,
    pub currency: String,
    pub status: String,
    pub payment_method: String,
    pub tx_hash: Option<String>,
    pub doc_hash: String,
    pub invoice_date: String,
    pub blockchain_anchor_id: Option<String>,
}

pub async fn list_invoices(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<InvoiceView>>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let rows = sqlx::query(
        "SELECT id, invoice_number, transaction_type, sender_name, recipient_name, amount, currency, status, payment_method, tx_hash, doc_hash, invoice_date, blockchain_anchor_id
         FROM invoices WHERE user_address = $1 ORDER BY invoice_date DESC"
    )
    .bind(&address)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let invoices: Vec<InvoiceView> = rows.into_iter().filter_map(|r| {
        let amount: i64 = r.try_get("amount").ok()?;
        Some(InvoiceView {
            id: r.try_get::<String, _>("id").ok()?,
            invoice_number: r.try_get::<String, _>("invoice_number").ok()?,
            transaction_type: r.try_get::<String, _>("transaction_type").ok()?,
            sender_name: r.try_get::<String, _>("sender_name").ok()?,
            recipient_name: r.try_get::<String, _>("recipient_name").ok()?,
            amount,
            amount_display: format!("{:.3}", amount as f64 / 1000.0),
            currency: r.try_get::<String, _>("currency").ok()?,
            status: r.try_get::<String, _>("status").ok()?,
            payment_method: r.try_get::<String, _>("payment_method").ok()?,
            tx_hash: r.try_get::<String, _>("tx_hash").ok(),
            doc_hash: r.try_get::<String, _>("doc_hash").ok()?,
            invoice_date: r.try_get::<chrono::DateTime<chrono::Utc>, _>("invoice_date").ok()?.to_rfc3339(),
            blockchain_anchor_id: r.try_get::<String, _>("blockchain_anchor_id").ok(),
        })
    }).collect();

    Ok(Json(invoices))
}

// ─── Public Invoice Verification ───

#[derive(Debug, Deserialize)]
pub struct VerifyQuery {
    pub invoice_id: Option<String>,
    pub doc_hash: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
    pub status: String,
    pub invoice_number: Option<String>,
    pub anchored_at: Option<String>,
    pub block_number: Option<i64>,
    pub tx_hash: Option<String>,
    pub amount: Option<String>,
    pub currency: Option<String>,
}

pub async fn verify_invoice(
    State(state): State<AppState>,
    Query(query): Query<VerifyQuery>,
) -> Result<Json<VerifyResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    if query.invoice_id.is_none() && query.doc_hash.is_none() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Provide invoice_id or doc_hash"));
    }

    // Try to find by invoice ID or doc hash
    let mut anchor_row = None;
    let mut invoice_row = None;

    if let Some(ref id) = query.invoice_id {
        invoice_row = sqlx::query(
            "SELECT id, invoice_number, amount, currency, status, invoice_date, blockchain_anchor_id, doc_hash FROM invoices WHERE invoice_number = $1 LIMIT 1"
        )
        .bind(id)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    }

    if invoice_row.is_none() && query.doc_hash.is_some() {
        invoice_row = sqlx::query(
            "SELECT id, invoice_number, amount, currency, status, invoice_date, blockchain_anchor_id, doc_hash FROM invoices WHERE doc_hash = $1 LIMIT 1"
        )
        .bind(query.doc_hash.as_ref().unwrap())
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
    }

    if let Some(ref row) = invoice_row {
        let anchor_id: Option<String> = row.try_get("blockchain_anchor_id").ok();
        if let Some(ref aid) = anchor_id {
            anchor_row = sqlx::query(
                "SELECT doc_hash, tx_hash, block_number, anchored_at, status FROM blockchain_anchors WHERE id = $1 LIMIT 1"
            )
            .bind(Uuid::parse_str(aid).ok())
            .fetch_optional(&state.pg_pool)
            .await
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;
        }
    }

    match (invoice_row, anchor_row) {
        (Some(inv), Some(anch)) => {
            let stored_hash: String = anch.try_get("doc_hash").unwrap_or_default();
            let query_hash = query.doc_hash.unwrap_or_default();
            let hash_matches = query_hash.is_empty() || stored_hash == query_hash;

            Ok(Json(VerifyResponse {
                valid: hash_matches,
                status: "verified".to_string(),
                invoice_number: inv.try_get("invoice_number").ok(),
                anchored_at: anch.try_get::<chrono::DateTime<chrono::Utc>, _>("anchored_at").ok().map(|d| d.to_rfc3339()),
                block_number: anch.try_get::<i64, _>("block_number").ok(),
                tx_hash: anch.try_get::<String, _>("tx_hash").ok(),
                amount: inv.try_get::<i64, _>("amount").ok().map(|a| format!("{:.3}", a as f64 / 1000.0)),
                currency: inv.try_get::<String, _>("currency").ok(),
            }))
        }
        (Some(_), None) => {
            Ok(Json(VerifyResponse {
                valid: false,
                status: "not_anchored".to_string(),
                invoice_number: None,
                anchored_at: None,
                block_number: None,
                tx_hash: None,
                amount: None,
                currency: None,
            }))
        }
        _ => {
            Ok(Json(VerifyResponse {
                valid: false,
                status: "not_found".to_string(),
                invoice_number: None,
                anchored_at: None,
                block_number: None,
                tx_hash: None,
                amount: None,
                currency: None,
            }))
        }
    }
}
