-- Seeds Administration permissions and maps them onto existing roles. This
-- is a distinct, more hardened API surface over the same admin_users/roles
-- data the original Phase 1 admins.*/roles.*/permissions.* permissions
-- already gate (session management, privilege-escalation-aware role editing,
-- audit visibility) — both permission sets coexist; neither replaces the
-- other, and the original /api/v1/admins,/roles,/permissions endpoints are
-- unchanged.
--
--   Super Admin      -> everything (below).
--   Security Admin   -> security-incident scope only: read admins, read and
--                       revoke sessions, enable/disable an admin account
--                       (e.g. a compromised one), read the audit trail.
--                       Explicitly NOT role/permission management — that
--                       requires broader trust than "can respond to a
--                       security incident."
--   Auditor          -> read-only across all of Administration, including
--                       the session and audit views, for compliance review.
--                       No mutation permission at all.
--   Everyone else    -> none. No concrete BAFT requirement was given for
--                       Operations/Support/Risk/Product/Engineering to
--                       manage admin accounts, roles, or permissions, and
--                       "needs access to another module" is explicitly not
--                       sufficient justification.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('administration.admins', 'read', 'administration.admins.read', 'View admin accounts (Administration view)'),
  ('administration.admins', 'create', 'administration.admins.create', 'Create an admin account (Administration view)'),
  ('administration.admins', 'update', 'administration.admins.update', 'Update an admin account''s profile (Administration view)'),
  ('administration.admins', 'status.update', 'administration.admins.status.update', 'Enable or disable an admin account (Administration view)'),
  ('administration.admins', 'roles.update', 'administration.admins.roles.update', 'Assign or remove a role from an admin account'),
  ('administration.admins', 'sessions.read', 'administration.admins.sessions.read', 'View an admin''s session metadata'),
  ('administration.admins', 'sessions.revoke', 'administration.admins.sessions.revoke', 'Revoke all of an admin''s sessions'),

  ('administration.roles', 'read', 'administration.roles.read', 'View roles (Administration view)'),
  ('administration.roles', 'create', 'administration.roles.create', 'Create a role (Administration view)'),
  ('administration.roles', 'update', 'administration.roles.update', 'Update a role''s name or description'),
  ('administration.roles', 'status.update', 'administration.roles.status.update', 'Enable or disable a role'),
  ('administration.roles', 'permissions.update', 'administration.roles.permissions.update', 'Replace a role''s permission set'),

  ('administration.permissions', 'read', 'administration.permissions.read', 'View the permission catalogue (Administration view)'),

  ('administration.audit', 'read', 'administration.audit.read', 'View the administration-relevant audit trail')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('administration.admins', 'administration.roles', 'administration.permissions', 'administration.audit')
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'administration.admins.read',
  'administration.admins.status.update',
  'administration.admins.sessions.read',
  'administration.admins.sessions.revoke',
  'administration.audit.read'
)
WHERE r.name = 'Security Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'administration.admins.read',
  'administration.admins.sessions.read',
  'administration.roles.read',
  'administration.permissions.read',
  'administration.audit.read'
)
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;
