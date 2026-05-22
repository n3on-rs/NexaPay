-- NexaPay E-Signature, Invoice & Security Layer
-- Migration: 2026-05-18 06:00 UTC

-- ─── Signed Documents ───
CREATE TABLE IF NOT EXISTS signed_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(64) NOT NULL,
    doc_type VARCHAR(32) NOT NULL, -- 'account_opening', 'transfer_auth'
    doc_hash VARCHAR(64) NOT NULL,
    signature_data TEXT, -- base64 PNG of drawn/typed signature
    signature_type VARCHAR(16) NOT NULL DEFAULT 'draw', -- 'draw' | 'type'
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    storage_path TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'signed', -- 'signed' | 'anchored' | 'expired'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signed_docs_user ON signed_documents(user_address);
CREATE INDEX IF NOT EXISTS idx_signed_docs_type ON signed_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_signed_docs_hash ON signed_documents(doc_hash);

-- ─── Blockchain Anchors ───
CREATE TABLE IF NOT EXISTS blockchain_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anchor_type VARCHAR(32) NOT NULL, -- 'esign_account', 'esign_transfer', 'invoice_anchor'
    doc_hash VARCHAR(64) NOT NULL,
    tx_hash VARCHAR(64) NOT NULL,
    block_number BIGINT,
    user_address VARCHAR(64),
    related_id UUID, -- FK to signed_documents or invoices
    nonce VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'failed'
    retry_count INTEGER DEFAULT 0,
    anchored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anchors_hash ON blockchain_anchors(doc_hash);
CREATE INDEX IF NOT EXISTS idx_anchors_tx ON blockchain_anchors(tx_hash);
CREATE INDEX IF NOT EXISTS idx_anchors_user ON blockchain_anchors(user_address);
CREATE INDEX IF NOT EXISTS idx_anchors_status ON blockchain_anchors(status);

-- ─── Invoices ───
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(32) UNIQUE NOT NULL,
    user_address VARCHAR(64) NOT NULL,
    transaction_id UUID,
    transaction_type VARCHAR(32) NOT NULL, -- 'transfer', 'bank_transfer', 'loan', 'fee'
    sender_name VARCHAR(255),
    sender_account VARCHAR(64),
    recipient_name VARCHAR(255),
    recipient_account VARCHAR(64),
    amount BIGINT NOT NULL,
    fee BIGINT DEFAULT 0,
    tax BIGINT DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'TND',
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed'
    payment_method VARCHAR(32),
    tx_hash VARCHAR(64),
    blockchain_anchor_id UUID REFERENCES blockchain_anchors(id),
    doc_hash VARCHAR(64),
    storage_path TEXT,
    invoice_date TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_address);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_tx ON invoices(transaction_id);

-- Invoice sequence for numbering
CREATE TABLE IF NOT EXISTS invoice_sequences (
    year INTEGER PRIMARY KEY,
    last_number INTEGER DEFAULT 0
);

-- ─── Audit Logs ───
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(64),
    action VARCHAR(64) NOT NULL, -- 'login', 'transfer_init', 'transfer_complete', 'pin_change', 'esign', 'invoice_generate'
    resource_type VARCHAR(32), -- 'account', 'transfer', 'document', 'invoice'
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'success', -- 'success' | 'failure' | 'blocked'
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_address);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ─── Rate Limiting (IP-based auth endpoints) ───
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    ip_address VARCHAR(45) PRIMARY KEY,
    endpoint VARCHAR(64) NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_ip ON auth_rate_limits(ip_address);

-- ─── Transfer Authorizations ───
CREATE TABLE IF NOT EXISTS transfer_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(64) NOT NULL,
    transfer_id UUID,
    signed_document_id UUID REFERENCES signed_documents(id),
    blockchain_anchor_id UUID REFERENCES blockchain_anchors(id),
    amount BIGINT NOT NULL,
    destination_hash VARCHAR(64) NOT NULL, -- SHA256 of RIB+name
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'expired' | 'revoked'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_auth_user ON transfer_authorizations(user_address);
CREATE INDEX IF NOT EXISTS idx_transfer_auth_status ON transfer_authorizations(status);
