-- Phase 1: seed static RBAC reference data (roles + permissions + mapping).
-- No admin_users rows here — bootstrapping the first Super Admin requires a
-- hashed password and is handled by the `db:seed:admin` script instead, never
-- by a migration file (migrations are checked into git; credentials are not).
--
-- Permissions are only seeded for resources/APIs that actually exist in this
-- phase (admin management, roles, permissions, audit logs). Operations,
-- Support, Risk/Fraud, Product/Growth, and Engineering Admin are created as
-- roles now so later phases can attach permissions to them, but they receive
-- none yet since their owning resources (users, devices, support_cases, ...)
-- don't exist until those phases land.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('admins', 'read', 'admins.read', 'View admin users'),
  ('admins', 'create', 'admins.create', 'Create admin users'),
  ('admins', 'update', 'admins.update', 'Update admin user profile fields'),
  ('admins', 'disable', 'admins.disable', 'Disable an admin user'),
  ('admins', 'enable', 'admins.enable', 'Enable an admin user'),
  ('admins', 'assign_role', 'admins.assign_role', 'Assign a role to an admin user'),
  ('admins', 'remove_role', 'admins.remove_role', 'Remove a role from an admin user'),
  ('roles', 'read', 'roles.read', 'View roles'),
  ('roles', 'create', 'roles.create', 'Create roles'),
  ('roles', 'update', 'roles.update', 'Update a role (including its permissions)'),
  ('permissions', 'read', 'permissions.read', 'View permissions'),
  ('audit_logs', 'read', 'audit_logs.read', 'View audit logs')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (name, description, is_system) VALUES
  ('Super Admin', 'Full administrative access to every BAFT Admin capability.', TRUE),
  ('Security Admin', 'Owns identity, access control, and audit oversight.', TRUE),
  ('Auditor', 'Read-only access for compliance and audit review.', TRUE),
  ('Operations Admin', 'Reserved for operational tooling introduced in a later phase.', TRUE),
  ('Support Admin', 'Reserved for support tooling introduced in a later phase.', TRUE),
  ('Risk/Fraud Admin', 'Reserved for risk and fraud tooling introduced in a later phase.', TRUE),
  ('Product/Growth Admin', 'Reserved for product and growth tooling introduced in a later phase.', TRUE),
  ('Engineering Admin', 'Reserved for engineering tooling introduced in a later phase.', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Super Admin: every permission that exists.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Security Admin: full control of identity/access + audit read.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Security Admin'
  AND p.key IN (
    'admins.read', 'admins.create', 'admins.update', 'admins.disable', 'admins.enable',
    'admins.assign_role', 'admins.remove_role',
    'roles.read', 'roles.create', 'roles.update',
    'permissions.read', 'audit_logs.read'
  )
ON CONFLICT DO NOTHING;

-- Auditor: read-only, no mutation permissions anywhere.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Auditor'
  AND p.key IN ('admins.read', 'roles.read', 'permissions.read', 'audit_logs.read')
ON CONFLICT DO NOTHING;
