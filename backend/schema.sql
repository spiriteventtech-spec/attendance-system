-- ============================================================
-- Geofenced Attendance System - PostgreSQL + PostGIS Schema
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'archived')),
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(30),
    avatar_url    TEXT,
    expo_push_token VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role   ON users(role);

-- ============================================================
-- PROJECTS / SITES
-- ============================================================
CREATE TABLE projects_sites (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    latitude       DOUBLE PRECISION NOT NULL,
    longitude      DOUBLE PRECISION NOT NULL,
    radius_meters  INTEGER NOT NULL DEFAULT 100,
    -- PostGIS geography column for fast proximity queries
    location       GEOGRAPHY(POINT, 4326),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Populate the geography column automatically
CREATE OR REPLACE FUNCTION sync_site_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_site_location
    BEFORE INSERT OR UPDATE ON projects_sites
    FOR EACH ROW EXECUTE FUNCTION sync_site_location();

CREATE INDEX idx_sites_location ON projects_sites USING GIST(location);

-- ============================================================
-- HELPER: Generic updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ATTENDANCE LOGS
-- ============================================================
CREATE TABLE attendance_logs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    site_id           UUID NOT NULL REFERENCES projects_sites(id) ON DELETE RESTRICT,
    check_in_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_in_note     TEXT NOT NULL,        -- Mandatory note on check-in
    check_out_time    TIMESTAMPTZ,
    check_out_note    TEXT,                 -- Mandatory note on check-out
    total_hours_worked DECIMAL(6,2),        -- Computed on checkout
    total_away_minutes INTEGER DEFAULT 0,  -- Cumulative breach duration
    status            VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'overridden')),
    -- Admin override fields
    override_by       UUID REFERENCES users(id),
    override_comment  TEXT,
    override_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logs_user_id   ON attendance_logs(user_id);
CREATE INDEX idx_logs_site_id   ON attendance_logs(site_id);
CREATE INDEX idx_logs_checkin   ON attendance_logs(check_in_time);
CREATE INDEX idx_logs_status    ON attendance_logs(status);

-- ============================================================
-- BREACH LOGS (Time-Away Tracking)
-- ============================================================
CREATE TABLE breach_logs (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_log_id    UUID NOT NULL REFERENCES attendance_logs(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id),
    exit_time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    return_time          TIMESTAMPTZ,
    duration_away_minutes INTEGER,         -- Computed when return_time is set
    exit_lat             DOUBLE PRECISION,
    exit_lng             DOUBLE PRECISION,
    return_lat           DOUBLE PRECISION,
    return_lng           DOUBLE PRECISION,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_breach_attendance ON breach_logs(attendance_log_id);
CREATE INDEX idx_breach_user       ON breach_logs(user_id);
CREATE INDEX idx_breach_open       ON breach_logs(attendance_log_id) WHERE return_time IS NULL;

-- ============================================================
-- LOCATION PINGS (Recent only — for live map)
-- ============================================================
CREATE TABLE location_pings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    accuracy    FLOAT,
    is_inside   BOOLEAN NOT NULL,
    pinged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep only last 500 pings per user (prune via scheduled job)
CREATE INDEX idx_pings_user_time ON location_pings(user_id, pinged_at DESC);

-- ============================================================
-- HELPER: Update total_hours_worked on checkout
-- ============================================================
CREATE OR REPLACE FUNCTION compute_hours_on_checkout()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_out_time IS NOT NULL AND OLD.check_out_time IS NULL THEN
        NEW.total_hours_worked = ROUND(
            EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0,
            2
        );
        NEW.status = 'completed';
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_hours
    BEFORE UPDATE ON attendance_logs
    FOR EACH ROW EXECUTE FUNCTION compute_hours_on_checkout();

-- ============================================================
-- HELPER: Compute breach duration on return
-- ============================================================
CREATE OR REPLACE FUNCTION compute_breach_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.return_time IS NOT NULL AND OLD.return_time IS NULL THEN
        NEW.duration_away_minutes = ROUND(
            EXTRACT(EPOCH FROM (NEW.return_time - NEW.exit_time)) / 60.0
        );
        -- Update cumulative away time on the parent attendance log
        UPDATE attendance_logs
        SET total_away_minutes = COALESCE(total_away_minutes, 0) + NEW.duration_away_minutes
        WHERE id = NEW.attendance_log_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_breach_duration
    BEFORE UPDATE ON breach_logs
    FOR EACH ROW EXECUTE FUNCTION compute_breach_duration();

-- ============================================================
-- ANNOUNCEMENTS (Broadcast messages from admin to staff)
-- ============================================================
CREATE TABLE announcements (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    priority    VARCHAR(20) NOT NULL DEFAULT 'general' 
                CHECK (priority IN ('general', 'important', 'urgent')),
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_site_id UUID REFERENCES projects_sites(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_created ON announcements(created_at DESC);

-- ============================================================
-- SEED: Default admin user (password: Admin@1234)
-- Change immediately after first login!
-- ============================================================
INSERT INTO users (email, password_hash, role, first_name, last_name)
VALUES (
    'admin@company.com',
    '$2b$12$XBcoXhzykpde9SjVC6VlfuVhlC67ZGy4UM6XxXGrpwTlkETTbLFQVu', -- Admin@1234
    'admin',
    'System',
    'Admin'
);
