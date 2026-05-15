-- Add last4 column for faster card lookups
ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4);
