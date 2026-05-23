-- Add random per-user salt for PIN/key derivation to prevent
-- rainbow table attacks on PIN recovery.
-- Previously salt was derived from chain_address + pepper (both public).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pin_salt VARCHAR(48);
