-- Seeds the Analytics read permissions. RBAC rows only: Analytics is a read-only
-- aggregation over existing BAFT tables, so NO table, index, snapshot or
-- materialized view is created. Existing indexes on created_at (users, support_cases,
-- campaigns, rewards, risk_cases, security_cases) already cover the range filters.
--
-- Least-privilege role mapping:
--   Super Admin        -> every analytics section.
--   Product/Growth     -> overview, onboarding, features, retention, usage, rewards (their domain).
--   Operations Admin   -> overview, onboarding, rewards (they run campaigns/rewards and account operations).
--   Engineering Admin  -> usage (device/platform base).
--   financial          -> Super Admin only until a legitimate financial dataset exists and is reviewed.
-- NOT granted: Support, Risk/Fraud, Security, Auditor (they use their operational modules;
--   Auditor reads the audit trail). Grantable later through the Roles UI.
INSERT INTO permissions (resource, action, key, description) VALUES
  ('analytics', 'overview.read',   'analytics.overview.read',   'View the analytics overview (BAFT-owned aggregates)'),
  ('analytics', 'onboarding.read', 'analytics.onboarding.read', 'View onboarding analytics (aggregates)'),
  ('analytics', 'features.read',   'analytics.features.read',   'View feature usage analytics (aggregates)'),
  ('analytics', 'retention.read',  'analytics.retention.read',  'View retention analytics (aggregates)'),
  ('analytics', 'usage.read',      'analytics.usage.read',      'View BAFT usage analytics (aggregates)'),
  ('analytics', 'rewards.read',    'analytics.rewards.read',    'View rewards and campaigns analytics (aggregates)'),
  ('analytics', 'financial.read',  'analytics.financial.read',  'View financial analytics (aggregates)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key LIKE 'analytics.%'
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('analytics.overview.read', 'analytics.onboarding.read', 'analytics.features.read',
                                'analytics.retention.read', 'analytics.usage.read', 'analytics.rewards.read')
WHERE r.name = 'Product/Growth Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('analytics.overview.read', 'analytics.onboarding.read', 'analytics.rewards.read')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'analytics.usage.read'
WHERE r.name = 'Engineering Admin'
ON CONFLICT DO NOTHING;
