-- Add identity fields for contract generation
ALTER TABLE users ADD COLUMN IF NOT EXISTS cin_issue_date VARCHAR(10) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(100) DEFAULT '';
