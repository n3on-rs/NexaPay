//! Health check, readiness probe, and Prometheus metrics endpoints.
//! Required by load balancers, Kubernetes, and operations teams.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::api::AppState;

/// GET /health — Liveness probe. Returns 200 if the process is alive.
pub async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "nexapay-node",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// GET /ready — Readiness probe. Checks DB connectivity and chain sync status.
pub async fn ready(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    // Check PostgreSQL connectivity
    let pg_ok = sqlx::query("SELECT 1")
        .fetch_optional(&state.pg_pool)
        .await
        .is_ok();

    // Check chain state
    let chain = state.chain.lock().await;
    let chain_height = chain.chain_height();
    let validator_count = chain.active_validator_count();
    let quorum = chain.quorum_size();

    let healthy = pg_ok && chain_height > 0;

    let status = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(json!({
            "status": if healthy { "ready" } else { "not_ready" },
            "checks": {
                "postgres": if pg_ok { "ok" } else { "failing" },
                "chain": format!("height={chain_height}, validators={validator_count}/{quorum}"),
            },
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}

/// GET /metrics — Prometheus-compatible metrics endpoint.
pub async fn metrics(State(state): State<AppState>) -> String {
    let chain = state.chain.lock().await;
    let height = chain.chain_height();
    let tx_count = chain.total_tx_count();
    let accounts = chain.accounts.len();
    let pending = chain.pending_transactions.len();
    let validators = chain.active_validator_count();
    let quorum = chain.quorum_size();

    format!(
        "# HELP nexapay_chain_height Current block height\n\
         # TYPE nexapay_chain_height gauge\n\
         nexapay_chain_height {height}\n\
         # HELP nexapay_transactions_total Total transactions processed\n\
         # TYPE nexapay_transactions_total counter\n\
         nexapay_transactions_total {tx_count}\n\
         # HELP nexapay_accounts_total Total on-chain accounts\n\
         # TYPE nexapay_accounts_total gauge\n\
         nexapay_accounts_total {accounts}\n\
         # HELP nexapay_pending_transactions Transactions in mempool\n\
         # TYPE nexapay_pending_transactions gauge\n\
         nexapay_pending_transactions {pending}\n\
         # HELP nexapay_validators_active Active validators\n\
         # TYPE nexapay_validators_active gauge\n\
         nexapay_validators_active {validators}\n\
         # HELP nexapay_quorum_size Required quorum size\n\
         # TYPE nexapay_quorum_size gauge\n\
         nexapay_quorum_size {quorum}\n\
         # HELP nexapay_up Node status\n\
         # TYPE nexapay_up gauge\n\
         nexapay_up 1\n"
    )
}
