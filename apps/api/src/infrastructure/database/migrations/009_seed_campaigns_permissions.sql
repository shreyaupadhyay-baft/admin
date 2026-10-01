-- Seeds Campaign permissions and maps them onto existing roles.
--
-- Role justification (least privilege, not "grant everything"):
--   Super Admin      -> everything (below).
--   Product/Growth   -> owns campaigns end to end (design, schedule, run).
--   Operations Admin -> operational levers only (activate a scheduled
--                       campaign at go-live, cancel in an incident) — not
--                       create/design/schedule, which is Growth's call.
--   Support Admin    -> read only, to give context when helping a user.
--   Auditor          -> read only.
--   Risk/Fraud Admin -> read only, for investigating campaign-driven abuse.
--   Engineering Admin-> read only, for debugging.
--   Security Admin   -> none. Not part of its identity/access scope.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('campaigns', 'read', 'campaigns.read', 'View campaigns'),
  ('campaigns', 'create', 'campaigns.create', 'Create a campaign'),
  ('campaigns', 'update', 'campaigns.update', 'Update a campaign''s details, audience, or targeting'),
  ('campaigns', 'schedule', 'campaigns.schedule', 'Schedule a draft campaign'),
  ('campaigns', 'activate', 'campaigns.activate', 'Activate a scheduled campaign'),
  ('campaigns', 'complete', 'campaigns.complete', 'Mark an active campaign as completed'),
  ('campaigns', 'cancel', 'campaigns.cancel', 'Cancel a campaign')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'campaigns'
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'campaigns'
WHERE r.name = 'Product/Growth Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('campaigns.read', 'campaigns.activate', 'campaigns.cancel')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'campaigns.read'
WHERE r.name IN ('Support Admin', 'Auditor', 'Risk/Fraud Admin', 'Engineering Admin')
ON CONFLICT DO NOTHING;
