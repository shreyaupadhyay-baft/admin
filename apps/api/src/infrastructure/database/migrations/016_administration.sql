-- Administration vertical slice: hardens the existing Phase 1
-- admin_users/roles/permissions/role_permissions/admin_user_roles/
-- admin_sessions/audit_logs tables. No new tables — every concept here
-- (admin profile, roles, permissions, sessions, audit trail) already exists;
-- the only schema gap is role enable/disable, which admin_users already has
-- (is_active) but roles never did.
--
-- "Last login" and "active session summary" are deliberately NOT new columns
-- — they're derived from admin_sessions.created_at / revoked_at at query
-- time, since that data already exists there.
ALTER TABLE roles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_roles_is_active ON roles (is_active);
