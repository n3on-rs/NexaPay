-- NexaPay Admin Panel
-- Migration: 2026-05-22
--
-- Super-secure admin authentication with Argon2id-hashed passwords + OTP 2FA.

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,       -- Argon2id
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(32) NOT NULL DEFAULT 'admin', -- 'admin' | 'superadmin' | 'auditor'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    otp_secret VARCHAR(64),                    -- TOTP secret (future)
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin login OTPs (2FA)
CREATE TABLE IF NOT EXISTS admin_login_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    otp_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_admin ON admin_login_otps(admin_id, created_at DESC);

-- Admin action audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id),
    admin_username VARCHAR(64),
    action VARCHAR(64) NOT NULL,               -- 'user_freeze', 'user_view', 'login', etc.
    resource_type VARCHAR(32),                  -- 'user', 'transaction', 'withdrawal'
    resource_id VARCHAR(128),
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action);

-- User freeze records (legal compliance)
CREATE TABLE IF NOT EXISTS user_freeze_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(64) NOT NULL,
    admin_id UUID REFERENCES admin_users(id),
    reason TEXT NOT NULL,
    legal_basis VARCHAR(64),                   -- 'suspicious_activity', 'court_order', 'compliance', 'user_request'
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unfrozen_at TIMESTAMPTZ,
    unfrozen_by UUID REFERENCES admin_users(id),
    unfreeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freeze_user ON user_freeze_records(user_address, frozen_at DESC);
