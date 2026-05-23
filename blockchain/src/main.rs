mod account;
mod api;
mod block;
mod chain;
mod consensus;
mod crypto;
mod db;
mod generator;
mod services;
mod storage;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::http::Method;
use jwt_simple::prelude::HS256Key;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::api::{build_router, AppState};
use crate::block::ValidatorInfo;
use crate::chain::Blockchain;
use crate::consensus::start_consensus;
use crate::crypto::{generate_keypair, sha256_hex};
use crate::db::postgres::{connect, run_migrations};
use crate::db::sqlite::SqliteState;
use crate::services::agent_scorer;
use crate::storage::BlockStorage;

/// Parse validator configuration from environment variables.
///
/// Format:
///   NEXAPAY_VALIDATOR_COUNT=3          (number of validators)
///   NEXAPAY_VALIDATOR_INDEX=0         (this validator's index, 0-based)
///   NEXAPAY_VALIDATOR_0_KEY=hex_sk    (private key for validator 0)
///   NEXAPAY_VALIDATOR_0_URL=http://... (HTTP URL for validator 0)
///   NEXAPAY_VALIDATOR_1_KEY=hex_sk
///   NEXAPAY_VALIDATOR_1_URL=http://...
///   ... etc.
///
/// If NEXAPAY_VALIDATOR_COUNT is not set or <= 1, runs in single-validator mode.
fn parse_validator_config() -> (
    Vec<ValidatorInfo>,
    String,      // my private key
    String,      // my public key
    String,      // my address
    Vec<String>, // peer URLs
    bool,        // is_multi_validator
) {
    let count: usize = env::var("NEXAPAY_VALIDATOR_COUNT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    // Read app_env early for dev-only fallback checks
    let app_env = env::var("NEXAPAY_ENV")
        .or_else(|_| env::var("APP_ENV"))
        .unwrap_or_else(|_| "sandbox".to_string())
        .to_lowercase();

    if count <= 1 {
        // Single-validator mode: generate a single keypair (legacy behavior)
        let (sk, pk) = generate_keypair();
        let addr = crate::crypto::address_from_public_key(&pk);
        return (Vec::new(), sk, pk, addr, Vec::new(), false);
    }

    let my_index: usize = env::var("NEXAPAY_VALIDATOR_INDEX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut validators = Vec::new();
    let mut my_sk = String::new();
    let mut my_pk = String::new();
    let mut my_addr = String::new();
    let mut peers = Vec::new();

    for i in 0..count {
        let key_env = format!("NEXAPAY_VALIDATOR_{}_KEY", i);
        let url_env = format!("NEXAPAY_VALIDATOR_{}_URL", i);

        let sk = env::var(&key_env).unwrap_or_else(|_| {
            // Dev-only: if APP_ENV is development/sandbox and no key set,
            // derive from index so all nodes agree on identities.
            // In production, NEXAPAY_VALIDATOR_N_KEY is required.
            if app_env == "development" || app_env == "sandbox" || app_env == "demo" {
                sha256_hex(format!("NEXAPAY_VALIDATOR_SEED{}", i).as_bytes())
            } else {
                panic!("NEXAPAY_VALIDATOR_{}_KEY is required in production", i);
            }
        });

        let (actual_sk, pk, addr) = crate::crypto::validator_keypair_from_hex_key(&sk)
            .expect(&format!("Invalid NEXAPAY_VALIDATOR_{}_KEY — must be 64 hex chars (32 bytes)", i));

        let url = env::var(&url_env).unwrap_or_else(|_| format!("http://validator{i}:8080"));

        if i == my_index {
            my_sk = actual_sk;
            my_pk = pk.clone();
            my_addr = addr.clone();
        } else {
            peers.push(url.clone());
        }

        validators.push(ValidatorInfo {
            address: addr,
            public_key: pk,
            url,
            is_active: true,
            joined_at: crate::chain::now_ts(),
        });
    }

    tracing::info!(
        "[bootstrap] Multi-validator mode: {} validators, I am index {my_index} ({}), {} peers",
        validators.len(),
        my_addr,
        peers.len()
    );

    (validators, my_sk, my_pk, my_addr, peers, true)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    let database_url = env::var("NEXAPAY_DATABASE_URL").unwrap_or_else(|_| {
        "postgresql://nexapay:nexapay_secret@localhost:5432/nexapay".to_string()
    });
    let jwt_secret = env::var("NEXAPAY_JWT_SECRET").unwrap_or_else(|_| {
        "change_this_in_production_64_chars_minimum_change_this_in_production".to_string()
    });
    let encryption_key = env::var("NEXAPAY_ENCRYPTION_KEY").unwrap_or_else(|_| {
        "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string()
    });
    let port = env::var("NEXAPAY_PORT").unwrap_or_else(|_| "8080".to_string());
    let portal_base_url =
        env::var("NEXAPAY_PORTAL_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let payment_session_minutes = env::var("NEXAPAY_PAYMENT_SESSION_MINUTES")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(10);
    let app_env = env::var("NEXAPAY_ENV")
        .or_else(|_| env::var("APP_ENV"))
        .unwrap_or_else(|_| "sandbox".to_string())
        .to_lowercase();

    // Parse validator configuration
    let (
        initial_validators,
        validator_private_key,
        validator_public_key,
        validator_address,
        validator_peers,
        is_multi_validator,
    ) = parse_validator_config();

    let pool = connect(&database_url).await?;
    run_migrations(&pool).await?;
    let chain_state_dir =
        env::var("NEXAPAY_STATE_DIR").unwrap_or_else(|_| "./chain_state".to_string());
    fs::create_dir_all(&chain_state_dir)?;
    let sqlite_state = SqliteState::open(&format!("{chain_state_dir}/nexapay_state.sqlite"))?;

    let system_private_key = env::var("NEXAPAY_SYSTEM_PRIVATE_KEY").unwrap_or_else(|_| {
        let (sk, _pk) = generate_keypair();
        sk
    });

    // ─── Production safety: refuse known default secrets ───
    let is_production = app_env == "production" || app_env == "prod";
    if is_production {
        let default_jwt = "change_this_in_production_64_chars_minimum_change_this_in_production";
        let default_enc = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        let default_sys = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        if jwt_secret == default_jwt {
            panic!("REFUSING TO START: NEXAPAY_JWT_SECRET is the default value. Set a real secret.");
        }
        if encryption_key == default_enc {
            panic!("REFUSING TO START: NEXAPAY_ENCRYPTION_KEY is the default value. Set a real key.");
        }
        if system_private_key == default_sys {
            panic!("REFUSING TO START: NEXAPAY_SYSTEM_PRIVATE_KEY is the default value. Set a real key.");
        }
        if jwt_secret.len() < 32 {
            panic!("REFUSING TO START: NEXAPAY_JWT_SECRET must be at least 32 characters.");
        }
        if encryption_key.len() != 64 {
            panic!("REFUSING TO START: NEXAPAY_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes).");
        }
        if system_private_key.len() != 64 {
            panic!("REFUSING TO START: NEXAPAY_SYSTEM_PRIVATE_KEY must be exactly 64 hex chars (32 bytes).");
        }
    }

    let chain_data_dir =
        env::var("NEXAPAY_CHAIN_DATA_DIR").unwrap_or_else(|_| "./chain_data".to_string());
    fs::create_dir_all(&chain_data_dir)?;
    let storage = BlockStorage::open(&chain_data_dir)?;

    let chain = Blockchain::new(
        storage,
        initial_validators,
        validator_private_key.clone(),
        validator_public_key.clone(),
        validator_address.clone(),
    )?;
    let chain = Arc::new(Mutex::new(chain));

    let http_client = reqwest::Client::new();

    start_consensus(
        chain.clone(),
        validator_address.clone(),
        validator_private_key.clone(),
        validator_public_key.clone(),
        validator_peers.clone(),
        http_client.clone(),
        is_multi_validator,
    );

    // Spawn background agent scorer task
    let pg_pool_clone = pool.clone();
    let chain_clone = chain.clone();
    tokio::spawn(async move {
        agent_scorer::spawn_agent_scorer(pg_pool_clone, chain_clone).await;
    });

    // Derive a separate admin JWT key from the main secret with a domain separator
    let admin_jwt_secret = sha256_hex(format!("{}:admin", jwt_secret).as_bytes());
    let state = AppState {
        chain,
        pg_pool: pool,
        sqlite_state,
        http_client,
        portal_base_url,
        auth_failures: Arc::new(Mutex::new(HashMap::new())),
        confirm_ip_attempts: Arc::new(Mutex::new(HashMap::new())),
        jwt_key: HS256Key::from_bytes(jwt_secret.as_bytes()),
        admin_jwt_key: HS256Key::from_bytes(admin_jwt_secret.as_bytes()),
        encryption_key,
        system_private_key,
        validator_address,
        validator_private_key,
        validator_public_key,
        sse_broadcasters: Arc::new(std::sync::RwLock::new(HashMap::new())),
        env: app_env.clone(),
        payment_session_minutes,
        validator_peers,
        is_multi_validator,
        cookie_domain: std::env::var("COOKIE_DOMAIN")
            .unwrap_or_else(|_| ".nexapay.space".to_string()),
    };

    let portal_url =
        std::env::var("NEXAPAY_PORTAL_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let is_dev = app_env == "development" || app_env == "dev" || app_env == "sandbox";
    let mut allowed_origins: Vec<axum::http::HeaderValue> = vec![portal_url.parse().unwrap()];
    if is_dev {
        allowed_origins.push("http://localhost:3000".parse().unwrap());
        allowed_origins.push("http://localhost:3001".parse().unwrap());
        allowed_origins.push("http://127.0.0.1:3000".parse().unwrap());
        allowed_origins.push("http://127.0.0.1:3001".parse().unwrap());
    } else {
        allowed_origins.push("https://nexapay.space".parse().unwrap());
        allowed_origins.push("https://www.nexapay.space".parse().unwrap());
        allowed_origins.push("https://sandbox.nexapay.space".parse().unwrap());
        allowed_origins.push("https://auth.nexapay.space".parse().unwrap());
        allowed_origins.push("https://backend.nexapay.space".parse().unwrap());
    }

    // In multi-validator mode, also allow peer origins for P2P
    if is_multi_validator {
        for peer_url in &state.validator_peers {
            if let Ok(origin) = peer_url.parse() {
                allowed_origins.push(origin);
            }
        }
    }

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers([
            http::header::CONTENT_TYPE,
            http::header::AUTHORIZATION,
            http::header::HeaderName::from_static("x-account-token"),
            http::header::HeaderName::from_static("x-api-key"),
            http::header::HeaderName::from_static("x-admin-token"),
            http::header::HeaderName::from_static("x-idempotency-key"),
        ])
        .allow_credentials(true);

    let app = build_router(state)
        .layer(axum::middleware::from_fn(crate::api::middleware::request_id_middleware))
        .layer(DefaultBodyLimit::max(16 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;

    println!("NexaPay node listening on 0.0.0.0:{port} (multi-validator: {is_multi_validator})");
    axum::serve(listener, app).await?;

    Ok(())
}
