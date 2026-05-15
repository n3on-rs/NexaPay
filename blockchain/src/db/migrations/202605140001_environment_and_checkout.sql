-- Environment and Checkout System Migration

-- Add checkout-related columns to payment_intents
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS variable_amount BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS accepted_methods TEXT[] DEFAULT ARRAY['wallet', 'bank_card'],
    ADD COLUMN IF NOT EXISTS expiry TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS max_usages INTEGER,
    ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS order_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS checkout_theme VARCHAR(8) NOT NULL DEFAULT 'dark',
    ADD COLUMN IF NOT EXISTS success_url TEXT;

-- Add agent environment preference
ALTER TABLE agent_profiles
    ADD COLUMN IF NOT EXISTS environment VARCHAR(16) NOT NULL DEFAULT 'sandbox';

-- Sandbox test cards table
CREATE TABLE IF NOT EXISTS sandbox_test_cards (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(20) NOT NULL,
    number VARCHAR(19) NOT NULL,
    expiry_month INT NOT NULL,
    expiry_year INT NOT NULL,
    cvv VARCHAR(4) NOT NULL,
    behavior VARCHAR(20) NOT NULL,
    description TEXT
);

-- Seed test cards (only used when NEXAPAY_ENV=sandbox)
INSERT INTO sandbox_test_cards (brand, number, expiry_month, expiry_year, cvv, behavior, description)
VALUES
    ('Visa', '4242424242424242', 12, 2029, '123', 'success', 'Always succeeds'),
    ('Visa', '4000000000000002', 12, 2029, '123', 'declined', 'Always declined'),
    ('Visa', '4000000000009995', 12, 2029, '123', 'insufficient_funds', 'Insufficient funds'),
    ('MasterCard', '5555555555554444', 12, 2029, '123', 'success', 'Always succeeds'),
    ('MasterCard', '5105105105105100', 12, 2029, '123', 'declined', 'Always declined')
ON CONFLICT DO NOTHING;

-- Create index on test card number for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_test_cards_number ON sandbox_test_cards (number);

-- Add index on payment_intents intent_id for public lookups
CREATE INDEX IF NOT EXISTS idx_payment_intents_public ON payment_intents (intent_id, status);
