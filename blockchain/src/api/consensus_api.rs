//! Consensus P2P API endpoints for multi-validator block proposal, voting, and commit.
//!
//! These endpoints are called between validator nodes (NOT exposed to end users).
//! In production, they should be on a separate internal port or authenticated
//! with a shared secret.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::api::AppState;
use crate::consensus::{BlockCommit, BlockProposal, BlockVote};
use crate::crypto::verify_signature;

fn api_error(sc: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (sc, Json(json!({"error": msg})))
}

/// POST /consensus/propose
///
/// Receive a block proposal from the round leader.
/// Validates the proposal, signs it with our validator key, and returns our signature.
pub async fn receive_proposal(
    State(state): State<AppState>,
    Json(proposal): Json<BlockProposal>,
) -> Result<Json<BlockVote>, (StatusCode, Json<Value>)> {
    let mut chain = state.chain.lock().await;

    // 1. Validate the proposal structurally
    if !chain.validate_block_proposal(&proposal.block) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid block proposal"));
    }

    // 2. Verify it's for the next expected block
    let next_index = chain.chain_height() + 1;
    if proposal.block.index != next_index {
        return Err(api_error(
            StatusCode::CONFLICT,
            &format!(
                "Expected block index {next_index}, got {}",
                proposal.block.index
            ),
        ));
    }

    // 3. Verify the proposer is the legitimate round leader
    let expected_leader = chain.leader_for_index(proposal.block.index);
    if expected_leader.as_deref() != Some(&proposal.proposer_address) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            &format!(
                "Expected leader {}, got {}",
                expected_leader.unwrap_or_default(),
                proposal.proposer_address
            ),
        ));
    }

    // 4. Sign the proposal with our validator key
    let signature = chain
        .sign_proposal(&proposal.block.hash)
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    // 5. Store the pending proposal locally
    chain.pending_proposals.insert(
        proposal.block.hash.clone(),
        (proposal.block.clone(), crate::chain::now_ts()),
    );

    // 6. Return our vote
    Ok(Json(BlockVote {
        block_hash: proposal.block.hash,
        signature,
        round: proposal.round,
    }))
}

/// POST /consensus/vote
///
/// Receive a vote (signature) from a peer validator on a block proposal.
/// The leader collects these votes to reach quorum.
pub async fn receive_vote(
    State(state): State<AppState>,
    Json(vote): Json<BlockVote>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let chain = state.chain.lock().await;

    // Verify the vote is for a pending proposal we know about
    let (_block, _ts) = chain
        .pending_proposals
        .get(&vote.block_hash)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Unknown block proposal"))?;

    // Verify the signature is from a known validator
    let pubkey = chain
        .validator_pubkeys
        .get(&vote.signature.validator_address)
        .ok_or_else(|| api_error(StatusCode::FORBIDDEN, "Unknown validator"))?;

    if !verify_signature(pubkey, &vote.block_hash, &vote.signature.signature) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid signature"));
    }

    Ok(Json(json!({
        "status": "accepted",
        "block_hash": vote.block_hash,
        "validator": vote.signature.validator_address,
    })))
}

/// POST /consensus/commit
///
/// Receive a committed block from the leader (with full quorum signatures).
/// Validates and appends it to our local chain.
pub async fn receive_commit(
    State(state): State<AppState>,
    Json(commit): Json<BlockCommit>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut chain = state.chain.lock().await;

    // Check if we already have this block
    if chain.blocks().iter().any(|b| b.hash == commit.block.hash) {
        return Ok(Json(json!({"status": "already_committed"})));
    }

    // Commit the block (this validates quorum internally)
    let committed = chain
        .commit_block(&commit.block, &commit.signatures)
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, &e.to_string()))?;

    // Apply block transactions to update local account state
    for tx in &committed.transactions {
        // Auto-create account for AccountCreate txs if needed
        if tx.tx_type == crate::block::TxType::AccountCreate
            && chain.get_account(&tx.to).is_none()
        {
            chain.create_account(crate::account::ChainAccount {
                address: tx.to.clone(),
                public_key: String::new(),
                balance: 0,
                tx_count: 0,
                account_type: crate::account::AccountType::User,
                created_at: crate::chain::now_ts(),
                is_active: true,
                kyc_hash: String::new(),
            });
        }
        let _ = chain.apply_transaction(tx);
    }

    // Update SQLite state for committed accounts
    for tx in &committed.transactions {
        let _ = state.sqlite_state.record_transaction(tx, committed.index);
    }
    if let Some(from_acc) = chain.get_account(&committed.proposer) {
        let _ = state.sqlite_state.upsert_account(
            &from_acc.address,
            from_acc.balance,
            from_acc.tx_count,
            &from_acc.account_type,
            from_acc.is_active,
            crate::chain::now_ts(),
        );
    }

    Ok(Json(json!({
        "status": "committed",
        "block_index": committed.index,
        "block_hash": committed.hash,
        "quorum": committed.quorum_signature_count(),
    })))
}

/// GET /consensus/validators
///
/// Returns the current validator set (for peer discovery).
pub async fn get_validators(State(state): State<AppState>) -> Json<Value> {
    let chain = state.chain.lock().await;
    let validators: Vec<Value> = chain
        .validators
        .values()
        .map(|v| {
            json!({
                "address": v.address,
                "public_key": v.public_key,
                "url": v.url,
                "is_active": v.is_active,
            })
        })
        .collect();

    Json(json!({
        "validators": validators,
        "total": validators.len(),
        "active": chain.active_validator_count(),
        "quorum_size": chain.quorum_size(),
        "my_address": chain.my_address,
    }))
}

/// POST /consensus/sync
///
/// Request chain sync from a peer (used when a node starts up).
/// Returns blocks after the given height.
pub async fn sync_blocks(State(state): State<AppState>, Json(payload): Json<Value>) -> Json<Value> {
    let from_height = payload
        .get("from_height")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let chain = state.chain.lock().await;
    let blocks: Vec<&crate::block::Block> = chain
        .blocks()
        .iter()
        .filter(|b| b.index > from_height)
        .collect();

    Json(json!({
        "blocks": blocks,
        "count": blocks.len(),
        "latest_height": chain.chain_height(),
    }))
}
