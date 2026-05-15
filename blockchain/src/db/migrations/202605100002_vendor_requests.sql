CREATE TABLE IF NOT EXISTS vendor_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_address VARCHAR(64) UNIQUE NOT NULL REFERENCES users(chain_address) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    company_email VARCHAR(255) NOT NULL,
    company_phone VARCHAR(32),
    business_type VARCHAR(120),
    legal_name VARCHAR(255) NOT NULL,
    signature VARCHAR(255) NOT NULL,
    accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
