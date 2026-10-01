-- Seeds permissions for Support Cases + App Issues and maps them onto
-- existing roles.
--
-- Role justification (least privilege, not "grant everything"):
--   Super Admin      -> everything (below).
--   Operations Admin -> full operational access to both resources.
--   Support Admin    -> full access; this is literally their job.
--   Auditor          -> read only, both resources, no mutations.
--   Risk/Fraud Admin -> read only, for investigation; no case/issue mutation
--                       (they act on the user/device, not the ticket).
--   Product/Growth   -> app_issues.read only ("reported product issues" maps
--                       to App Issues, not individual support tickets).
--   Engineering Admin-> app_issues.read only, for debugging reported issues.
--   Security Admin   -> none. Support access isn't part of its identity/access
--                       scope just because the role exists.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('support_cases', 'read', 'support_cases.read', 'View support cases'),
  ('support_cases', 'create', 'support_cases.create', 'Create a support case'),
  ('support_cases', 'update', 'support_cases.update', 'Update a support case''s details or non-terminal status'),
  ('support_cases', 'assign', 'support_cases.assign', 'Assign or unassign a support case'),
  ('support_cases', 'resolve', 'support_cases.resolve', 'Resolve a support case'),
  ('support_cases', 'close', 'support_cases.close', 'Close a support case'),
  ('support_cases', 'add_note', 'support_cases.add_note', 'Add a note to a support case'),
  ('app_issues', 'read', 'app_issues.read', 'View app issues'),
  ('app_issues', 'create', 'app_issues.create', 'Create an app issue'),
  ('app_issues', 'update', 'app_issues.update', 'Update an app issue''s details or non-terminal status'),
  ('app_issues', 'assign', 'app_issues.assign', 'Assign or unassign an app issue'),
  ('app_issues', 'resolve', 'app_issues.resolve', 'Resolve an app issue')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('support_cases', 'app_issues')
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('support_cases', 'app_issues')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('support_cases', 'app_issues')
WHERE r.name = 'Support Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('support_cases.read', 'app_issues.read')
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('support_cases.read', 'app_issues.read')
WHERE r.name = 'Risk/Fraud Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'app_issues.read'
WHERE r.name = 'Product/Growth Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'app_issues.read'
WHERE r.name = 'Engineering Admin'
ON CONFLICT DO NOTHING;
