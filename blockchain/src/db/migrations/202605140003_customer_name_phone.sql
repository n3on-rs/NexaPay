-- Add customer first/last name and phone columns to payment_intents
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS customer_first_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_last_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
