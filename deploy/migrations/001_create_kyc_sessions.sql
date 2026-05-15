-- Migration N+1: kyc_sessions
CREATE TABLE IF NOT EXISTS kyc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  cin_number TEXT NOT NULL UNIQUE,
  cin_expiry DATE NOT NULL,
  date_of_birth DATE NOT NULL,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_PHONE_VERIFY',
  documents JSONB,
  liveness_result JSONB,
  kyc_hash TEXT,
  liveness_retries INT DEFAULT 0,
  liveness_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_cin ON kyc_sessions(cin_number);
CREATE INDEX IF NOT EXISTS idx_kyc_phone ON kyc_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_sessions(status);
