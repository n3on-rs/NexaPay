-- Security alerts, session tracking, transfer OTPs, and bank transfer support

-- 1. Active session tracking for concurrent-login detection and revocation
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    is_revoked BOOL NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_user_sessions_address ON user_sessions(user_address);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);

-- 2. Security alerts for "Is this you?" concurrent-login warnings
CREATE TABLE security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    alert_type TEXT NOT NULL, -- 'new_login', 'suspicious_activity'
    metadata JSONB,
    resolved BOOL NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_security_alerts_address ON security_alerts(user_address);

-- 3. Transfer OTPs (post-PIN security layer)
CREATE TABLE transfer_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    amount BIGINT,
    recipient_address TEXT,
    rib TEXT,
    beneficiary_name TEXT,
    memo TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOL NOT NULL DEFAULT FALSE,
    resend_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transfer_otps_address ON transfer_otps(user_address);
CREATE INDEX idx_transfer_otps_created_at ON transfer_otps(created_at);

-- 4. Bank transfer records (virements)
CREATE TABLE bank_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    rib TEXT NOT NULL,
    beneficiary_name TEXT NOT NULL,
    amount BIGINT NOT NULL,
    memo TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_bank_transfers_address ON bank_transfers(user_address);

-- 5. Force-PIN-change flag on users (set when user reports "Not me")
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_pin_change BOOL NOT NULL DEFAULT FALSE;

-- 6. Saved bank transfer beneficiaries for quick access
CREATE TABLE saved_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    rib TEXT NOT NULL,
    beneficiary_name TEXT NOT NULL,
    bank_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_address, rib)
);
CREATE INDEX idx_saved_beneficiaries_address ON saved_beneficiaries(user_address);

-- 7. Track failure reason for bank transfers
ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
