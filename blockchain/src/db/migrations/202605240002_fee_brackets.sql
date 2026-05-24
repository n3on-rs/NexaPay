-- Fee brackets: configurable tiered fee algorithm
-- rate_bps is in basis points (250 = 2.5%)
CREATE TABLE IF NOT EXISTS fee_brackets (
    id SERIAL PRIMARY KEY,
    fee_type VARCHAR(50) NOT NULL,
    min_amount_millimes BIGINT NOT NULL DEFAULT 0,
    max_amount_millimes BIGINT,
    flat_fee_millimes INTEGER NOT NULL DEFAULT 0,
    rate_bps INTEGER NOT NULL DEFAULT 0,
    min_fee_millimes INTEGER NOT NULL DEFAULT 0,
    max_fee_millimes INTEGER,
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_brackets_type_active ON fee_brackets (fee_type, active);

-- Add fee_amount to payment_intents
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS fee_amount BIGINT NOT NULL DEFAULT 0;

-- ── Seed: Payment Gateway / P2P brackets ──
-- Micro (0-10 TND): 0.500 TND flat
-- Small (10-50 TND): 1.000 TND flat
-- Mid (50-200 TND): 2.5% + 0.300 TND, min 0.300
-- Large (200-1000 TND): 2.0% + 0.500 TND, min 0.500
-- Business (1000-5000 TND): 1.5% + 1.000 TND, min 1.000
-- Enterprise (5000+ TND): 1.0% + 5.000 TND, min 5.000

INSERT INTO fee_brackets (fee_type, min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, priority) VALUES
('gateway', 0, 10000, 500, 0, 500, 1),
('gateway', 10001, 50000, 1000, 0, 1000, 2),
('gateway', 50001, 200000, 300, 250, 300, 3),
('gateway', 200001, 1000000, 500, 200, 500, 4),
('gateway', 1000001, 5000000, 1000, 150, 1000, 5),
('gateway', 5000001, NULL, 5000, 100, 5000, 6);

INSERT INTO fee_brackets (fee_type, min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, priority) VALUES
('p2p', 0, 10000, 500, 0, 500, 1),
('p2p', 10001, 50000, 1000, 0, 1000, 2),
('p2p', 50001, 200000, 300, 250, 300, 3),
('p2p', 200001, 1000000, 500, 200, 500, 4),
('p2p', 1000001, 5000000, 1000, 150, 1000, 5),
('p2p', 5000001, NULL, 5000, 100, 5000, 6);

INSERT INTO fee_brackets (fee_type, min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, priority) VALUES
('fund', 0, 10000, 500, 0, 500, 1),
('fund', 10001, 50000, 1000, 0, 1000, 2),
('fund', 50001, 200000, 300, 250, 300, 3),
('fund', 200001, 1000000, 500, 200, 500, 4),
('fund', 1000001, 5000000, 1000, 150, 1000, 5),
('fund', 5000001, NULL, 5000, 100, 5000, 6);

-- Withdrawal brackets (higher floor, capped for large amounts)
INSERT INTO fee_brackets (fee_type, min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, max_fee_millimes, priority) VALUES
('withdrawal', 0, 10000, 500, 0, 500, NULL, 1),
('withdrawal', 10001, 50000, 1000, 0, 1000, NULL, 2),
('withdrawal', 50001, 200000, 1000, 150, 1000, NULL, 3),
('withdrawal', 200001, 1000000, 1000, 150, 1000, 15000, 4),
('withdrawal', 1000001, 5000000, 5000, 100, 5000, 50000, 5),
('withdrawal', 5000001, NULL, 5000, 100, 5000, 50000, 6);

-- Company/agent withdrawal brackets
INSERT INTO fee_brackets (fee_type, min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, max_fee_millimes, priority) VALUES
('company_withdrawal', 0, 10000, 500, 0, 500, NULL, 1),
('company_withdrawal', 10001, 50000, 1000, 0, 1000, NULL, 2),
('company_withdrawal', 50001, 200000, 1000, 150, 1000, NULL, 3),
('company_withdrawal', 200001, 1000000, 1000, 150, 1000, 15000, 4),
('company_withdrawal', 1000001, 5000000, 5000, 100, 5000, 50000, 5),
('company_withdrawal', 5000001, NULL, 5000, 100, 5000, 50000, 6);
