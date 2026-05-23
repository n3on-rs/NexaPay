pub mod accounts;
pub mod admin;
pub mod admin_auth;
pub mod agent;
pub mod auth;
pub mod chain;
pub mod company;
pub mod consensus_api;
pub mod idempotency;
pub mod esign;
pub mod fund;
pub mod gateway;
pub mod health;
pub mod invoice;
pub mod key_management;
pub mod middleware;
pub mod withdraw;

use std::collections::HashMap;
use std::env;
use std::sync::Arc;

use axum::routing::{delete, get, post};
use axum::Router;
use jwt_simple::prelude::HS256Key;
use sqlx::PgPool;
use tokio::sync::{broadcast, Mutex};

use crate::chain::Blockchain;
use crate::db::sqlite::SqliteState;

#[derive(Clone)]
pub struct AppState {
    pub chain: Arc<Mutex<Blockchain>>,
    pub pg_pool: PgPool,
    pub sqlite_state: SqliteState,
    pub http_client: reqwest::Client,
    pub portal_base_url: String,
    pub auth_failures: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    pub confirm_ip_attempts: Arc<Mutex<HashMap<String, Vec<i64>>>>,
    pub jwt_key: HS256Key,
    pub admin_jwt_key: HS256Key,
    pub encryption_key: String,
    pub system_private_key: String,
    pub validator_address: String,
    pub validator_private_key: String,
    pub validator_public_key: String,
    /// Per-address SSE broadcast senders for real-time events.
    pub sse_broadcasters: Arc<std::sync::RwLock<HashMap<String, broadcast::Sender<String>>>>,
    pub env: String,
    pub payment_session_minutes: i64,
    /// Multi-validator: list of peer validator URLs for P2P consensus.
    pub validator_peers: Vec<String>,
    /// Whether we're running in multi-validator mode.
    pub is_multi_validator: bool,
    /// Domain for session cookies (e.g. `.nexapay.space`) so they work across subdomains.
    pub cookie_domain: String,
}

fn legacy_register_enabled() -> bool {
    env::var("NEXAPAY_ALLOW_LEGACY_REGISTER").as_deref() == Ok("true")
        || env::var("APP_ENV").as_deref() == Ok("development")
}

pub fn build_router(state: AppState) -> Router {
    let mut router = Router::new();
    if legacy_register_enabled() {
        router = router.route("/auth/register", post(auth::register));
    }
    router
        // Self-serve registration (direct, no KYC)
        .route("/auth/register/init", post(auth::register_init))
        .route("/auth/register/set-pin", post(auth::register_set_pin))
        .route("/auth/login", post(auth::login_with_pin))
        .route("/auth/login/verify-otp", post(auth::verify_login_otp))
        .route("/auth/me", get(auth::get_me))
        .route("/auth/recover/verify-identity", post(auth::verify_identity))
        .route("/auth/recover/verify-otp", post(auth::verify_recovery_otp))
        // /auth/recover/reset-password removed — use /auth/recover/reset-pin
        .route("/auth/recover/reset-pin", post(auth::reset_pin))
        .route("/auth/security-alert", post(auth::resolve_security_alert))
        .route("/auth/change-pin", post(auth::change_pin))
        .route("/auth/logout", post(auth::logout))
        .route("/accounts/:address", get(accounts::get_account))
        .route(
            "/accounts/:address/notifications",
            get(accounts::get_account_notifications),
        )
        .route(
            "/accounts/:address/notifications/:id/read",
            post(accounts::mark_notification_read),
        )
        .route(
            "/accounts/:address/notifications/read-all",
            post(accounts::mark_all_notifications_read),
        )
        .route(
            "/accounts/:address/set-pin",
            post(accounts::set_transaction_pin),
        )
        .route(
            "/accounts/:address/public",
            get(accounts::get_public_account),
        )
        .route("/accounts/:address/search", get(accounts::search_accounts))
        .route(
            "/accounts/:address/transactions",
            get(accounts::get_account_transactions),
        )
        .route("/accounts/:address/transfer", post(accounts::transfer))
        .route(
            "/accounts/:address/transfer/request-otp",
            post(accounts::request_transfer_otp),
        )
        .route(
            "/accounts/:address/transfer/verify-otp",
            post(accounts::verify_transfer_otp),
        )
        .route(
            "/accounts/:address/bank-transfer",
            post(accounts::bank_transfer),
        )
        .route(
            "/accounts/:address/bank-transfers",
            get(accounts::list_bank_transfers),
        )
        .route(
            "/accounts/:address/saved-beneficiaries",
            get(accounts::list_saved_beneficiaries),
        )
        .route(
            "/accounts/:address/saved-beneficiaries",
            post(accounts::add_saved_beneficiary),
        )
        .route(
            "/accounts/:address/saved-beneficiaries/:id",
            delete(accounts::delete_saved_beneficiary),
        )
        .route(
            "/accounts/:address/card/freeze",
            post(accounts::freeze_card),
        )
        .route(
            "/accounts/:address/card/lost",
            post(accounts::report_lost_card),
        )
        .route("/accounts/:address/profile", post(accounts::update_profile))
        .route("/accounts/:address/avatar", post(accounts::upload_avatar))
        .route("/accounts/:address/events", get(accounts::account_events))
        .route("/accounts/:address/fund", post(crate::api::fund::fund))
        .route(
            "/accounts/:address/withdraw-to-bank",
            post(crate::api::withdraw::withdraw_to_bank),
        )
        .route(
            "/accounts/:address/settings",
            get(company::get_account_settings),
        )
        .route(
            "/accounts/:address/settings",
            post(company::update_account_settings),
        )
        .route(
            "/accounts/:address/company",
            get(company::get_company_workspace),
        )
        .route(
            "/accounts/:address/company",
            post(company::create_company_workspace),
        )
        .route(
            "/accounts/:address/company/request",
            post(company::submit_vendor_request),
        )
        .route(
            "/accounts/:address/company/settings",
            post(company::update_company_settings),
        )
        .route(
            "/accounts/:address/company/api-keys/create",
            post(company::create_company_api_key),
        )
        .route(
            "/accounts/:address/company/api-keys/rotate",
            post(company::rotate_company_api_key),
        )
        .route(
            "/accounts/:address/company/api-keys/revoke",
            post(company::revoke_company_api_key),
        )
        .route(
            "/accounts/:address/company/withdraw",
            post(company::withdraw_company_balance),
        )
        .route(
            "/wallets/:address/pay-by-card",
            post(accounts::pay_wallet_by_card),
        )
        // Developer portal removed. Replace with Agent endpoints
        .route(
            "/accounts/:address/agent/apply",
            post(crate::api::agent::apply),
        )
        .route(
            "/accounts/:address/agent/status",
            get(crate::api::agent::status),
        )
        .route(
            "/accounts/:address/agent/dashboard",
            get(crate::api::agent::dashboard),
        )
        .route(
            "/admin/agents/applications",
            get(crate::api::admin::list_applications),
        )
        .route(
            "/admin/agents/applications/:id",
            get(crate::api::admin::get_application),
        )
        .route(
            "/admin/agents/applications/:id/approve",
            post(crate::api::admin::approve),
        )
        .route(
            "/admin/agents/applications/:id/reject",
            post(crate::api::admin::reject),
        )
        .route(
            "/admin/withdrawals/:id/process",
            post(crate::api::admin::process_withdrawal),
        )
        .route("/api-keys/rotate", post(key_management::rotate_api_key))
        .route("/api-keys/revoke", post(key_management::revoke_api_key))
        .route("/api-keys/usage", get(key_management::api_key_usage))
        .route(
            "/api-keys/permissions",
            post(key_management::update_api_key_permissions),
        )
        .route(
            "/gateway/v1/intents",
            get(gateway::list_intents).post(gateway::create_intent),
        )
        .route("/gateway/v1/intents/:intent_id", get(gateway::get_intent))
        .route(
            "/gateway/v1/intents/:intent_id",
            axum::routing::delete(gateway::delete_intent),
        )
        .route(
            "/gateway/v1/intents/:intent_id/public",
            get(gateway::get_intent_public),
        )
        .route(
            "/gateway/v1/intents/:intent_id/session",
            post(gateway::create_session),
        )
        .route(
            "/gateway/v1/intents/:intent_id/confirm",
            post(gateway::confirm_intent),
        )
        .route("/gateway/v1/environment", get(gateway::get_environment))
        .route("/gateway/v1/refunds", post(gateway::create_refund))
        .route("/gateway/v1/balance", get(gateway::gateway_balance))
        .route(
            "/gateway/v1/transactions",
            get(gateway::gateway_transactions),
        )
        .route("/gateway/v1/payout", post(gateway::gateway_payout))
        .route("/gateway/v1/webhooks", post(gateway::create_webhook))
        .route("/gateway/v1/webhooks", get(gateway::list_webhooks))
        .route(
            "/gateway/v1/webhooks/:id/deliveries",
            get(gateway::webhook_deliveries),
        )
        .route("/gateway/v1/webhooks/:id/test", post(gateway::test_webhook))
        .route(
            "/gateway/v1/webhooks/:id",
            axum::routing::delete(gateway::delete_webhook),
        )
        .route("/municipalities", get(accounts::get_municipalities))
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .route("/metrics", get(health::metrics))
        .route("/chain/stats", get(chain::chain_stats))
        .route("/chain/blocks", get(chain::list_blocks))
        .route("/chain/blocks/:index", get(chain::get_block))
        .route(
            "/chain/transactions/:hash",
            get(chain::get_transaction_by_hash),
        )
        // E-Signature routes
        .route(
            "/accounts/:address/esign/account",
            post(esign::sign_account_contract),
        )
        .route(
            "/accounts/:address/esign/contract",
            get(esign::get_account_contract),
        )
        .route(
            "/accounts/:address/esign/account/:doc_id/download",
            get(esign::download_signed_contract),
        )
        .route(
            "/accounts/:address/esign/account/:doc_id/pdf",
            get(esign::download_signed_contract_pdf),
        )
        .route(
            "/accounts/:address/esign/transfer",
            post(esign::sign_transfer_authorization),
        )
        .route(
            "/accounts/:address/esign/documents",
            get(esign::list_signed_documents),
        )
        // Invoice routes
        .route(
            "/accounts/:address/invoices/generate",
            post(invoice::generate_invoice),
        )
        .route("/accounts/:address/invoices", get(invoice::list_invoices))
        .route("/verify/invoice", get(invoice::verify_invoice))
        // ─── Admin Panel (requires X-Admin-Token) ───
        .route("/admin/login", post(admin_auth::admin_login))
        .route("/admin/login/verify-otp", post(admin_auth::admin_verify_otp))
        .route("/admin/seed", post(admin::seed_admin))
        .route("/admin/dashboard", get(admin::dashboard))
        .route("/admin/users", get(admin::list_users))
        .route("/admin/users/:address", get(admin::get_user))
        .route("/admin/users/:address/freeze", post(admin::freeze_user))
        .route("/admin/users/:address/unfreeze", post(admin::unfreeze_user))
        .route("/admin/transactions", get(admin::list_transactions))
        .route("/admin/audit", get(admin::audit_log))
        // ─── Multi-validator consensus P2P endpoints ───
        .route("/consensus/propose", post(consensus_api::receive_proposal))
        .route("/consensus/vote", post(consensus_api::receive_vote))
        .route("/consensus/commit", post(consensus_api::receive_commit))
        .route("/consensus/validators", get(consensus_api::get_validators))
        .route("/consensus/sync", post(consensus_api::sync_blocks))
        .with_state(state)
}
