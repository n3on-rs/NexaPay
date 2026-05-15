-- Tables referenced by fund, withdraw, agent, admin, and agent_scorer (were missing from versioned migrations).

CREATE TABLE IF NOT EXISTS funding_transactions (
    id VARCHAR(64) PRIMARY KEY,
    to_address VARCHAR(64) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    fee DOUBLE PRECISION NOT NULL,
    card_last4 VARCHAR(8),
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_withdrawals (
    id UUID PRIMARY KEY,
    from_address VARCHAR(64) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    fee DOUBLE PRECISION NOT NULL,
    rib VARCHAR(64) NOT NULL,
    account_holder_name TEXT,
    rib_document_path TEXT,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS agent_applications (
    id UUID PRIMARY KEY,
    user_address VARCHAR(64) NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT,
    tax_registration_number TEXT,
    tax_document_path TEXT,
    business_address TEXT,
    business_governorate TEXT,
    business_description TEXT,
    expected_monthly_volume DOUBLE PRECISION DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    risk_score DOUBLE PRECISION DEFAULT 0,
    score_breakdown JSONB,
    reviewer_notes TEXT,
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_applications_user ON agent_applications (user_address);
CREATE INDEX IF NOT EXISTS idx_agent_applications_status ON agent_applications (status);

CREATE TABLE IF NOT EXISTS agent_profiles (
    user_address VARCHAR(64) PRIMARY KEY,
    application_id UUID NOT NULL,
    business_name TEXT,
    business_type TEXT,
    tax_registration_number TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    monthly_volume_limit DOUBLE PRECISION DEFAULT 0,
    approved_at TIMESTAMPTZ
);
