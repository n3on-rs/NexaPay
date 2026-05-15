use axum::{extract::State, response::IntoResponse, Json, extract::Multipart};
use crate::api::AppState;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub async fn withdraw_to_bank(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    // fields: amount, rib, account_holder_name, rib_document (file), pin
    let mut amount: Option<f64> = None;
    let mut rib: Option<String> = None;
    let mut account_holder_name: Option<String> = None;
    let mut pin: Option<String> = None;
    let mut rib_document_path: Option<String> = None;
    let upload_base = std::env::var("UPLOAD_BASE_PATH").unwrap_or_else(|_| "./uploads".to_string());
    let mut from_address = None;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
            if name=="amount" { amount = field.text().await.unwrap_or_default().parse::<f64>().ok(); continue; }
            if name=="rib" { rib = Some(field.text().await.unwrap_or_default()); continue; }
            if name=="account_holder_name" { account_holder_name = Some(field.text().await.unwrap_or_default()); continue; }
            if name=="pin" { pin = Some(field.text().await.unwrap_or_default()); continue; }
            if name=="from_address" { from_address = Some(field.text().await.unwrap_or_default()); continue; }
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

    let from = match from_address { Some(a) => a, None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"missing from_address"}))) };
    let amount = match amount { Some(a) => a, None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"missing amount"}))) };
    let rib = match rib { Some(r) => r, None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"missing rib"}))) };
    let acc_name = account_holder_name.unwrap_or_default();
    let doc_path = rib_document_path.unwrap_or_default();

    // Validate pin omitted; validate RIB length
    if rib.len() != 20 { return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"invalid_rib"}))) }

    // Fee calculation
    let fee = (amount * 0.01).clamp(1.0, 20.0);
    let withdrawal_id = Uuid::new_v4();
    let _ = sqlx::query("INSERT INTO bank_withdrawals (id, from_address, amount, fee, rib, account_holder_name, rib_document_path, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_REVIEW', NOW())")
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
        id: uuid::Uuid::new_v4().to_string(),
        tx_type: crate::block::TxType::Transfer,
        from: from.clone(),
        to: std::env::var("SYSTEM_ESCROW_ADDRESS").unwrap_or_else(|_| "NXP0000000000000000000000000000000".to_string()),
        amount: ((amount+fee)*1000.0) as u64,
        fee: 0,
        timestamp: crate::chain::now_ts(),
        signature: String::new(),
        memo: tx_memo.clone(),
        hash: String::new(),
    };
    // push to chain pending
    let mut chain = state.chain.lock().await;
    chain.add_pending_transaction(tx);

    (axum::http::StatusCode::OK, Json(serde_json::json!({"withdrawal_id": withdrawal_id.to_string(), "amount": amount, "fee": fee, "rib": format!("****{}", &rib[rib.len()-4..]), "status":"PENDING_REVIEW", "estimated_settlement":"1-2 business days", "message":"Your withdrawal is being processed. Funds held in escrow."})))
}
