-- NexaPay Client-Side Transaction Signing
-- Migration: 2026-05-22
--
-- Every user gets an Ed25519 keypair. The public key is stored on-chain
-- (ChainAccount.public_key) for signature verification. The private key
-- is encrypted with the user's PIN (Argon2id → AES-256-GCM) and stored
-- in this table for server-side signing.

-- Add encrypted private key to cards table (alongside existing pin_hash)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS encrypted_user_sk TEXT;

-- Add public_key to users table for fast lookup
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key VARCHAR(64);
