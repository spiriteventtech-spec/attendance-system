-- =============================================================================
-- Zero-Trust Security Schema Migration
-- Run AFTER the base schema.sql has been applied.
-- Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- ── 1. Device Binding + Push Notification columns on users ───────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_registered_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- ── 2. Check-in method tracking on attendance_logs ───────────────────────────
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS check_in_method TEXT DEFAULT 'standard';
-- Values: 'standard' | 'qr' | 'admin_override'

-- ── 3. Security Audit Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('info', 'medium', 'high', 'critical')),
  detail      JSONB DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sal_user_id   ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sal_event     ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_sal_severity  ON security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_sal_created   ON security_audit_log(created_at DESC);

-- ── 4. Nonce Store (Replay Attack Prevention) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce       TEXT PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);

-- ── 5. QR Token Store (Burn-After-Reading) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT UNIQUE NOT NULL,
  site_id     UUID REFERENCES projects_sites(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_token    ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_expires  ON qr_tokens(expires_at);

-- ── 6. QR Usage Log (per-employee, per-day single-use enforcement) ────────────
CREATE TABLE IF NOT EXISTS qr_usages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qru_token_user ON qr_usages(token, user_id);

-- ── 7. System Settings (stores session conflict policy, etc.) ─────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default session conflict policy: block_new | terminate_old
INSERT INTO system_settings (key, value) 
VALUES ('session_conflict_policy', 'block_new')
ON CONFLICT (key) DO NOTHING;
