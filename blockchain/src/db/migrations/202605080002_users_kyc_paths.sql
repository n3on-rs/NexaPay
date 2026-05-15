ALTER TABLE users
ADD COLUMN IF NOT EXISTS kyc_profile_photo_path TEXT,
ADD COLUMN IF NOT EXISTS kyc_cin_front_path TEXT,
ADD COLUMN IF NOT EXISTS kyc_cin_back_path TEXT,
ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
