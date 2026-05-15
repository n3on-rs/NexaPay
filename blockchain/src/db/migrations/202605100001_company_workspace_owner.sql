ALTER TABLE users
ADD COLUMN IF NOT EXISTS settlement_account_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS settlement_bank_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS settlement_rib VARCHAR(32),
ADD COLUMN IF NOT EXISTS settlement_iban VARCHAR(64),
ADD COLUMN IF NOT EXISTS settlement_bic VARCHAR(16);

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS owner_user_address VARCHAR(64),
ADD COLUMN IF NOT EXISTS owner_user_cin VARCHAR(32),
ADD COLUMN IF NOT EXISTS settlement_account_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS settlement_bank_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS settlement_rib VARCHAR(32),
ADD COLUMN IF NOT EXISTS settlement_iban VARCHAR(64),
ADD COLUMN IF NOT EXISTS settlement_bic VARCHAR(16),
ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(24) DEFAULT 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_owner_user_address_unique
ON developers (owner_user_address)
WHERE owner_user_address IS NOT NULL;
