-- Per-intent webhook URLs for success and failure notifications
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS success_webhook_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS failure_webhook_url TEXT;
