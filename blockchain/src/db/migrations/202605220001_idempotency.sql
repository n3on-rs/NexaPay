-- NexaPay Idempotency Layer
-- Migration: 2026-05-22
--
-- Prevents duplicate transactions from network retries.
-- Each idempotency key is valid for 24 hours and scoped to a user+endpoint.

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key_hash VARCHAR(64) PRIMARY KEY,
    user_address VARCHAR(64) NOT NULL,
    endpoint VARCHAR(128) NOT NULL,
    response_body JSONB NOT NULL,
    status_code SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
