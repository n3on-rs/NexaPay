-- Migration: Remove merchants concept (idempotent — safe on fresh databases)

-- Drop foreign key constraints if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'payment_intents' AND constraint_name = 'payment_intents_merchant_id_fkey') THEN
        ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_merchant_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'refunds' AND constraint_name = 'refunds_merchant_id_fkey') THEN
        ALTER TABLE refunds DROP CONSTRAINT refunds_merchant_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'webhooks' AND constraint_name = 'webhooks_merchant_id_fkey') THEN
        ALTER TABLE webhooks DROP CONSTRAINT webhooks_merchant_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'payouts' AND constraint_name = 'payouts_merchant_id_fkey') THEN
        ALTER TABLE payouts DROP CONSTRAINT payouts_merchant_id_fkey;
    END IF;
END $$;

-- Migrate merchant_id → owner_id (only if merchants table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_intents') THEN
            UPDATE payment_intents pi SET merchant_id = m.owner_id FROM merchants m WHERE pi.merchant_id = m.id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refunds') THEN
            UPDATE refunds r SET merchant_id = m.owner_id FROM merchants m WHERE r.merchant_id = m.id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhooks') THEN
            UPDATE webhooks w SET merchant_id = m.owner_id FROM merchants m WHERE w.merchant_id = m.id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payouts') THEN
            UPDATE payouts p SET merchant_id = m.owner_id FROM merchants m WHERE p.merchant_id = m.id;
        END IF;
    END IF;
END $$;

-- Remove merchant API keys (only if api_keys table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
        DELETE FROM api_keys WHERE owner_type = 'merchant';
    END IF;
END $$;

-- Drop merchants table (only if it exists)
DROP TABLE IF EXISTS merchants;
