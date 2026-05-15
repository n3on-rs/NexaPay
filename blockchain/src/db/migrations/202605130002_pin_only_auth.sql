-- PIN-only authentication migration
-- Drops password columns, adds login OTPs and PIN lockout tracking

-- 1. Remove password from users
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- 2. Remove password from kyc_sessions
ALTER TABLE kyc_sessions DROP COLUMN IF EXISTS password_hash;

-- 3. Recreate login_otps table for 2-step PIN+OTP login
-- (old table from 202605130001_password_recovery.sql had phone/cin columns instead of user_address)
DROP TABLE IF EXISTS login_otps;
CREATE TABLE login_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOL NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otps_user_address ON login_otps(user_address);
CREATE INDEX IF NOT EXISTS idx_login_otps_created_at ON login_otps(created_at);

-- 4. Add PIN attempt tracking to cards (shared between login and transactions)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pin_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cards_pin_locked_until ON cards(pin_locked_until);
