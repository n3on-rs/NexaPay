use sqlx::PgPool;
use tracing;

/// Backup Sled blocks + chain accounts to PostgreSQL so chain state survives
/// HF Space /data volume loss or full rebuilds.
pub async fn backup_chain_state(
    pg: &PgPool,
    blocks: &[crate::block::Block],
    accounts: &std::collections::HashMap<String, crate::account::ChainAccount>,
    block_height: u64,
) {
    // Backup blocks
    match serde_json::to_value(blocks) {
        Ok(blocks_json) => {
            if let Err(e) = sqlx::query(
                "INSERT INTO chain_snapshots (snapshot_type, block_height, data) VALUES ('blocks', $1, $2)"
            )
            .bind(block_height as i64)
            .bind(&blocks_json)
            .execute(pg)
            .await
            {
                tracing::warn!("[backup] Failed to backup blocks: {}", e);
            } else {
                tracing::info!("[backup] Backed up {} blocks at height {}", blocks.len(), block_height);
            }
        }
        Err(e) => tracing::warn!("[backup] Failed to serialize blocks: {}", e),
    }

    // Backup accounts
    let accounts_vec: Vec<serde_json::Value> = accounts
        .iter()
        .map(|(addr, acc)| {
            serde_json::json!({
                "address": addr,
                "balance": acc.balance,
                "tx_count": acc.tx_count,
                "account_type": format!("{:?}", acc.account_type),
                "created_at": acc.created_at,
                "is_active": acc.is_active,
                "kyc_hash": acc.kyc_hash,
            })
        })
        .collect();

    match serde_json::to_value(&accounts_vec) {
        Ok(accounts_json) => {
            if let Err(e) = sqlx::query(
                "INSERT INTO chain_snapshots (snapshot_type, block_height, data) VALUES ('accounts', $1, $2)"
            )
            .bind(block_height as i64)
            .bind(&accounts_json)
            .execute(pg)
            .await
            {
                tracing::warn!("[backup] Failed to backup accounts: {}", e);
            } else {
                tracing::info!("[backup] Backed up {} accounts at height {}", accounts_vec.len(), block_height);
            }
        }
        Err(e) => tracing::warn!("[backup] Failed to serialize accounts: {}", e),
    }
}

/// Restore accounts from the latest PostgreSQL snapshot into in-memory chain state.
/// Called on startup to recover from Sled data loss.
pub async fn restore_accounts_from_backup(
    pg: &PgPool,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let row = sqlx::query_as::<_, (serde_json::Value,)>(
        "SELECT data FROM chain_snapshots WHERE snapshot_type = 'accounts' ORDER BY block_height DESC LIMIT 1"
    )
    .fetch_optional(pg)
    .await?;

    match row {
        Some((data,)) => {
            let accounts: Vec<serde_json::Value> =
                serde_json::from_value(data).unwrap_or_default();
            tracing::info!(
                "[backup] Restored {} accounts from latest snapshot",
                accounts.len()
            );
            Ok(accounts)
        }
        None => {
            tracing::info!("[backup] No account snapshot found — starting fresh");
            Ok(Vec::new())
        }
    }
}
