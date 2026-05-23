-- Add contract_text column to signed_documents for storing the full contract text
ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS contract_text TEXT;
ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS terms_version VARCHAR(16) DEFAULT '1.0';

-- NOTE: No index on contract_text — contract text (340+ lines) can exceed
-- PostgreSQL's btree row size limit (2704 bytes). Searches use doc_hash instead.
