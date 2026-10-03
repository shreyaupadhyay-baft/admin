-- Seeds `beneficiaries.read`: read-only access to provider-sourced (Transcorp)
-- beneficiary information for a BAFT user. BAFT RBAC row only — no beneficiary
-- table or data is created; Transcorp remains the source of truth.
--
-- Least-privilege role mapping (beneficiary data is sensitive financial/PII data):
--   Super Admin      -> everything.
--   Support Admin    -> resolves customer queries about payees/transfers.
--   Risk/Fraud Admin -> beneficiary relationships are core evidence in fraud/mule investigations.
-- NOT granted (can be added via the Roles UI if the business decides):
--   Operations Admin -> owns account/device operations, not payee data.
--   Security Admin   -> owns ADMIN access, not end-user financial data.
--   Auditor          -> reads the audit trail of BENEFICIARY_VIEWED; does not need the data itself.
--   Product/Growth, Engineering Admin -> no need for beneficiary data.
INSERT INTO permissions (resource, action, key, description) VALUES
  ('beneficiaries', 'read', 'beneficiaries.read', 'View a user''s provider-sourced beneficiaries (read-only)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'beneficiaries.read'
WHERE r.name IN ('Super Admin', 'Support Admin', 'Risk/Fraud Admin')
ON CONFLICT DO NOTHING;
