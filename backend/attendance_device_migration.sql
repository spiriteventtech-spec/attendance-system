-- ── 8. Add device binding to attendance sessions ────────────────────────────────
-- This ensures that the device used for check-in must match the one used at check-out.
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Index for fast lookup by device
CREATE INDEX IF NOT EXISTS idx_logs_device_id ON attendance_logs(device_id);
