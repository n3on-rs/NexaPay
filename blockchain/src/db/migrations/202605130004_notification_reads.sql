-- Track which transaction-derived notifications each user has read
CREATE TABLE IF NOT EXISTS notification_reads (
    user_address VARCHAR(64) NOT NULL,
    tx_id VARCHAR(64) NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_address, tx_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_address);
