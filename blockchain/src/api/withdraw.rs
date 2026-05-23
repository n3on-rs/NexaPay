use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;
use uuid::Uuid;

use crate::api::AppState;
use crate::crypto::{hash_transaction_pin, verify_transaction_pin};
use sqlx::Row;

pub async fn withdraw_to_bank(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut amount: Option<f64> = None;
    let mut rib: Option<String> = None;
    let mut account_holder_name: Option<String> = None;
    let mut pin: Option<String> = None;
    let mut rib_document_path: Option<String> = None;
    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());
    let mut from_address = None;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name == "amount" {
            amount = field.text().await.unwrap_or_default().parse::<f64>().ok();
            continue;
        }
        if name == "rib" {
            rib = Some(field.text().await.unwrap_or_default());
            continue;
        }
        if name == "account_holder_name" {
            account_holder_name = Some(field.text().await.unwrap_or_default());
            continue;
        }
        if name == "pin" {
            pin = Some(field.text().await.unwrap_or_default());
            continue;
        }
        if name == "from_address" {
            from_address = Some(field.text().await.unwrap_or_default());
            continue;
        }
        if let Some(fname) = field.file_name() {
            let id = Uuid::new_v4();
            let dir = format!("{}/withdrawals/{}", upload_base, id);
            tokio::fs::create_dir_all(&dir).await.ok();
            let ext = fname.split('.').last().unwrap_or("pdf");
            let target = format!("{}/rib.{}", dir, ext);
            let data = field.bytes().await.unwrap_or_default();
            tokio::fs::write(&target, &data).await.ok();
            rib_document_path = Some(target);
        }
    }

    let from = match from_address {
        Some(a) => a,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing from_address"})),
            )
        }
    };
    let amount = match amount {
        Some(a) => a,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing amount"})),
            )
        }
    };
    let rib = match rib {
        Some(r) => r,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing rib"})),
            )
        }
    };
    let pin = match pin {
        Some(p) => p,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing pin"})),
            )
        }
    };
    let acc_name = account_holder_name.unwrap_or_default();
    let doc_path = rib_document_path.unwrap_or_default();

    // ─── PIN verification ───
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "PIN must be exactly 6 digits"})),
        );
    }

    let pin_row = sqlx::query("SELECT pin_hash FROM cards WHERE chain_address = $1")
        .bind(&from)
        .fetch_optional(&state.pg_pool)
        .await
        .unwrap_or(None);

    let stored_pin = match pin_row {
        Some(r) => r
            .try_get::<String, _>("pin_hash")
            .ok()
            .filter(|s| !s.is_empty()),
        None => None,
    };

    let stored_pin = match stored_pin {
        Some(p) => p,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Set your transaction PIN before withdrawing"})),
            )
        }
    };

    let (pin_valid, pin_upgrade) = verify_transaction_pin(&from, &pin, &state.encryption_key, &stored_pin);
    if !pin_valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid PIN"})),
        );
    }
    if pin_upgrade {
        let new_hash = hash_transaction_pin(&from, &pin, &state.encryption_key, None);
        let _ = sqlx::query("UPDATE cards SET pin_hash = $1 WHERE chain_address = $2")
            .bind(&new_hash)
            .bind(&from)
            .execute(&state.pg_pool)
            .await;
    }

    // Validate RIB length
    if rib.len() != 20 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_rib"})),
        );
    }

    // Fee calculation
    let fee = (amount * 0.01).clamp(1.0, 20.0);
    let withdrawal_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO bank_withdrawals (id, from_address, amount, fee, rib, account_holder_name, rib_document_path, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_REVIEW', NOW())",
    )
    .bind(withdrawal_id)
    .bind(&from)
    .bind(amount as f64)
    .bind(fee as f64)
    .bind(&rib)
    .bind(acc_name)
    .bind(doc_path)
    .execute(&state.pg_pool)
    .await;

    // Submit Transfer tx to mempool: to system escrow
    let tx_memo = format!("BANK_WITHDRAWAL:{}", withdrawal_id);
    let tx = crate::block::Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: crate::block::TxType::Transfer,
        from: from.clone(),
        to: std::env::var("SYSTEM_ESCROW_ADDRESS")
            .unwrap_or_else(|_| "NXP0000000000000000000000000000000".to_string()),
        amount: ((amount + fee) * 1000.0) as u64,
        fee: 0,
        timestamp: crate::chain::now_ts(),
        signature: String::new(),
        memo: tx_memo,
        hash: String::new(),
    };

    let mut chain = state.chain.lock().await;
    chain.add_pending_transaction(tx);

    (
        StatusCode::OK,
        Json(json!({
            "withdrawal_id": withdrawal_id.to_string(),
            "amount": amount,
            "fee": fee,
            "rib": format!("****{}", &rib[rib.len()-4..]),
            "status": "PENDING_REVIEW",
            "estimated_settlement": "1-2 business days",
            "message": "Your withdrawal is being processed. Funds held in escrow."
        })),
    )
}
