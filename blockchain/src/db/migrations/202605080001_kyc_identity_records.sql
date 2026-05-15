-- Standalone KYC validation records (backend/test; not wired to main user signup yet).

CREATE TABLE IF NOT EXISTS kyc_identity_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL DEFAULT '',
    cin TEXT NOT NULL DEFAULT '',
    date_of_birth TEXT,
    address_line TEXT,
    city TEXT,
    governorate TEXT,
    phone TEXT,
    email TEXT,
    nationality TEXT,
    front_filename TEXT NOT NULL,
    back_filename TEXT NOT NULL,
    ocr_json JSONB NOT NULL,
    extraction_quality REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_identity_records_created ON kyc_identity_records (created_at DESC);
