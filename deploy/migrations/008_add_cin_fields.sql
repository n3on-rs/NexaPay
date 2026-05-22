-- Migration: Add full CIN-extracted fields to users table for BCT compliance
-- Banking and Financial Transactions Code (Tunisia) requires complete identity data

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS place_of_birth TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cin_issue_date TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Tunisian';
