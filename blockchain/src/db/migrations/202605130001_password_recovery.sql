-- Recovery tokens for password reset flow
CREATE TABLE IF NOT EXISTS recovery_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOL NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user ON recovery_tokens(user_address);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_hash ON recovery_tokens(token_hash);

-- OTP storage for password recovery (separate from login OTPs in users table)
CREATE TABLE IF NOT EXISTS login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  cin TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOL NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otps_phone ON login_otps(phone);
CREATE INDEX IF NOT EXISTS idx_login_otps_created_at ON login_otps(created_at);
