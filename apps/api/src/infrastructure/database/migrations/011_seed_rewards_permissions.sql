-- Seeds Reward permissions and maps them onto existing roles. Same ownership
-- shape as Campaigns (009_seed_campaigns_permissions.sql) since Rewards is
-- the same growth/incentive domain:
--   Super Admin      -> everything.
--   Product/Growth   -> owns reward rules end to end.
--   Operations Admin -> operational levers on live rewards (activate, pause,
--                       resume, cancel) but not create/update the rule itself.
--   Support/Auditor/Risk/Engineering -> read only.
--   Security Admin   -> none.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('rewards', 'read', 'rewards.read', 'View reward rules'),
  ('rewards', 'create', 'rewards.create', 'Create a reward rule'),
  ('rewards', 'update', 'rewards.update', 'Update a reward rule''s details or eligibility conditions'),
  ('rewards', 'activate', 'rewards.activate', 'Activate a draft reward rule'),
  ('rewards', 'pause', 'rewards.pause', 'Pause an active reward rule'),
  ('rewards', 'resume', 'rewards.resume', 'Resume a paused reward rule'),
  ('rewards', 'expire', 'rewards.expire', 'Expire a reward rule'),
  ('rewards', 'cancel', 'rewards.cancel', 'Cancel a reward rule')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'rewards'
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'rewards'
WHERE r.name = 'Product/Growth Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('rewards.read', 'rewards.activate', 'rewards.pause', 'rewards.resume', 'rewards.cancel')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'rewards.read'
WHERE r.name IN ('Support Admin', 'Auditor', 'Risk/Fraud Admin', 'Engineering Admin')
ON CONFLICT DO NOTHING;
