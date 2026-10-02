-- Seeds a single infrastructure-visibility permission for the Transcorp
-- integration foundation. This is a BAFT RBAC row only: no provider-owned
-- table or data is created.
--
-- `system.integrations.read` lets an admin see integration connectivity /
-- configuration STATUS (never credentials). It is intentionally NOT a
-- "Transcorp Admin" permission and grants no access to provider data — future
-- provider-facing modules are gated by their own permissions (kyc.read,
-- transactions.read, beneficiaries.read, cards.read, ...).
--
-- Granted to Super Admin and Engineering Admin only (least privilege).
INSERT INTO permissions (resource, action, key, description) VALUES
  ('system', 'integrations.read', 'system.integrations.read', 'View external integration connectivity and configuration status (no credentials, no provider data)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'system.integrations.read'
WHERE r.name IN ('Super Admin', 'Engineering Admin')
ON CONFLICT DO NOTHING;
