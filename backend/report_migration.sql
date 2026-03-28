-- =============================================================================
-- Automated Weekly Reporting Migration
-- Adds configuration settings for the weekly attendance report.
-- =============================================================================

-- Seed default settings for weekly reporting
INSERT INTO system_settings (key, value) 
VALUES ('weekly_report_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value) 
VALUES ('weekly_report_recipient', 'admin@company.com') -- Initial default
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value) 
VALUES ('weekly_report_format', 'both') -- pdf | xlsx | both
ON CONFLICT (key) DO NOTHING;
