-- Migration N+4: funding_transactions
CREATE TABLE IF NOT EXISTS funding_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address TEXT NOT NULL,
  amount DECIMAL(18,3) NOT NULL,
  fee DECIMAL(18,3) NOT NULL,
  card_last4 TEXT NOT NULL,
  blockchain_tx_ids JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);
