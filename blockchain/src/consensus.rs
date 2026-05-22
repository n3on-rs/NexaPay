use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{interval, timeout};

use crate::block::{Block, ValidatorSignature};
use crate::chain::Blockchain;

/// Consensus state: what phase the node is in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConsensusPhase {
    Idle,
    Proposing,
    Voting,
    Committed,
}

/// Payload sent to peers when proposing a block.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockProposal {
    pub block: Block,
    pub proposer_address: String,
    pub round: u64,
}

/// A peer's vote (signature) on a block proposal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockVote {
    pub block_hash: String,
    pub signature: ValidatorSignature,
    pub round: u64,
}

/// A committed block broadcast to all peers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockCommit {
    pub block: Block,
    pub signatures: Vec<ValidatorSignature>,
    pub round: u64,
}

/// Start the multi-validator consensus engine.
///
/// In multi-validator mode (validators > 1):
/// - Every 5 seconds, the round leader proposes a block.
/// - The proposal is broadcast to all peer validators.
/// - Peers validate and sign the proposal, returning their signature.
/// - The leader collects signatures; when quorum is reached, the block is committed.
/// - The committed block is broadcast to all peers.
///
/// In single-validator mode (validators <= 1):
/// - Falls back to legacy mining every 5 seconds.
pub fn start_consensus(
    chain: Arc<Mutex<Blockchain>>,
    validator_address: String,
    validator_private_key: String,
    validator_public_key: String,
    peers: Vec<String>,
    http_client: Client,
    is_multi_validator: bool,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut round: u64 = 0;
        let mut ticker = interval(Duration::from_secs(5));
        let vote_timeout = Duration::from_secs(4); // Wait 4s for votes (1s buffer before next tick)

        loop {
            ticker.tick().await;
            round += 1;

            if !is_multi_validator {
                // ─── Single-validator mode ───
                let mut guard = chain.lock().await;
                let _ = guard.mine_block(
                    &validator_address,
                    &validator_private_key,
                    &validator_public_key,
                );
                continue;
            }

            // ─── Multi-validator mode ───
            let is_leader = {
                let guard = chain.lock().await;
                guard.is_my_turn_to_propose()
            };

            if is_leader {
                run_leader_round(
                    &chain,
                    &http_client,
                    &peers,
                    &validator_address,
                    &validator_private_key,
                    round,
                    vote_timeout,
                )
                .await;
            }
            // Non-leaders don't initiate; they wait for proposals via HTTP endpoints
        }
    })
}

/// Leader: propose a block, broadcast to peers, collect votes, commit.
async fn run_leader_round(
    chain: &Arc<Mutex<Blockchain>>,
    http_client: &Client,
    peers: &[String],
    my_address: &str,
    my_private_key: &str,
    round: u64,
    vote_timeout: Duration,
) {
    // 1. Propose a block
    let proposal = {
        let mut guard = chain.lock().await;
        match guard.propose_block(round) {
            Ok(block) => block,
            Err(e) => {
                tracing::warn!("[consensus] Failed to propose block at round {round}: {e}");
                return;
            }
        }
    };

    let block_hash = proposal.hash.clone();
    tracing::info!(
        "[consensus] Proposed block #{} (hash: {}) at round {round}",
        proposal.index,
        &block_hash[..16]
    );

    // 2. Broadcast proposal to all peers
    let proposal_payload = BlockProposal {
        block: proposal.clone(),
        proposer_address: my_address.to_string(),
        round,
    };

    let mut all_signatures: Vec<ValidatorSignature> = proposal.signatures.clone();

    let mut vote_futures = Vec::new();
    for peer_url in peers {
        let url = format!("{}/consensus/propose", peer_url);
        let payload = serde_json::json!(&proposal_payload);
        let client = http_client.clone();

        vote_futures.push(tokio::spawn(async move {
            match timeout(vote_timeout, client.post(&url).json(&payload).send()).await {
                Ok(Ok(resp)) => {
                    if resp.status().is_success() {
                        match resp.json::<BlockVote>().await {
                            Ok(vote) => Some(vote.signature),
                            Err(e) => {
                                tracing::warn!("[consensus] Failed to parse vote: {e}");
                                None
                            }
                        }
                    } else {
                        tracing::warn!("[consensus] Peer returned status {}", resp.status());
                        None
                    }
                }
                Ok(Err(e)) => {
                    tracing::warn!("[consensus] Peer request failed: {e}");
                    None
                }
                Err(_) => {
                    tracing::warn!("[consensus] Peer vote timed out");
                    None
                }
            }
        }));
    }

    // 3. Collect votes
    for fut in vote_futures {
        if let Ok(Some(sig)) = fut.await {
            // Deduplicate
            if !all_signatures
                .iter()
                .any(|s| s.validator_address == sig.validator_address)
            {
                all_signatures.push(sig);
            }
        }
    }

    // 4. Check if quorum reached
    let quorum = {
        let guard = chain.lock().await;
        guard.quorum_size()
    };

    if all_signatures.len() >= quorum {
        tracing::info!(
            "[consensus] Quorum reached for block #{} ({}/{} signatures)",
            proposal.index,
            all_signatures.len(),
            quorum
        );

        // 5. Commit the block
        let committed = {
            let mut guard = chain.lock().await;
            match guard.commit_block(&proposal, &all_signatures) {
                Ok(block) => block,
                Err(e) => {
                    tracing::error!("[consensus] Failed to commit block: {e}");
                    return;
                }
            }
        };

        // 6. Broadcast commit to all peers
        let commit_payload = BlockCommit {
            block: committed,
            signatures: all_signatures.clone(),
            round,
        };

        for peer_url in peers {
            let url = format!("{}/consensus/commit", peer_url);
            let payload = serde_json::json!(&commit_payload);
            let client = http_client.clone();

            tokio::spawn(async move {
                let _ = timeout(
                    Duration::from_secs(3),
                    client.post(&url).json(&payload).send(),
                )
                .await;
            });
        }
    } else {
        tracing::warn!(
            "[consensus] Insufficient quorum for block #{} (need {quorum}, got {})",
            proposal.index,
            all_signatures.len()
        );
    }
}
