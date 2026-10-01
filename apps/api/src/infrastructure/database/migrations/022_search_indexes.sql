-- Global Search: enables efficient case-insensitive partial ("contains")
-- matching on the free-text title fields Global Search ranks against.
-- pg_trgm is a standard, built-in Postgres extension — not new
-- infrastructure — and is the textbook Postgres-native way to make
-- `ILIKE '%term%'` use an index instead of a sequential scan.
--
-- Deliberately NOT indexed here: devices.device_ref and
-- approvals.approval_number/action_type, and admin/user
-- phone_number/external_ref — these are short structured identifiers
-- searched by exact/prefix match, and their existing UNIQUE-constraint
-- btree indexes (or PK indexes) already serve exact lookups adequately at
-- this application's scale. Only genuinely free-text "title" columns get a
-- trigram index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_users_full_name_trgm ON users USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_users_email_trgm ON users USING GIN (email gin_trgm_ops);
CREATE INDEX idx_admin_users_full_name_trgm ON admin_users USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_admin_users_email_trgm ON admin_users USING GIN (email gin_trgm_ops);
CREATE INDEX idx_support_cases_subject_trgm ON support_cases USING GIN (subject gin_trgm_ops);
CREATE INDEX idx_app_issues_title_trgm ON app_issues USING GIN (title gin_trgm_ops);
CREATE INDEX idx_campaigns_name_trgm ON campaigns USING GIN (name gin_trgm_ops);
CREATE INDEX idx_rewards_name_trgm ON rewards USING GIN (name gin_trgm_ops);
CREATE INDEX idx_risk_cases_title_trgm ON risk_cases USING GIN (title gin_trgm_ops);
CREATE INDEX idx_security_cases_title_trgm ON security_cases USING GIN (title gin_trgm_ops);
