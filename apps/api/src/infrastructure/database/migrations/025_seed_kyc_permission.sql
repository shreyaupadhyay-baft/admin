-- Seeds `kyc.read`: read-only access to provider-sourced (Transcorp) KYC
-- status. BAFT RBAC row only — no KYC table or data is created; Transcorp
-- remains the source of truth.
--
-- Least-privilege role mapping (KYC is sensitive identity data):
--   Super Admin      -> everything.
--   Support Admin    -> needs to tell a customer why onboarding/limits are blocked.
--   Risk/Fraud Admin -> KYC status is core evidence in fraud/risk investigations.
-- NOT granted (can be added via the Roles UI if the business decides):
--   Operations Admin -> owns account/device operations, not identity verification.
--   Security Admin   -> owns ADMIN access, not end-user identity.
--   Auditor          -> reads the audit trail of KYC_VIEWED; does not need the identity data itself.
--   Product/Growth, Engineering Admin -> no need for identity data.
INSERT INTO permissions (resource, action, key, description) VALUES
  ('kyc', 'read', 'kyc.read', 'View a user''s provider-sourced KYC status (read-only)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'kyc.read'
WHERE r.name IN ('Super Admin', 'Support Admin', 'Risk/Fraud Admin')
ON CONFLICT DO NOTHING;
