-- Seeds Security permissions and maps them onto existing roles.
--
-- Unlike every prior module, Security Admin is finally the OWNER here (its
-- name is literally the module) — mirroring Risk/Fraud Admin owning Risk &
-- Fraud and Product/Growth owning Campaigns+Rewards. Critical rule from the
-- spec: approval capability is never granted merely because a role can
-- investigate cases — only Super Admin and Security Admin get
-- security_actions.approve in this default mapping.
--
--   Super Admin      -> everything (below).
--   Security Admin   -> full investigation AND action/approval authority.
--   Operations Admin -> read-only cases/events for operational context; no
--                       action visibility or approval.
--   Support Admin    -> security_cases.read only, to explain a restriction.
--   Risk/Fraud Admin -> read-only cases/events, to investigate overlap with
--                       risk; no approval.
--   Auditor          -> read-only across events/cases/actions — auditors
--                       specifically need visibility into the maker-checker
--                       trail to verify segregation of duties.
--   Product/Growth   -> none.
--   Engineering Admin-> security_events.read only, for debugging.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('security_events', 'read', 'security_events.read', 'View security events'),
  ('security_events', 'create', 'security_events.create', 'Record a new security event'),
  ('security_events', 'status.update', 'security_events.status.update', 'Change a security event''s triage status'),

  ('security_cases', 'read', 'security_cases.read', 'View security cases, including timeline/evidence'),
  ('security_cases', 'create', 'security_cases.create', 'Open a new security case'),
  ('security_cases', 'update', 'security_cases.update', 'Update a security case''s title, summary, or category'),
  ('security_cases', 'assign', 'security_cases.assign', 'Assign or unassign a security case'),
  ('security_cases', 'status.update', 'security_cases.status.update', 'Change a security case''s investigation status'),
  ('security_cases', 'severity.update', 'security_cases.severity.update', 'Change a security case''s severity'),
  ('security_cases', 'add_note', 'security_cases.add_note', 'Add an investigation note to a security case'),
  ('security_cases', 'add_evidence', 'security_cases.add_evidence', 'Attach an evidence reference to a security case'),
  ('security_cases', 'resolve', 'security_cases.resolve', 'Resolve a security case'),
  ('security_cases', 'close', 'security_cases.close', 'Close a security case'),

  ('security_actions', 'read', 'security_actions.read', 'View security actions and their approval trail'),
  ('security_actions', 'request', 'security_actions.request', 'Request a block or unblock of a user account'),
  ('security_actions', 'approve', 'security_actions.approve', 'Approve a requested security action (never the requester)'),
  ('security_actions', 'reject', 'security_actions.reject', 'Reject a requested security action'),
  ('security_actions', 'force_logout', 'security_actions.force_logout', 'Force-logout a user immediately'),
  ('security_actions', 'revoke_sessions', 'security_actions.revoke_sessions', 'Revoke all of a user''s sessions immediately')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('security_events', 'security_cases', 'security_actions')
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('security_events', 'security_cases', 'security_actions')
WHERE r.name = 'Security Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('security_events.read', 'security_cases.read')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'security_cases.read'
WHERE r.name = 'Support Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('security_events.read', 'security_cases.read')
WHERE r.name = 'Risk/Fraud Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('security_events.read', 'security_cases.read', 'security_actions.read')
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'security_events.read'
WHERE r.name = 'Engineering Admin'
ON CONFLICT DO NOTHING;
