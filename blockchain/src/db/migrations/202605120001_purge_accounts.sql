-- Purge all user accounts and related sensitive data
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users') THEN
		EXECUTE 'TRUNCATE TABLE users CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'cards') THEN
		EXECUTE 'TRUNCATE TABLE cards CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'bank_accounts') THEN
		EXECUTE 'TRUNCATE TABLE bank_accounts CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'developers') THEN
		EXECUTE 'TRUNCATE TABLE developers CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'api_logs') THEN
		EXECUTE 'TRUNCATE TABLE api_logs CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'kyc_sessions') THEN
		EXECUTE 'TRUNCATE TABLE kyc_sessions CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'kyc_identity_records') THEN
		EXECUTE 'TRUNCATE TABLE kyc_identity_records CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'funding_transactions') THEN
		EXECUTE 'TRUNCATE TABLE funding_transactions CASCADE';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'bank_withdrawals') THEN
		EXECUTE 'TRUNCATE TABLE bank_withdrawals CASCADE';
	END IF;
END$$;

-- Reset sequences if any
-- (Postgres gen_random_uuid used so no sequences to reset)
