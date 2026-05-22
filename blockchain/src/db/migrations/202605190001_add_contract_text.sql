-- Add contract_text column to signed_documents for storing the full contract text
ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS contract_text TEXT;
ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS terms_version VARCHAR(16) DEFAULT '1.0';

-- Add index for faster contract retrieval
CREATE INDEX IF NOT EXISTS idx_signed_docs_contract ON signed_documents(contract_text) WHERE contract_text IS NOT NULL;
