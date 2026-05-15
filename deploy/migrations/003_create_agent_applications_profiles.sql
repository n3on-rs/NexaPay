-- Migration N+3: agent_applications + agent_profiles
CREATE TABLE IF NOT EXISTS agent_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  tax_registration_number TEXT NOT NULL,
  tax_document_path TEXT NOT NULL,
  business_address TEXT NOT NULL,
  business_governorate TEXT NOT NULL,
  business_description TEXT NOT NULL,
  expected_monthly_volume DECIMAL(18,3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  risk_score FLOAT,
  score_breakdown JSONB,
  reviewer_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_address TEXT PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES agent_applications(id),
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  tax_registration_number TEXT NOT NULL,
  api_key_id UUID,
  is_active BOOL NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monthly_volume_limit DECIMAL(18,3)
);
