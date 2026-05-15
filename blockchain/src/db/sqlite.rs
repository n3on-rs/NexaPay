use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection};
use thiserror::Error;

use crate::account::AccountType;
use crate::block::{Transaction, TxType};

#[derive(Debug, Error)]
pub enum SqliteStateError {
    #[error("sqlite error")]
    Sqlite(#[from] rusqlite::Error),
    #[error("sqlite mutex poisoned")]
    Poisoned,
}

#[derive(Clone)]
pub struct SqliteState {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone)]
pub struct ChainAccountSnapshot {
    pub address: String,
    pub balance: u64,
    pub tx_count: u64,
    pub account_type: AccountType,
    pub is_active: bool,
    pub updated_at: u64,
}

impl SqliteState {
    pub fn open(path: &str) -> Result<Self, SqliteStateError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS chain_accounts (
                address TEXT PRIMARY KEY,
                balance INTEGER NOT NULL,
                tx_count INTEGER NOT NULL,
                account_type TEXT NOT NULL,
                is_active INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS card_refs (
                address TEXT PRIMARY KEY,
                card_last4 TEXT NOT NULL,
                expiry_month TEXT NOT NULL,
                expiry_year TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS loan_snapshots (
                loan_id TEXT PRIMARY KEY,
                borrower_address TEXT NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT NOT NULL,
                due_date TEXT NOT NULL,
                contract_hash TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tx_snapshots (
                tx_hash TEXT PRIMARY KEY,
                tx_id TEXT NOT NULL,
                tx_type TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT NOT NULL,
                amount INTEGER NOT NULL,
                fee INTEGER NOT NULL,
                ts INTEGER NOT NULL,
                block_index INTEGER NOT NULL
            );
            ",
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn upsert_account(
        &self,
        address: &str,
        balance: u64,
        tx_count: u64,
        account_type: &AccountType,
        is_active: bool,
        updated_at: u64,
    ) -> Result<(), SqliteStateError> {
        let account_type = match account_type {
            AccountType::User => "User",
            AccountType::Bank => "Bank",
            AccountType::Developer => "Developer",
        };

        let conn = self.conn.lock().map_err(|_| SqliteStateError::Poisoned)?;
        conn.execute(
            "
            INSERT INTO chain_accounts (address, balance, tx_count, account_type, is_active, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(address) DO UPDATE SET
              balance = excluded.balance,
              tx_count = excluded.tx_count,
              account_type = excluded.account_type,
              is_active = excluded.is_active,
              updated_at = excluded.updated_at
            ",
            params![
                address,
                balance as i64,
                tx_count as i64,
                account_type,
                if is_active { 1i64 } else { 0i64 },
                updated_at as i64
            ],
        )?;

        Ok(())
    }

    pub fn get_account_snapshot(
        &self,
        address: &str,
    ) -> Result<Option<ChainAccountSnapshot>, SqliteStateError> {
        let conn = self.conn.lock().map_err(|_| SqliteStateError::Poisoned)?;
        let mut stmt = conn.prepare(
            "
            SELECT address, balance, tx_count, account_type, is_active, updated_at
            FROM chain_accounts
            WHERE address = ?1
            LIMIT 1
            ",
        )?;

        let mut rows = stmt.query(params![address])?;
        let Some(row) = rows.next()? else {
            return Ok(None);
        };

        let account_type = match row.get::<_, String>(3)?.as_str() {
            "Bank" => AccountType::Bank,
            "Developer" => AccountType::Developer,
            _ => AccountType::User,
        };

        Ok(Some(ChainAccountSnapshot {
            address: row.get::<_, String>(0)?,
            balance: row.get::<_, i64>(1)?.max(0) as u64,
            tx_count: row.get::<_, i64>(2)?.max(0) as u64,
            account_type,
            is_active: row.get::<_, i64>(4)? != 0,
            updated_at: row.get::<_, i64>(5)?.max(0) as u64,
        }))
    }

    pub fn upsert_card_ref(
        &self,
        address: &str,
        card_last4: &str,
        expiry_month: &str,
        expiry_year: &str,
        updated_at: u64,
    ) -> Result<(), SqliteStateError> {
        let conn = self.conn.lock().map_err(|_| SqliteStateError::Poisoned)?;
        conn.execute(
            "
            INSERT INTO card_refs (address, card_last4, expiry_month, expiry_year, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(address) DO UPDATE SET
              card_last4 = excluded.card_last4,
              expiry_month = excluded.expiry_month,
              expiry_year = excluded.expiry_year,
              updated_at = excluded.updated_at
            ",
            params![
                address,
                card_last4,
                expiry_month,
                expiry_year,
                updated_at as i64
            ],
        )?;

        Ok(())
    }

    pub fn upsert_loan_snapshot(
        &self,
        loan_id: &str,
        borrower_address: &str,
        amount: u64,
        status: &str,
        due_date: &str,
        contract_hash: &str,
        updated_at: u64,
    ) -> Result<(), SqliteStateError> {
        let conn = self.conn.lock().map_err(|_| SqliteStateError::Poisoned)?;
        conn.execute(
            "
            INSERT INTO loan_snapshots (loan_id, borrower_address, amount, status, due_date, contract_hash, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(loan_id) DO UPDATE SET
              borrower_address = excluded.borrower_address,
              amount = excluded.amount,
              status = excluded.status,
              due_date = excluded.due_date,
              contract_hash = excluded.contract_hash,
              updated_at = excluded.updated_at
            ",
            params![
                loan_id,
                borrower_address,
                amount as i64,
                status,
                due_date,
                contract_hash,
                updated_at as i64
            ],
        )?;

        Ok(())
    }

    pub fn record_transaction(
        &self,
        tx: &Transaction,
        block_index: u64,
    ) -> Result<(), SqliteStateError> {
        let tx_type = match tx.tx_type {
            TxType::Transfer => "Transfer",
            TxType::AccountCreate => "AccountCreate",
            TxType::LoanDisburse => "LoanDisburse",
            TxType::LoanRepay => "LoanRepay",
            TxType::BankJoin => "BankJoin",
            TxType::DevRegister => "DevRegister",
            TxType::AgentApply => "AgentApply",
        };

        let conn = self.conn.lock().map_err(|_| SqliteStateError::Poisoned)?;
        conn.execute(
            "
            INSERT OR REPLACE INTO tx_snapshots
            (tx_hash, tx_id, tx_type, from_address, to_address, amount, fee, ts, block_index)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ",
            params![
                tx.hash,
                tx.id,
                tx_type,
                tx.from,
                tx.to,
                tx.amount as i64,
                tx.fee as i64,
                tx.timestamp as i64,
                block_index as i64
            ],
        )?;

        Ok(())
    }
}
