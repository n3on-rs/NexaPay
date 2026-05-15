use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use thiserror::Error;

use crate::account::{AccountType, ChainAccount};
use crate::block::{Block, Transaction, TxType};
use crate::crypto::{sha256_hex, sign_hex, verify_signature};
use crate::storage::{BlockStorage, StorageError};

#[derive(Debug, Error)]
pub enum ChainError {
    #[error("storage error")]
    Storage(#[from] StorageError),
    #[error("insufficient balance")]
    InsufficientBalance,
    #[error("account not found")]
    AccountNotFound,
    #[error("invalid signature")]
    InvalidSignature,
    #[error("invalid block")]
    InvalidBlock,
    #[error("crypto error")]
    Crypto,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChainStats {
    pub chain_height: u64,
    pub total_transactions: usize,
    pub total_accounts: usize,
    pub network_status: String,
}

pub struct Blockchain {
    blocks: Vec<Block>,
    pub accounts: HashMap<String, ChainAccount>,
    pub pending_transactions: Vec<Transaction>,
    storage: BlockStorage,
}

impl Blockchain {
    pub fn new(storage: BlockStorage) -> Result<Self, ChainError> {
        let mut chain = Self {
            blocks: Vec::new(),
            accounts: HashMap::new(),
            pending_transactions: Vec::new(),
            storage,
        };

        let existing = chain.storage.all_blocks()?;
        if existing.is_empty() {
            let genesis = Block {
                index: 0,
                timestamp: now_ts(),
                previous_hash: "0".to_string(),
                hash: sha256_hex(b"NEXAPAY_GENESIS"),
                validator: "GENESIS".to_string(),
                signature: String::new(),
                transactions: Vec::new(),
                state_root: sha256_hex(b"{}"),
            };
            chain.storage.append_block(&genesis)?;
            chain.blocks.push(genesis);
        } else {
            chain.blocks = existing;
            chain.rebuild_state_from_blocks();
        }

        Ok(chain)
    }

    pub fn blocks(&self) -> &[Block] {
        &self.blocks
    }

    pub fn chain_height(&self) -> u64 {
        self.blocks.last().map(|b| b.index).unwrap_or(0)
    }

    pub fn find_transaction(&self, tx_hash: &str) -> Option<(u64, Transaction)> {
        self.blocks
            .iter()
            .flat_map(|b| b.transactions.iter().map(move |tx| (b.index, tx)))
            .find(|(_, tx)| tx.hash == tx_hash)
            .map(|(idx, tx)| (idx, tx.clone()))
    }

    pub fn total_tx_count(&self) -> usize {
        self.blocks.iter().map(|b| b.transactions.len()).sum()
    }

    pub fn get_stats(&self) -> ChainStats {
        ChainStats {
            chain_height: self.chain_height(),
            total_transactions: self.total_tx_count(),
            total_accounts: self.accounts.len(),
            network_status: "healthy".to_string(),
        }
    }

    pub fn create_account(&mut self, account: ChainAccount) {
        self.accounts.insert(account.address.clone(), account);
    }

    pub fn get_account(&self, address: &str) -> Option<&ChainAccount> {
        self.accounts.get(address)
    }

    pub fn add_pending_transaction(&mut self, mut tx: Transaction) {
        if tx.hash.is_empty() {
            tx.hash = self.compute_tx_hash(&tx);
        }
        self.pending_transactions.push(tx);
    }

    pub fn mine_block(
        &mut self,
        validator_address: &str,
        validator_private_key: &str,
        validator_public_key: &str,
    ) -> Result<Block, ChainError> {
        let previous_hash = self
            .blocks
            .last()
            .map(|b| b.hash.clone())
            .unwrap_or_else(|| "0".to_string());

        let mut applied = Vec::new();
        let pending = std::mem::take(&mut self.pending_transactions);
        for tx in pending {
            if self.apply_transaction(&tx).is_ok() {
                applied.push(tx);
            }
        }

        let state_root = self.compute_state_root();
        let timestamp = now_ts();
        let index = self.blocks.len() as u64;
        let hash_payload = serde_json::json!({
            "index": index,
            "timestamp": timestamp,
            "previous_hash": previous_hash,
            "validator": validator_address,
            "transactions": applied.iter().map(|t| t.hash.clone()).collect::<Vec<_>>(),
            "state_root": state_root,
        });
        let block_hash = sha256_hex(hash_payload.to_string().as_bytes());
        let signature = sign_hex(validator_private_key, &block_hash).map_err(|_| ChainError::Crypto)?;

        let block = Block {
            index,
            timestamp,
            previous_hash,
            hash: block_hash,
            validator: validator_address.to_string(),
            signature,
            transactions: applied,
            state_root,
        };

        if !self.validate_block(&block, validator_public_key) {
            return Err(ChainError::InvalidBlock);
        }

        self.storage.append_block(&block)?;
        self.blocks.push(block.clone());
        Ok(block)
    }

    pub fn validate_block(&self, block: &Block, validator_public_key: &str) -> bool {
        let expected_prev = self
            .blocks
            .last()
            .map(|b| b.hash.as_str())
            .unwrap_or("0");
        if block.previous_hash != expected_prev {
            return false;
        }

        let hash_payload = serde_json::json!({
            "index": block.index,
            "timestamp": block.timestamp,
            "previous_hash": block.previous_hash,
            "validator": block.validator,
            "transactions": block.transactions.iter().map(|t| t.hash.clone()).collect::<Vec<_>>(),
            "state_root": block.state_root,
        });

        let recomputed_hash = sha256_hex(hash_payload.to_string().as_bytes());
        if recomputed_hash != block.hash {
            return false;
        }

        verify_signature(validator_public_key, &block.hash, &block.signature)
    }

    pub fn paginated_blocks(&self, page: usize, limit: usize) -> Result<Vec<Block>, ChainError> {
        self.storage
            .paginated_blocks(page, limit)
            .map_err(ChainError::Storage)
    }

    fn compute_tx_hash(&self, tx: &Transaction) -> String {
        let payload = serde_json::json!({
            "id": tx.id,
            "tx_type": format!("{:?}", tx.tx_type),
            "from": tx.from,
            "to": tx.to,
            "amount": tx.amount,
            "fee": tx.fee,
            "timestamp": tx.timestamp,
            "memo": tx.memo,
        });
        sha256_hex(payload.to_string().as_bytes())
    }

    fn compute_state_root(&self) -> String {
        let mut accounts = self.accounts.values().cloned().collect::<Vec<_>>();
        accounts.sort_by(|a, b| a.address.cmp(&b.address));
        sha256_hex(serde_json::to_string(&accounts).unwrap_or_default().as_bytes())
    }

    fn apply_transaction(&mut self, tx: &Transaction) -> Result<(), ChainError> {
        match tx.tx_type {
            TxType::AccountCreate => {
                if let Some(account) = self.accounts.get_mut(&tx.to) {
                    account.balance = account.balance.saturating_add(tx.amount);
                    account.tx_count = account.tx_count.saturating_add(1);
                    Ok(())
                } else {
                    Err(ChainError::AccountNotFound)
                }
            }
            TxType::Transfer | TxType::LoanRepay => {
                if tx.from != "SYSTEM" {
                    let from_acc = self
                        .accounts
                        .get_mut(&tx.from)
                        .ok_or(ChainError::AccountNotFound)?;
                    let total = tx.amount.saturating_add(tx.fee);
                    if from_acc.balance < total {
                        return Err(ChainError::InsufficientBalance);
                    }
                    from_acc.balance -= total;
                    from_acc.tx_count = from_acc.tx_count.saturating_add(1);
                }

                let to_acc = self
                    .accounts
                    .get_mut(&tx.to)
                    .ok_or(ChainError::AccountNotFound)?;
                to_acc.balance = to_acc.balance.saturating_add(tx.amount);
                to_acc.tx_count = to_acc.tx_count.saturating_add(1);
                Ok(())
            }
            TxType::LoanDisburse => {
                let to_acc = self
                    .accounts
                    .get_mut(&tx.to)
                    .ok_or(ChainError::AccountNotFound)?;
                to_acc.balance = to_acc.balance.saturating_add(tx.amount);
                to_acc.tx_count = to_acc.tx_count.saturating_add(1);
                Ok(())
            }
            TxType::BankJoin => {
                let account = self
                    .accounts
                    .entry(tx.to.clone())
                    .or_insert(ChainAccount {
                        address: tx.to.clone(),
                        public_key: String::new(),
                        balance: 0,
                        tx_count: 0,
                        account_type: AccountType::Bank,
                        created_at: now_ts(),
                        is_active: true,
                        kyc_hash: String::new(),
                    });
                account.tx_count = account.tx_count.saturating_add(1);
                Ok(())
            }
            TxType::AgentApply => {
                // AgentApply is an audit-only transaction recorded when an
                // application is approved. No change to balances; increment
                // tx_count on the account if it exists, otherwise create a
                // minimal Bank account entry so the audit is captured.
                let account = self
                    .accounts
                    .entry(tx.to.clone())
                    .or_insert(ChainAccount {
                        address: tx.to.clone(),
                        public_key: String::new(),
                        balance: 0,
                        tx_count: 0,
                        account_type: AccountType::Bank,
                        created_at: now_ts(),
                        is_active: true,
                        kyc_hash: String::new(),
                    });
                account.tx_count = account.tx_count.saturating_add(1);
                Ok(())
            }
            TxType::DevRegister => {
                let account = self
                    .accounts
                    .entry(tx.to.clone())
                    .or_insert(ChainAccount {
                        address: tx.to.clone(),
                        public_key: String::new(),
                        balance: 0,
                        tx_count: 0,
                        account_type: AccountType::Developer,
                        created_at: now_ts(),
                        is_active: true,
                        kyc_hash: String::new(),
                    });
                account.tx_count = account.tx_count.saturating_add(1);
                Ok(())
            }
        }
    }

    fn rebuild_state_from_blocks(&mut self) {
        for block in &self.blocks {
            for tx in &block.transactions {
                match tx.tx_type {
                    TxType::Transfer | TxType::LoanRepay => {
                        if tx.from != "SYSTEM" {
                            let from_entry = self.accounts.entry(tx.from.clone()).or_insert(ChainAccount {
                                address: tx.from.clone(),
                                public_key: String::new(),
                                balance: 0,
                                tx_count: 0,
                                account_type: AccountType::User,
                                created_at: now_ts(),
                                is_active: true,
                                kyc_hash: String::new(),
                            });
                            from_entry.balance =
                                from_entry.balance.saturating_sub(tx.amount.saturating_add(tx.fee));
                            from_entry.tx_count = from_entry.tx_count.saturating_add(1);
                        }
                        let to_entry = self.accounts.entry(tx.to.clone()).or_insert(ChainAccount {
                            address: tx.to.clone(),
                            public_key: String::new(),
                            balance: 0,
                            tx_count: 0,
                            account_type: AccountType::User,
                            created_at: now_ts(),
                            is_active: true,
                            kyc_hash: String::new(),
                        });
                        to_entry.balance = to_entry.balance.saturating_add(tx.amount);
                        to_entry.tx_count = to_entry.tx_count.saturating_add(1);
                    }
                    TxType::LoanDisburse | TxType::AccountCreate => {
                        // Ensure account exists when replaying blocks. Previously
                        // replay only updated existing accounts which left the
                        // in-memory `accounts` map empty after restart. Create a
                        // default account entry when missing so state rebuild is
                        // consistent with the behavior of `apply_transaction`.
                        let entry = self.accounts.entry(tx.to.clone()).or_insert(ChainAccount {
                            address: tx.to.clone(),
                            public_key: String::new(),
                            balance: 0,
                            tx_count: 0,
                            account_type: AccountType::User,
                            created_at: now_ts(),
                            is_active: true,
                            kyc_hash: String::new(),
                        });
                        entry.balance = entry.balance.saturating_add(tx.amount);
                        entry.tx_count = entry.tx_count.saturating_add(1);
                    }
                    TxType::BankJoin => {
                        self.accounts.entry(tx.to.clone()).or_insert(ChainAccount {
                            address: tx.to.clone(),
                            public_key: String::new(),
                            balance: 0,
                            tx_count: 1,
                            account_type: AccountType::Bank,
                            created_at: now_ts(),
                            is_active: true,
                            kyc_hash: String::new(),
                        });
                    }
                    TxType::AgentApply => {
                        self.accounts.entry(tx.to.clone()).or_insert(ChainAccount {
                            address: tx.to.clone(),
                            public_key: String::new(),
                            balance: 0,
                            tx_count: 1,
                            account_type: AccountType::Bank,
                            created_at: now_ts(),
                            is_active: true,
                            kyc_hash: String::new(),
                        });
                    }
                    TxType::DevRegister => {
                        self.accounts.entry(tx.to.clone()).or_insert(ChainAccount {
                            address: tx.to.clone(),
                            public_key: String::new(),
                            balance: 0,
                            tx_count: 1,
                            account_type: AccountType::Developer,
                            created_at: now_ts(),
                            is_active: true,
                            kyc_hash: String::new(),
                        });
                    }
                }
            }
        }
    }
}

pub fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use crate::crypto;
    use crate::storage::BlockStorage;

    use super::*;

    #[test]
    fn test_chain_mines_blocks() {
        let db_path = format!("/tmp/nexapay-chain-test-{}", uuid::Uuid::new_v4());
        let storage = BlockStorage::open(&db_path).expect("storage should open");
        let mut chain = Blockchain::new(storage).expect("chain should initialize");

        let (validator_sk, validator_pk) = crypto::generate_keypair();
        let validator_address = crypto::address_from_public_key(&validator_pk);

        chain.create_account(ChainAccount {
            address: "NXPabc".to_string(),
            public_key: String::new(),
            balance: 1_000,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: String::new(),
        });
        chain.create_account(ChainAccount {
            address: "NXPdef".to_string(),
            public_key: String::new(),
            balance: 0,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: String::new(),
        });

        chain.add_pending_transaction(Transaction {
            id: uuid::Uuid::new_v4().to_string(),
            tx_type: TxType::Transfer,
            from: "NXPabc".to_string(),
            to: "NXPdef".to_string(),
            amount: 100,
            fee: 0,
            timestamp: now_ts(),
            signature: String::new(),
            memo: "test".to_string(),
            hash: String::new(),
        });

        let block = chain
            .mine_block(&validator_address, &validator_sk, &validator_pk)
            .expect("mining should succeed");
        assert_eq!(block.index, 1);
        assert!(chain.chain_height() >= 1);
    }
}
