-- Migration: Remove merchants concept, migrate merchant_id to owner_id

-- Step 1: Drop foreign key constraints referencing merchants
DO $$
BEGIN
    -- payment_intents
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'payment_intents'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%merchant%'
    ) THEN
        ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_merchant_id_fkey;
    END IF;

    -- refunds
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'refunds'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%merchant%'
    ) THEN
        ALTER TABLE refunds DROP CONSTRAINT refunds_merchant_id_fkey;
    END IF;

    -- webhooks
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'webhooks'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%merchant%'
    ) THEN
        ALTER TABLE webhooks DROP CONSTRAINT webhooks_merchant_id_fkey;
    END IF;

    -- payouts
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'payouts'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%merchant%'
    ) THEN
        ALTER TABLE payouts DROP CONSTRAINT payouts_merchant_id_fkey;
    END IF;
END $$;

-- Step 2: Migrate existing merchant_id values to owner_id (developer_id)
-- This collapses multiple merchants per developer into one account
UPDATE payment_intents pi
SET merchant_id = m.owner_id
FROM merchants m
WHERE pi.merchant_id = m.id;

UPDATE refunds r
SET merchant_id = m.owner_id
FROM merchants m
WHERE r.merchant_id = m.id;

UPDATE webhooks w
SET merchant_id = m.owner_id
FROM merchants m
WHERE w.merchant_id = m.id;

UPDATE payouts p
SET merchant_id = m.owner_id
FROM merchants m
WHERE p.merchant_id = m.id;

-- Step 3: Remove merchant API keys (they are no longer valid)
DELETE FROM api_keys WHERE owner_type = 'merchant';

-- Step 4: Drop merchants table
DROP TABLE IF EXISTS merchants;
