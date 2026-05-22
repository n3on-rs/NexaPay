-- KYC verification status + external session tracking
-- kyc_status values: 'unverified', 'pending', 'verified', 'failed'

-- Add external KYC session tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_external_session_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_face_match_score REAL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_liveness_passed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_failure_reason TEXT;

-- Table to track KYC verification attempts
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(64) NOT NULL REFERENCES users(chain_address),
    external_session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    cin_data JSONB,
    face_match_score REAL,
    face_match_passed BOOLEAN,
    liveness_passed BOOLEAN,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kyc_verif_user ON kyc_verifications(user_address);
CREATE INDEX IF NOT EXISTS idx_kyc_verif_session ON kyc_verifications(external_session_id);
