use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{require_account_token, try_api_key, auth_error_response, log_api_call};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::chain::now_ts;
use crate::crypto::{sha256_hex, encrypt_aes256_gcm, decrypt_aes256_gcm};

#[derive(Debug, Deserialize)]
pub struct AccountContractSignRequest {
    pub signature_image_base64: String,
    pub signature_type: String, // "draw" | "type"
    pub terms_accepted: bool,
}

#[derive(Debug, Serialize)]
pub struct ContractTextResponse {
    pub contract_text: String,
    pub doc_hash: String,
    pub terms_version: String,
}

#[derive(Debug, Serialize)]
pub struct AccountContractSignResponse {
    pub success: bool,
    pub document_id: String,
    pub doc_hash: String,
    pub tx_hash: String,
    pub block_number: u64,
    pub contract_text: String,
}

#[derive(Debug, Deserialize)]
pub struct TransferAuthRequest {
    pub transfer_id: String,
    pub amount: u64,
    pub destination_hash: String,
    pub signature_image_base64: String,
    pub signature_type: String,
}

#[derive(Debug, Serialize)]
pub struct TransferAuthResponse {
    pub success: bool,
    pub authorization_id: String,
    pub doc_hash: String,
    pub tx_hash: String,
    pub block_number: u64,
    pub expires_at: String,
}

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

async fn submit_anchor_to_chain(
    state: &AppState,
    user_address: &str,
    tx_type: TxType,
    doc_hash: &str,
    payload: Value,
) -> Result<(String, u64), String> {
    let nonce = sha256_hex(format!("{}:{}:{}", user_address, doc_hash, chrono::Utc::now().timestamp()).as_bytes());
    let memo = serde_json::json!({
        "type": format!("{:?}", tx_type),
        "doc_hash": doc_hash,
        "payload": payload,
        "nonce": nonce,
    }).to_string();

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type,
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
    chain.add_pending_transaction(tx.clone());
    let hash = tx.hash.clone();

    let block_number = if state.is_multi_validator {
        // Multi-validator: anchor goes to mempool, mined by consensus
        0u64
    } else {
        // Single-validator: mine immediately for instant anchoring
        match chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            Ok(block) => block.index,
            Err(_) => 0, // pending
        }
    };

    Ok((hash, block_number))
}

fn generate_account_contract_text(
    doc_id: &Uuid,
    now: &chrono::DateTime<chrono::Utc>,
    full_name: &str,
    cin: &str,
    email: &str,
    phone: &str,
    address: &str,
    cin_issue_date: &str,
    place_of_birth: &str,
    address_line: &str,
) -> String {
    format!(
        r#"NEXAPAY — ELECTRONIC ACCOUNT OPENING AGREEMENT
Document ID: {doc_id}
Date: {date}
Blockchain Address: {address}

═══════════════════════════════════════════════════════════════════
PARTIES
═══════════════════════════════════════════════════════════════════

1.  SERVICE PROVIDER
    NexaPay Financial Technologies S.A.
    Registered in the Republic of Tunisia
    Financial Services License: BCE/2024/NXP-001

2.  CUSTOMER ("Account Holder")
    Full Legal Name: {full_name}
    National ID (CIN): {cin}
    CIN Issue Date: {cin_issue_date}
    Place of Birth: {place_of_birth}
    Address: {address_line}
    Email: {email}
    Mobile: {phone}
    Blockchain Address: {address}

═══════════════════════════════════════════════════════════════════
1. DEFINITIONS
═══════════════════════════════════════════════════════════════════

"Account" means the electronic money account opened in your name on the NexaPay platform.
"E-Wallet" means the digital wallet services provided by NexaPay.
"Fiat Currency" means Tunisian Dinar (TND) and any other supported national currency.
"Digital Asset" means any blockchain-native token or cryptocurrency supported by NexaPay.
"Transaction" means any transfer, payment, deposit, or withdrawal initiated through your Account.
"KYC" means Know Your Customer identification and verification procedures.
"AML" means Anti-Money Laundering compliance procedures.

═══════════════════════════════════════════════════════════════════
2. SCOPE OF SERVICES
═══════════════════════════════════════════════════════════════════

NexaPay agrees to provide you with the following services:

2.1  Electronic Money Account
     — Issuance of a unique IBAN and RIB for receiving fiat transfers.
     — Holding and safeguarding fiat balances in segregated accounts.
     — Execution of domestic and international transfers.

2.2  Virtual Payment Card
     — Provision of a virtual Visa debit card for online purchases.
     — Real-time transaction notifications and spending controls.

2.3  Blockchain Wallet
     — Non-custodial wallet infrastructure for supported digital assets.
     — On-chain transaction signing and broadcasting.
     — Blockchain anchoring of signed documents and transaction receipts.

2.4  Invoice Engine
     — Automatic generation of invoices for all outgoing transactions.
     — Blockchain-anchored invoice verification.

═══════════════════════════════════════════════════════════════════
3. ACCOUNT OPENING & KYC/AML
═══════════════════════════════════════════════════════════════════

3.1  By opening this Account, you confirm that:
     (a) You are at least 18 years of age;
     (b) You are a resident of Tunisia or a legally permitted jurisdiction;
     (c) The information you provided is true, accurate, and complete;
     (d) You are not subject to any sanctions or financial restrictions.

3.2  You consent to NexaPay performing identity verification checks,
     including but not limited to:
     — Verification of your CIN against the National Identity Database;
     — Automated extraction and validation of your CIN document;
     — Screening against sanctions lists and PEP databases;
     — Ongoing transaction monitoring for suspicious activity.

3.3  NexaPay reserves the right to suspend or terminate your Account
     if KYC/AML checks reveal any discrepancies or risks.

═══════════════════════════════════════════════════════════════════
4. FEES & CHARGES
═══════════════════════════════════════════════════════════════════

4.1  Account Maintenance: FREE (no monthly or annual fees).
4.2  Domestic Transfers: 0.5% per transaction (minimum 0.500 TND).
4.3  International Transfers: 1.5% per transaction (minimum 5.000 TND).
4.4  Card Transactions: FREE (merchant interchange applies).
4.5  Blockchain Transaction Fees: Network fees only (paid to miners/validators).
4.6  NexaPay may revise fee schedules with 30 days prior notice.

═══════════════════════════════════════════════════════════════════
5. TRANSACTION LIMITS
═══════════════════════════════════════════════════════════════════

5.1  Daily Transfer Limit:     50,000 TND (or equivalent).
5.2  Monthly Transfer Limit:   500,000 TND (or equivalent).
5.3  Single Transaction Limit: 20,000 TND (or equivalent).
5.4  NexaPay may adjust limits based on your KYC tier and risk profile.

═══════════════════════════════════════════════════════════════════
6. SECURITY & AUTHENTICATION
═══════════════════════════════════════════════════════════════════

6.1  You are responsible for maintaining the confidentiality of your:
     — 6-digit PIN;
     — Recovery phrase (if applicable);
     — Device access credentials.

6.2  NexaPay implements the following security measures:
     — AES-256-GCM encryption for all sensitive data at rest;
     — Rate limiting on authentication endpoints;
     — IP-based anomaly detection;
     — Blockchain anchoring of all signed authorizations;
     — Audit logging of all account activities.

6.3  You agree to immediately notify NexaPay of any unauthorized
     access or suspicious activity.

═══════════════════════════════════════════════════════════════════
7. ELECTRONIC SIGNATURE & CONTRACT VALIDITY
═══════════════════════════════════════════════════════════════════

7.1  By affixing your electronic signature below, you acknowledge that:
     (a) You have read, understood, and agree to all terms herein;
     (b) Your electronic signature is legally binding under Tunisian
         Law No. 2002-50 on Electronic Exchanges and Commerce;
     (c) The cryptographic hash of this contract will be anchored on
         the NexaPay blockchain as immutable proof of agreement.

7.2  Your signature data is encrypted with AES-256-GCM and stored
     securely. The original contract text and your signature hash are
     permanently recorded on-chain.

═══════════════════════════════════════════════════════════════════
8. DATA PRIVACY & PROCESSING
═══════════════════════════════════════════════════════════════════

8.1  NexaPay processes your personal data in accordance with:
     — Law No. 2004-63 on the Protection of Personal Data (Tunisia);
     — GDPR principles (where applicable to international users).

8.2  You consent to the collection, processing, and storage of:
     — Identity documents and biometric data;
     — Transaction history and financial behavior;
     — Device information and IP addresses;
     — Communication records for support and compliance.

8.3  Your data will not be sold to third parties. Disclosure to
     regulatory authorities may occur as required by law.

═══════════════════════════════════════════════════════════════════
9. TERMINATION
═══════════════════════════════════════════════════════════════════

9.1  You may close your Account at any time via the mobile app
     or by written request to support@nexapay.space.

9.2  NexaPay may suspend or terminate your Account:
     — Upon 30 days written notice for convenience;
     — Immediately for fraud, money laundering, or terrorism financing;
     — Immediately for breach of these terms.

9.3  Upon termination, remaining fiat balances will be transferred
     to your registered bank account within 10 business days.

═══════════════════════════════════════════════════════════════════
10. DISPUTE RESOLUTION & GOVERNING LAW
═══════════════════════════════════════════════════════════════════

10.1 This Agreement is governed by the laws of the Republic of Tunisia.
10.2 Any dispute shall first be resolved through NexaPay's internal
     complaints procedure (30-day resolution target).
10.3 Failing resolution, disputes shall be submitted to the Tunisian
     Arbitration Centre under its Expedited Rules.
10.4 The blockchain record of this contract shall be admissible
     as evidence in any proceeding.

═══════════════════════════════════════════════════════════════════
11. ACKNOWLEDGMENT
═══════════════════════════════════════════════════════════════════

I, {full_name}, holder of CIN {cin}, hereby confirm that:
  [x] I have read and understood the NexaPay Account Opening Agreement;
  [x] I consent to KYC/AML verification and ongoing monitoring;
  [x] I agree to the fee schedule and transaction limits;
  [x] I accept the electronic signature and blockchain anchoring process;
  [x] I understand my data will be processed as described in Section 8.

Electronic Signature affixed on {date}
Document Hash (SHA-256): {doc_hash}
Blockchain Anchor: Pending

═══════════════════════════════════════════════════════════════════
NexaPay Financial Technologies S.A. — All rights reserved.
Version 1.0 — Effective January 2026
"#,
        doc_id = doc_id,
        date = now.to_rfc3339(),
        full_name = full_name,
        cin = cin,
        cin_issue_date = cin_issue_date,
        place_of_birth = place_of_birth,
        address_line = address_line,
        email = email,
        phone = phone,
        address = address,
        doc_hash = "{doc_hash}"
    )
}

// ─── Account Opening E-Sign ───

pub async fn sign_account_contract(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<AccountContractSignRequest>,
) -> Result<Json<AccountContractSignResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if !payload.terms_accepted {
        return Err(api_error(StatusCode::BAD_REQUEST, "You must accept the Terms and Conditions"));
    }
    if payload.signature_image_base64.is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Signature is required"));
    }
    let sig_type = if payload.signature_type == "type" { "type" } else { "draw" };

    // Get user details for the contract (including CIN-extracted fields)
    let user_row = sqlx::query(
        "SELECT full_name, cin, email, phone, cin_issue_date, place_of_birth, address_line FROM users WHERE chain_address = $1 LIMIT 1"
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let (full_name, cin, email, phone, cin_issue_date, place_of_birth, address_line) = match user_row {
        Some(r) => (
            r.try_get::<String, _>("full_name").unwrap_or_default(),
            r.try_get::<String, _>("cin").unwrap_or_default(),
            r.try_get::<String, _>("email").unwrap_or_default(),
            r.try_get::<String, _>("phone").unwrap_or_default(),
            r.try_get::<String, _>("cin_issue_date").unwrap_or_default(),
            r.try_get::<String, _>("place_of_birth").unwrap_or_default(),
            r.try_get::<String, _>("address_line").unwrap_or_default(),
        ),
        None => return Err(api_error(StatusCode::NOT_FOUND, "User not found")),
    };

    let doc_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    // Generate the contract text
    let contract_text = generate_account_contract_text(
        &doc_id, &now, &full_name, &cin, &email, &phone, &address,
        &cin_issue_date, &place_of_birth, &address_line,
    );
    let doc_hash = sha256_hex(contract_text.as_bytes());

    // Encrypt the signature image with AES-256-GCM using the system encryption key
    let encrypted_sig = match encrypt_aes256_gcm(&state.encryption_key, &payload.signature_image_base64) {
        Ok(enc) => enc,
        Err(_) => return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, "Signature encryption failed")),
    };

    // Store signed document with encrypted signature and contract text
    let _ = sqlx::query(
        "INSERT INTO signed_documents (id, user_address, doc_type, doc_hash, signature_data, signature_type, signed_at, status, metadata, contract_text, terms_version)
         VALUES ($1, $2, 'account_opening', $3, $4, $5, $6, 'signed', $7, $8, '1.0')"
    )
    .bind(doc_id)
    .bind(&address)
    .bind(&doc_hash)
    .bind(&encrypted_sig)
    .bind(sig_type)
    .bind(now)
    .bind(serde_json::json!({"full_name": full_name, "cin": cin, "terms_accepted": true}))
    .bind(&contract_text)
    .execute(&state.pg_pool)
    .await;

    // Anchor on chain
    let anchor_payload = serde_json::json!({
        "type": "esign_account",
        "user_id": address,
        "timestamp": now.to_rfc3339(),
        "doc_hash": doc_hash,
    });

    let (tx_hash, block_number) = match submit_anchor_to_chain(
        &state, &address, TxType::EsignAccount, &doc_hash, anchor_payload
    ).await {
        Ok(r) => r,
        Err(e) => {
            log_audit(&state, Some(&address), "esign_account", "document", Some(doc_id), "failure", json!({"error": e})).await;
            return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, &e));
        }
    };

    // Update document status to anchored
    let _ = sqlx::query(
        "UPDATE signed_documents SET status = 'anchored' WHERE id = $1"
    )
    .bind(doc_id)
    .execute(&state.pg_pool)
    .await;

    // Record blockchain anchor
    let anchor_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO blockchain_anchors (id, anchor_type, doc_hash, tx_hash, block_number, user_address, related_id, nonce, payload, status, anchored_at)
         VALUES ($1, 'esign_account', $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9)"
    )
    .bind(anchor_id)
    .bind(&doc_hash)
    .bind(&tx_hash)
    .bind(block_number as i64)
    .bind(&address)
    .bind(doc_id)
    .bind(sha256_hex(tx_hash.as_bytes()))
    .bind(serde_json::json!({"doc_id": doc_id.to_string(), "timestamp": now.to_rfc3339()}))
    .bind(now)
    .execute(&state.pg_pool)
    .await;

    log_audit(&state, Some(&address), "esign_account", "document", Some(doc_id), "success", json!({"tx_hash": &tx_hash, "block": block_number})).await;
    log_api_call(&state, principal.as_ref(), "/accounts/:address/esign/account", "POST", 200).await;

    Ok(Json(AccountContractSignResponse {
        success: true,
        document_id: doc_id.to_string(),
        doc_hash,
        tx_hash,
        block_number,
        contract_text,
    }))
}

// ─── Transfer Authorization E-Sign ───

pub async fn sign_transfer_authorization(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<TransferAuthRequest>,
) -> Result<Json<TransferAuthResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if payload.signature_image_base64.is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Signature is required"));
    }
    let sig_type = if payload.signature_type == "type" { "type" } else { "draw" };

    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(15);
    let auth_text = format!(
        "NEXAPAY TRANSFER AUTHORIZATION\nTransfer ID: {}\nAmount: {}\nDestination Hash: {}\nExpires: {}\n\nBy signing, I authorize NexaPay to execute this transfer on my behalf.",
        payload.transfer_id, payload.amount, payload.destination_hash, expires_at.to_rfc3339()
    );
    let doc_hash = sha256_hex(auth_text.as_bytes());

    let doc_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO signed_documents (id, user_address, doc_type, doc_hash, signature_data, signature_type, signed_at, status, metadata)
         VALUES ($1, $2, 'transfer_auth', $3, $4, $5, $6, 'signed', $7)"
    )
    .bind(doc_id)
    .bind(&address)
    .bind(&doc_hash)
    .bind(&payload.signature_image_base64)
    .bind(sig_type)
    .bind(chrono::Utc::now())
    .bind(serde_json::json!({"transfer_id": &payload.transfer_id, "amount": payload.amount}))
    .execute(&state.pg_pool)
    .await;

    let anchor_payload = serde_json::json!({
        "type": "esign_transfer",
        "user_id": address,
        "transfer_id": payload.transfer_id,
        "amount": payload.amount,
        "destination_hash": payload.destination_hash,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "doc_hash": doc_hash,
    });

    let (tx_hash, block_number) = match submit_anchor_to_chain(
        &state, &address, TxType::EsignTransfer, &doc_hash, anchor_payload
    ).await {
        Ok(r) => r,
        Err(e) => {
            log_audit(&state, Some(&address), "esign_transfer", "document", Some(doc_id), "failure", json!({"error": e})).await;
            return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, &e));
        }
    };

    let _ = sqlx::query(
        "UPDATE signed_documents SET status = 'anchored' WHERE id = $1"
    )
    .bind(doc_id)
    .execute(&state.pg_pool)
    .await;

    // Create transfer authorization record
    let auth_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO transfer_authorizations (id, user_address, transfer_id, signed_document_id, blockchain_anchor_id, amount, destination_hash, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')"
    )
    .bind(auth_id)
    .bind(&address)
    .bind(Uuid::parse_str(&payload.transfer_id).ok())
    .bind(doc_id)
    .bind(Uuid::parse_str(&tx_hash).ok())
    .bind(payload.amount as i64)
    .bind(&payload.destination_hash)
    .bind(expires_at)
    .execute(&state.pg_pool)
    .await;

    let anchor_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO blockchain_anchors (id, anchor_type, doc_hash, tx_hash, block_number, user_address, related_id, nonce, payload, status, anchored_at)
         VALUES ($1, 'esign_transfer', $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9)"
    )
    .bind(anchor_id)
    .bind(&doc_hash)
    .bind(&tx_hash)
    .bind(block_number as i64)
    .bind(&address)
    .bind(doc_id)
    .bind(sha256_hex(tx_hash.as_bytes()))
    .bind(serde_json::json!({"transfer_id": &payload.transfer_id, "amount": payload.amount}))
    .bind(chrono::Utc::now())
    .execute(&state.pg_pool)
    .await;

    log_audit(&state, Some(&address), "esign_transfer", "document", Some(doc_id), "success", json!({"tx_hash": &tx_hash, "block": block_number})).await;
    log_api_call(&state, principal.as_ref(), "/accounts/:address/esign/transfer", "POST", 200).await;

    Ok(Json(TransferAuthResponse {
        success: true,
        authorization_id: auth_id.to_string(),
        doc_hash,
        tx_hash,
        block_number,
        expires_at: expires_at.to_rfc3339(),
    }))
}

// ─── Get signed documents ───

#[derive(Debug, Serialize)]
pub struct SignedDocumentView {
    pub id: String,
    pub doc_type: String,
    pub doc_hash: String,
    pub signature_type: String,
    pub signed_at: String,
    pub status: String,
    pub metadata: Value,
}

pub async fn list_signed_documents(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<SignedDocumentView>>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let rows = sqlx::query(
        "SELECT id, doc_type, doc_hash, signature_type, signed_at, status, metadata FROM signed_documents WHERE user_address = $1 ORDER BY signed_at DESC"
    )
    .bind(&address)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let docs: Vec<SignedDocumentView> = rows.into_iter().filter_map(|r| {
        Some(SignedDocumentView {
            id: r.try_get::<String, _>("id").ok()?,
            doc_type: r.try_get::<String, _>("doc_type").ok()?,
            doc_hash: r.try_get::<String, _>("doc_hash").ok()?,
            signature_type: r.try_get::<String, _>("signature_type").ok()?,
            signed_at: r.try_get::<chrono::DateTime<chrono::Utc>, _>("signed_at").ok()?.to_rfc3339(),
            status: r.try_get::<String, _>("status").ok()?,
            metadata: r.try_get::<Value, _>("metadata").ok().unwrap_or(json!({})),
        })
    }).collect();

    Ok(Json(docs))
}

// ─── Get Account Contract for Review ───

pub async fn get_account_contract(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ContractTextResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let user_row = sqlx::query(
        "SELECT full_name, cin, email, phone, cin_issue_date, place_of_birth, address_line FROM users WHERE chain_address = $1 LIMIT 1"
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let (full_name, cin, email, phone, cin_issue_date, place_of_birth, address_line) = match user_row {
        Some(r) => (
            r.try_get::<String, _>("full_name").unwrap_or_default(),
            r.try_get::<String, _>("cin").unwrap_or_default(),
            r.try_get::<String, _>("email").unwrap_or_default(),
            r.try_get::<String, _>("phone").unwrap_or_default(),
            r.try_get::<String, _>("cin_issue_date").unwrap_or_default(),
            r.try_get::<String, _>("place_of_birth").unwrap_or_default(),
            r.try_get::<String, _>("address_line").unwrap_or_default(),
        ),
        None => return Err(api_error(StatusCode::NOT_FOUND, "User not found")),
    };

    let doc_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    let contract_text = generate_account_contract_text(
        &doc_id, &now, &full_name, &cin, &email, &phone, &address,
        &cin_issue_date, &place_of_birth, &address_line,
    );
    let doc_hash = sha256_hex(contract_text.as_bytes());

    Ok(Json(ContractTextResponse {
        contract_text,
        doc_hash,
        terms_version: "1.0".to_string(),
    }))
}

// ─── Download Signed Contract ───

#[derive(Debug, Serialize)]
pub struct SignedContractDownloadResponse {
    pub contract_text: String,
    pub signature_image_base64: String,
    pub signed_at: String,
    pub doc_hash: String,
    pub tx_hash: String,
    pub block_number: i64,
}

pub async fn download_signed_contract(
    State(state): State<AppState>,
    Path((address, doc_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<SignedContractDownloadResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let _principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let doc_uuid = match Uuid::parse_str(&doc_id) {
        Ok(u) => u,
        Err(_) => return Err(api_error(StatusCode::BAD_REQUEST, "Invalid document ID")),
    };

    let row = sqlx::query(
        "SELECT contract_text, signature_data, signed_at, doc_hash, status FROM signed_documents WHERE id = $1 AND user_address = $2 LIMIT 1"
    )
    .bind(doc_uuid)
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let (contract_text, encrypted_sig, signed_at, doc_hash, status) = match row {
        Some(r) => (
            r.try_get::<String, _>("contract_text").unwrap_or_default(),
            r.try_get::<String, _>("signature_data").unwrap_or_default(),
            r.try_get::<chrono::DateTime<chrono::Utc>, _>("signed_at").unwrap_or_else(|_| chrono::Utc::now()),
            r.try_get::<String, _>("doc_hash").unwrap_or_default(),
            r.try_get::<String, _>("status").unwrap_or_default(),
        ),
        None => return Err(api_error(StatusCode::NOT_FOUND, "Signed document not found")),
    };

    if status != "anchored" {
        return Err(api_error(StatusCode::BAD_REQUEST, "Document not yet anchored on blockchain"));
    }

    // Decrypt the signature for the authorized owner
    let decrypted_sig = match decrypt_aes256_gcm(&state.encryption_key, &encrypted_sig) {
        Ok(sig) => sig,
        Err(_) => return Err(api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to decrypt signature")),
    };

    // Get the blockchain anchor details
    let anchor_row = sqlx::query(
        "SELECT tx_hash, block_number FROM blockchain_anchors WHERE related_id = $1 AND anchor_type = 'esign_account' LIMIT 1"
    )
    .bind(doc_uuid)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let (tx_hash, block_number) = match anchor_row {
        Some(r) => (
            r.try_get::<String, _>("tx_hash").unwrap_or_default(),
            r.try_get::<i64, _>("block_number").unwrap_or(0),
        ),
        None => (String::new(), 0),
    };

    Ok(Json(SignedContractDownloadResponse {
        contract_text,
        signature_image_base64: decrypted_sig,
        signed_at: signed_at.to_rfc3339(),
        doc_hash,
        tx_hash,
        block_number,
    }))
}
