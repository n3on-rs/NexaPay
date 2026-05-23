use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TxType {
    Transfer,
    AccountCreate,
    LoanDisburse,
    LoanRepay,
    BankJoin,
    AgentApply,
    DevRegister,
    EsignAccount,
    EsignTransfer,
    InvoiceAnchor,
    ValidatorJoin,
    ValidatorLeave,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub tx_type: TxType,
    pub from: String,
    pub to: String,
    pub amount: u64,
    pub fee: u64,
    pub timestamp: u64,
    pub signature: String,
    pub memo: String,
    pub hash: String,
}

/// A single validator's signature over a block hash.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorSignature {
    #[serde(default)]
    pub validator_address: String,
    #[serde(default)]
    pub validator_public_key: String,
    pub signature: String,
}

/// Information about a validator in the network.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorInfo {
    pub address: String,
    pub public_key: String,
    #[serde(default)]
    pub url: String, // HTTP endpoint for P2P communication
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub joined_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub index: u64,
    pub timestamp: u64,
    #[serde(default)]
    pub round: u64,
    pub previous_hash: String,
    pub hash: String,
    /// Address of the validator that proposed this block (legacy field).
    #[serde(default)]
    pub validator: String,
    /// Legacy single-signature field (kept for backward compatibility).
    #[serde(default)]
    pub signature: String,
    /// Multi-signature support: list of validator signatures on this block.
    #[serde(default)]
    pub signatures: Vec<ValidatorSignature>,
    /// Address of the proposer (round leader).
    #[serde(default)]
    pub proposer: String,
    pub transactions: Vec<Transaction>,
    pub state_root: String,
}

impl Block {
    /// Count distinct validators who signed this block.
    pub fn quorum_signature_count(&self) -> usize {
        if !self.signatures.is_empty() {
            let mut seen = std::collections::HashSet::new();
            for sig in &self.signatures {
                seen.insert(&sig.validator_address);
            }
            return seen.len();
        }
        // Legacy: single signature counts as 1
        if !self.signature.is_empty() && !self.validator.is_empty() {
            return 1;
        }
        0
    }

    /// Check if a specific validator has signed this block.
    #[allow(dead_code)]
    pub fn has_signature_from(&self, validator_address: &str) -> bool {
        if !self.signatures.is_empty() {
            return self
                .signatures
                .iter()
                .any(|s| s.validator_address == validator_address);
        }
        // Legacy check
        !self.signature.is_empty() && self.validator == validator_address
    }

    /// Check if a proposed block is valid and ready for the proposer's own signature.
    #[allow(dead_code)]
    pub fn is_proposal_valid(&self) -> bool {
        !self.hash.is_empty()
            && self.index > 0
            && !self.proposer.is_empty()
            && !self.previous_hash.is_empty()
    }
}
