use sqlx::PgPool;
use sqlx::Row;
use std::time::Duration;
use tokio::time::sleep;
use crate::chain::Blockchain;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde_json::json;

pub async fn spawn_agent_scorer(pg_pool: PgPool, chain: Arc<Mutex<Blockchain>>) {
    let interval_secs: u64 = std::env::var("AGENT_SCORER_INTERVAL_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(30);
    loop {
        if let Err(e) = run_scoring_pass(&pg_pool, chain.clone()).await {
            tracing::error!("agent scorer iteration failed: {:#?}", e);
        }
        sleep(Duration::from_secs(interval_secs)).await;
    }
}

async fn run_scoring_pass(pg_pool: &PgPool, chain: Arc<Mutex<Blockchain>>) -> Result<(), sqlx::Error> {
    let rows = sqlx::query("SELECT id, user_address, business_description, expected_monthly_volume, tax_document_path, created_at, business_name, business_type, tax_registration_number FROM agent_applications WHERE status='PENDING'")
        .fetch_all(pg_pool)
        .await?;

    for row in rows.iter() {
        let user_address: String = row.try_get("user_address")?;
        let id: uuid::Uuid = row.try_get("id")?;
        let business_description: Option<String> = row.try_get("business_description").ok();
        let expected_monthly_volume: Option<f64> = row.try_get("expected_monthly_volume").ok();
        let tax_document_path: String = row.try_get("tax_document_path").unwrap_or_default();
        let business_name: Option<String> = row.try_get("business_name").ok();
        let business_type: Option<String> = row.try_get("business_type").ok();
        let tax_registration_number: Option<String> = row.try_get("tax_registration_number").ok();

        // compute component scores
        let account_age = account_age_score(pg_pool, &user_address).await.unwrap_or(0.1);
        let tx_hist = transaction_history_score(chain.clone(), &user_address).await.unwrap_or(0.1);
        let balance = balance_score(pg_pool, &user_address).await.unwrap_or(0.2);
        let tax_doc = tax_document_score(&tax_document_path).await.unwrap_or(0.0);
        let business = business_profile_score(&business_description.clone().unwrap_or_default(), expected_monthly_volume.unwrap_or(0.0)).await.unwrap_or(0.0);

        let score = account_age * 0.15 + tx_hist * 0.25 + balance * 0.15 + tax_doc * 0.20 + business * 0.25;

        let status = if score >= 0.70 { "APPROVED" } else if score >= 0.45 { "UNDER_REVIEW" } else { "REJECTED" };

        let breakdown = json!({
            "account_age": account_age,
            "transaction_history": tx_hist,
            "balance": balance,
            "tax_document": tax_doc,
            "business_profile": business
        });

        sqlx::query("UPDATE agent_applications SET risk_score=$1, score_breakdown=$2, status=$3, reviewed_at=NOW() WHERE id=$4")
            .bind(score as f64)
            .bind(breakdown as serde_json::Value)
            .bind(status)
            .bind(id)
            .execute(pg_pool)
            .await?;

        if status == "APPROVED" {
            // trigger activation (simplified): insert into agent_profiles and create api key record (reuse existing api key infra)
            let monthly_limit = (expected_monthly_volume.unwrap_or(0.0) as f64) * 1.5;
            sqlx::query("INSERT INTO agent_profiles (user_address, application_id, business_name, business_type, tax_registration_number, is_active, monthly_volume_limit) VALUES ($1, $2, $3, $4, $5, true, $6) ON CONFLICT (user_address) DO UPDATE SET is_active = true, approved_at = NOW()")
                .bind(&user_address)
                .bind(id)
                .bind(business_name.unwrap_or_default())
                .bind(business_type.unwrap_or_default())
                .bind(tax_registration_number.unwrap_or_default())
                .bind(monthly_limit)
                .execute(pg_pool)
                .await?;
            // submit BankJoin tx to chain
            let mut c = chain.lock().await;
            let tx = crate::block::Transaction {
                id: uuid::Uuid::new_v4().to_string(),
                tx_type: crate::block::TxType::BankJoin,
                from: "SYSTEM".to_string(),
                to: user_address.clone(),
                amount: 0,
                fee: 0,
                timestamp: crate::chain::now_ts(),
                signature: String::new(),
                memo: "AGENT_APPROVAL".to_string(),
                hash: String::new(),
            };
            c.add_pending_transaction(tx);
        }
    }

    Ok(())
}

async fn account_age_score(pg_pool: &PgPool, user_address: &str) -> Result<f64, sqlx::Error> {
    let r = sqlx::query("SELECT created_at FROM users WHERE chain_address = $1 LIMIT 1")
        .bind(user_address)
        .fetch_optional(pg_pool)
        .await?;
    if let Some(row) = r {
        let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
        let age_days = (chrono::Utc::now().naive_utc() - created_at).num_days() as f64;
        Ok(if age_days > 30.0 {1.0} else if age_days > 15.0 {0.7} else if age_days > 7.0 {0.5} else {0.2})
    } else { Ok(0.2) }
}

async fn transaction_history_score(chain: Arc<Mutex<Blockchain>>, user_address: &str) -> Result<f64, sqlx::Error> {
    let c = chain.lock().await;
    let txs = c.blocks().iter().flat_map(|b| b.transactions.iter()).filter(|t| t.from==user_address).count();
    let total_vol: u64 = c.blocks().iter().flat_map(|b| b.transactions.iter()).filter(|t| t.from==user_address).map(|t| t.amount as u64).sum();
    drop(c);
    Ok(if txs>10 && total_vol>500_000 {1.0} else if txs>=5 {0.7} else if txs>=1 {0.4} else {0.1})
}

async fn balance_score(_pg_pool: &PgPool, _user_address: &str) -> Result<f64, sqlx::Error> {
    // Read from chain accounts table in sqlite or postgresql snapshot. For simplicity return medium
    Ok(0.8)
}

async fn tax_document_score(path: &str) -> Result<f64, sqlx::Error> {
    if path.is_empty() { return Ok(0.0); }
    if let Ok(meta) = std::fs::metadata(path) {
        let mut score: f64 = 0.5;
        if meta.len() > 50_000 { score += 0.3; }
        // simple variance check (skipped) +0.2
        score = (score).min(1.0_f64);
        return Ok(score);
    }
    Ok(0.0)
}

async fn business_profile_score(desc: &str, expected_monthly_volume: f64) -> Result<f64, sqlx::Error> {
    let mut score = 0.0;
    if desc.len() > 100 { score += 0.3; }
    if desc.len() > 250 { score += 0.2; }
    if expected_monthly_volume > 0.0 && expected_monthly_volume < 500000.0 { score += 0.3; }
    // tax regex assumed passed elsewhere +0.2
    Ok(score)
}
