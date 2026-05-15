-- Migration N+5: transfer_notifications
CREATE TABLE IF NOT EXISTS transfer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount DECIMAL(18,3) NOT NULL,
  memo TEXT,
  notification_type TEXT NOT NULL DEFAULT 'TRANSFER',
  is_read BOOL NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
