-- Migration: Add missing columns to announcements table
-- Run AFTER the base schema.sql.
-- Safe to run multiple times (uses IF NOT EXISTS).

-- 1. Add target_user_id column
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add target_site_id column
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_site_id UUID REFERENCES projects_sites(id) ON DELETE SET NULL;

-- 3. Create indices for performance
CREATE INDEX IF NOT EXISTS idx_announcements_user ON announcements(target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_site ON announcements(target_site_id) WHERE target_site_id IS NOT NULL;
