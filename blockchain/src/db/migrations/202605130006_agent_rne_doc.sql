-- Add RNE document path to agent applications
ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS rne_document_path TEXT;
