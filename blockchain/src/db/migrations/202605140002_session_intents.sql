-- Add parent_intent_id to distinguish link templates from payment sessions
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS parent_intent_id VARCHAR(40);

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_payment_intents_parent ON payment_intents (parent_intent_id);
