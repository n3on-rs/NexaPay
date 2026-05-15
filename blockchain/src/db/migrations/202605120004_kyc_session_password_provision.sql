ALTER TABLE kyc_sessions
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS provisioned_chain_address VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_kyc_sessions_provisioned ON kyc_sessions (provisioned_chain_address)
    WHERE provisioned_chain_address IS NOT NULL;
