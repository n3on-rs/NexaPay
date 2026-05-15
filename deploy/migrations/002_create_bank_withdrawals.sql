-- Migration N+2: bank_withdrawals
CREATE TABLE IF NOT EXISTS bank_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  amount DECIMAL(18,3) NOT NULL,
  fee DECIMAL(18,3) NOT NULL,
  rib TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  rib_document_path TEXT NOT NULL,
  blockchain_tx_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_address ON bank_withdrawals(from_address);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON bank_withdrawals(status);
