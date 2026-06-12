use sqlx::PgPool;
use sqlx::Row;
use std::time::Duration;
use tokio::time::sleep;
use crate::chain::Blockchain;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde_json::json;

/// Keyword sets for different agent categories — higher coverage = higher score
const FINTECH_KEYWORDS: &[&str] = &[
    "payment", "paiement", "wallet", "transfer", "virement", "card", "carte",
    "bank", "banque", "fintech", "mobile money", "caisse", "checkout",
    "merchant", "commerçant", "pos", "tpe", "terminal", "gateway", "passerelle",
    "digital", "numérique", "online", "en ligne", "ecommerce", "e-commerce",
];

const BUSINESS_KEYWORDS: &[&str] = &[
    "business", "entreprise", "company", "société", "startup", "commerce",
    "service", "client", "customer", "revenue", "chiffre d'affaires", "growth",
    "croissance", "market", "marché", "solution", "platform", "plateforme",
    "tunisia", "tunisie", "tunisien", "africa", "afrique", "mena",
];

const RED_FLAGS: &[&str] = &[
    "casino", "gambling", "jeu d'argent", "crypto", "bitcoin", "anonymous",
    "anonyme", "dark", "illegal", "illicite", "fraud", "fraude",
];

const RISK_THRESHOLD: f64 = 0.70;  // approve above this
const REVIEW_THRESHOLD: f64 = 0.45; // manual review between this and threshold

pub async fn spawn_agent_scorer(pg_pool: PgPool, chain: Arc<Mutex<Blockchain>>) {
    let interval_secs: u64 = std::env::var("AGENT_SCORER_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(30);
    loop {
        if let Err(e) = run_scoring_pass(&pg_pool, chain.clone()).await {
            tracing::error!("agent scorer iteration failed: {:#?}", e);
        }
        sleep(Duration::from_secs(interval_secs)).await;
    }
}

async fn run_scoring_pass(pg_pool: &PgPool, chain: Arc<Mutex<Blockchain>>) -> Result<(), sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, user_address, business_description, expected_monthly_volume, \
         tax_document_path, created_at, business_name, business_type, tax_registration_number \
         FROM agent_applications WHERE status='PENDING'"
    )
    .fetch_all(pg_pool)
    .await?;

    for row in rows.iter() {
        let user_address: String = row.try_get("user_address")?;
        let id: uuid::Uuid = row.try_get("id")?;
        let business_description: String = row.try_get("business_description").unwrap_or_default();
        let expected_monthly_volume: f64 = row.try_get("expected_monthly_volume").unwrap_or(0.0);
        let tax_document_path: String = row.try_get("tax_document_path").unwrap_or_default();
        let business_name: String = row.try_get("business_name").unwrap_or_default();
        let business_type: String = row.try_get("business_type").unwrap_or_default();
        let tax_registration_number: String = row.try_get("tax_registration_number").unwrap_or_default();

        // ─── Component Scores ───
        let account_age = account_age_score(pg_pool, &user_address).await;
        let tx_hist = transaction_history_score(chain.clone(), &user_address).await;
        let balance = balance_score(chain.clone(), &user_address).await;
        let tax_doc = tax_document_score(&tax_document_path);
        let content = content_quality_score(&business_description, &business_type, &business_name);
        let volume = volume_reasonability_score(expected_monthly_volume);
        let risk = risk_score(&business_description, &business_name);

        // ─── Weighted Ensemble ───
        // Heavier weight on content quality and transaction history
        let score = account_age * 0.10
            + tx_hist * 0.20
            + balance * 0.15
            + tax_doc * 0.10
            + content * 0.20
            + volume * 0.15
            + risk * 0.10;

        // Penalty: if red flags found, cap the score
        let risk_penalty = if risk < 0.5 { 0.6 } else { 1.0 };
        let final_score = (score * risk_penalty).min(1.0);

        let status = if final_score >= RISK_THRESHOLD {
            "APPROVED"
        } else if final_score >= REVIEW_THRESHOLD {
            "UNDER_REVIEW"
        } else {
            "REJECTED"
        };

        let breakdown = json!({
            "account_age": account_age,
            "transaction_history": tx_hist,
            "balance": balance,
            "tax_document": tax_doc,
            "content_quality": content,
            "volume_reasonability": volume,
            "risk_assessment": risk,
            "risk_penalty": risk_penalty,
            "raw_score": score,
            "final_score": final_score,
        });

        sqlx::query(
            "UPDATE agent_applications SET risk_score=$1, score_breakdown=$2, status=$3, reviewed_at=NOW() WHERE id=$4"
        )
        .bind(final_score as f64)
        .bind(breakdown as serde_json::Value)
        .bind(status)
        .bind(id)
        .execute(pg_pool)
        .await?;

        if status == "APPROVED" {
            let monthly_limit = (expected_monthly_volume.max(10000.0) * 1.5) as f64;
            let _ = sqlx::query(
                "INSERT INTO agent_profiles (user_address, application_id, business_name, business_type, \
                 tax_registration_number, is_active, monthly_volume_limit) \
                 VALUES ($1, $2, $3, $4, $5, true, $6) \
                 ON CONFLICT (user_address) DO UPDATE SET is_active = true, approved_at = NOW()"
            )
            .bind(&user_address)
            .bind(id)
            .bind(&business_name)
            .bind(&business_type)
            .bind(&tax_registration_number)
            .bind(monthly_limit)
            .execute(pg_pool)
            .await;

            // Submit BankJoin tx to chain
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

        tracing::info!(
            "[agent_scorer] {} → score={:.3} status={} | age={:.2} tx={:.2} bal={:.2} content={:.2} vol={:.2} risk={:.2}",
            user_address, final_score, status, account_age, tx_hist, balance, content, volume, risk
        );
    }

    Ok(())
}

// ─── Scoring Functions ───

/// Account age score — normalizes age into 0-1 range with diminishing returns
async fn account_age_score(pg_pool: &PgPool, user_address: &str) -> f64 {
    let r = sqlx::query("SELECT created_at FROM users WHERE chain_address = $1 LIMIT 1")
        .bind(user_address)
        .fetch_optional(pg_pool)
        .await;
    match r {
        Ok(Some(row)) => {
            let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
            let age_days = (chrono::Utc::now().naive_utc() - created_at).num_days() as f64;
            // Sigmoid-like normalization: 30 days = 0.8, 90 days = 0.95, 180 days → 1.0
            (1.0 - (-age_days / 45.0).exp()).max(0.1).min(1.0)
        }
        _ => 0.15, // new account, slight benefit of doubt
    }
}

/// Transaction history — volume and frequency from on-chain data
async fn transaction_history_score(chain: Arc<Mutex<Blockchain>>, user_address: &str) -> f64 {
    let c = chain.lock().await;
    let blocks = c.blocks();
    let user_txs: Vec<_> = blocks
        .iter()
        .flat_map(|b| b.transactions.iter())
        .filter(|t| t.from == user_address || t.to == user_address)
        .collect();

    let tx_count = user_txs.len() as f64;
    let total_volume: u64 = user_txs.iter().map(|t| t.amount as u64).sum();

    // Log-scale normalization: 1 tx = 0.2, 10 tx = 0.6, 100 tx = 0.9
    let count_score = (1.0 - (-tx_count / 20.0).exp()).max(0.1).min(1.0);
    let vol_score = (1.0 - (-(total_volume as f64) / 500_000.0).exp()).max(0.1).min(1.0);

    count_score * 0.5 + vol_score * 0.5
}

/// Balance score — reads actual on-chain balance
async fn balance_score(chain: Arc<Mutex<Blockchain>>, user_address: &str) -> f64 {
    let c = chain.lock().await;
    match c.get_account(user_address) {
        Some(account) => {
            let tnd = account.balance as f64 / 1000.0;
            // Sigmoid: 50 TND = 0.5, 200 TND = 0.8, 1000 TND = 0.95
            (1.0 - (-tnd / 200.0).exp()).max(0.1).min(1.0)
        }
        None => 0.1, // no on-chain account yet
    }
}

/// Tax document score — validates file exists and has reasonable size
fn tax_document_score(path: &str) -> f64 {
    if path.is_empty() {
        return 0.2; // might not have uploaded yet, not fatal
    }
    match std::fs::metadata(path) {
        Ok(meta) => {
            let size_kb = meta.len() as f64 / 1024.0;
            // Too small: suspicious (5-20 KB is typical for scanned docs)
            // Too large: also suspicious (>10 MB)
            if size_kb < 2.0 {
                0.3 // too small to be a real document
            } else if size_kb > 10_240.0 {
                0.4 // suspiciously large
            } else if size_kb > 50.0 {
                0.9 // reasonable document
            } else {
                0.6 // borderline
            }
        }
        Err(_) => 0.0, // file missing
    }
}

/// Content quality — keyword coverage + description depth
fn content_quality_score(description: &str, business_type: &str, business_name: &str) -> f64 {
    let desc_lower = description.to_lowercase();
    let type_lower = business_type.to_lowercase();
    let name_lower = business_name.to_lowercase();

    // Fintech keyword coverage
    let fintech_hits = FINTECH_KEYWORDS
        .iter()
        .filter(|kw| desc_lower.contains(*kw) || type_lower.contains(*kw))
        .count() as f64;
    let fintech_score = (fintech_hits / 3.0).min(1.0); // 3+ fintech keywords = full score

    // Business keyword coverage
    let biz_hits = BUSINESS_KEYWORDS
        .iter()
        .filter(|kw| desc_lower.contains(*kw) || name_lower.contains(*kw))
        .count() as f64;
    let biz_score = (biz_hits / 4.0).min(1.0); // 4+ business keywords = full score

    // Description depth
    let length_score = if description.len() > 300 {
        1.0
    } else if description.len() > 150 {
        0.7
    } else if description.len() > 50 {
        0.4
    } else {
        0.1
    };

    // Has tax registration number pattern (Tunisian format: 7-8 digits + letter)
    let has_tax_id = !business_type.is_empty() && !business_name.is_empty();

    fintech_score * 0.35 + biz_score * 0.15 + length_score * 0.35 + (if has_tax_id { 0.15 } else { 0.0 })
}

/// Volume reasonability — expected monthly volume should be realistic
fn volume_reasonability_score(expected_monthly_volume: f64) -> f64 {
    if expected_monthly_volume <= 0.0 {
        return 0.3; // no volume estimate provided
    }
    let tnd = expected_monthly_volume / 1000.0;
    // Realistic range: 1K-500K TND/month for a Tunisian fintech agent
    if tnd < 1.0 {
        0.2 // too small to be meaningful
    } else if tnd > 1_000_000.0 {
        0.3 // suspiciously large for a new agent
    } else if tnd > 500_000.0 {
        0.6 // large but possible
    } else if tnd >= 10.0 {
        0.9 // realistic range
    } else {
        0.5 // small but plausible
    }
}

/// Risk assessment — checks for red flags in business description
fn risk_score(description: &str, business_name: &str) -> f64 {
    let desc_lower = description.to_lowercase();
    let name_lower = business_name.to_lowercase();

    let red_flag_count = RED_FLAGS
        .iter()
        .filter(|kw| desc_lower.contains(*kw) || name_lower.contains(*kw))
        .count();

    if red_flag_count > 0 {
        0.0 // hard fail on any red flag
    } else {
        // Check for positive signals
        let has_tunisia_ref = desc_lower.contains("tunis") || desc_lower.contains("tunisie");
        let has_compliance = desc_lower.contains("compliance")
            || desc_lower.contains("regulation")
            || desc_lower.contains("réglementation");

        let base: f64 = 0.7;
        let bonus: f64 = if has_tunisia_ref { 0.15 } else { 0.0 }
            + if has_compliance { 0.15 } else { 0.0 };
        ((base + bonus) as f64).min(1.0_f64)
    }
}
