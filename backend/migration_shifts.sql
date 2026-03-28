-- ============================================================
-- SHIFT SCHEDULING (Zero-Trust Extension)
-- ============================================================

-- Enable btree_gist safely
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    CREATE EXTENSION btree_gist;
  END IF;
END $$;

-- 1. Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id       UUID NOT NULL REFERENCES projects_sites(id) ON DELETE CASCADE,
    start_time    TIMESTAMPTZ NOT NULL,
    end_time      TIMESTAMPTZ NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'absent', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    late_notified_at TIMESTAMPTZ,
    -- Prevent overlapping shifts for the same user
    EXCLUDE USING gist (user_id WITH =, tstzrange(start_time, end_time) WITH &&)
);

-- Ensure late_notified_at exists if table was created previously without it
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS late_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shifts_user_time ON shifts(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_shifts_site      ON shifts(site_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status    ON shifts(status);

-- 2. Link Attendance Logs to Shifts
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_logs_shift_id ON attendance_logs(shift_id);

-- 3. Trigger to update shifts updated_at
CREATE TRIGGER trg_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
