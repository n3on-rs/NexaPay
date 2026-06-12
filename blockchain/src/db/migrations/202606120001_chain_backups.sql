-- Chain state backups — survives Sled volume loss
CREATE TABLE IF NOT EXISTS chain_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_type TEXT NOT NULL,        -- 'blocks' | 'accounts'
    block_height BIGINT NOT NULL DEFAULT 0,
    data JSONB NOT NULL,                -- serialized chain data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_snapshots_type_height
    ON chain_snapshots (snapshot_type, block_height DESC);

-- Keep only the last 100 snapshots per type (auto-cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM chain_snapshots
    WHERE snapshot_type = NEW.snapshot_type
      AND id NOT IN (
          SELECT id FROM chain_snapshots
          WHERE snapshot_type = NEW.snapshot_type
          ORDER BY created_at DESC
          LIMIT 100
      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_snapshots ON chain_snapshots;
CREATE TRIGGER trg_cleanup_snapshots
    AFTER INSERT ON chain_snapshots
    FOR EACH STATEMENT
    EXECUTE FUNCTION cleanup_old_snapshots();
