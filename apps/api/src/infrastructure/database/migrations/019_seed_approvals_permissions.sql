-- Seeds generic Approvals permissions. `approvals.execute` from the
-- suggested vocabulary is deliberately NOT seeded: approval execution is
-- atomic with the approve decision (no separate execute endpoint exists,
-- per the "don't add a second execution step if it can execute atomically"
-- guidance), so there is no enforcement point for it to gate — every prior
-- module in this codebase avoids seeding a permission with nothing to check.
--
--   Super Admin      -> everything (below).
--   Security Admin   -> decision capability (approve/reject) + visibility,
--                       for security-relevant approvals — NOT create/cancel,
--                       since they already have their own request path via
--                       security_actions.request for the flow they own.
--   Auditor          -> read-only, including the timeline.
--   Everyone else    -> none by default. Test-specific requester/approver
--                       roles are created via the Administration API where
--                       a concrete scenario needs one (see tests) — no
--                       functional role gets approvals.create merely because
--                       the module exists.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('approvals', 'read', 'approvals.read', 'View approval requests'),
  ('approvals', 'create', 'approvals.create', 'Create an approval request'),
  ('approvals', 'approve', 'approvals.approve', 'Approve a requested approval (never the requester)'),
  ('approvals', 'reject', 'approvals.reject', 'Reject a requested approval'),
  ('approvals', 'cancel', 'approvals.cancel', 'Cancel a pending approval'),
  ('approvals', 'events.read', 'approvals.events.read', 'View an approval''s timeline')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'approvals'
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('approvals.read', 'approvals.approve', 'approvals.reject', 'approvals.events.read')
WHERE r.name = 'Security Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('approvals.read', 'approvals.events.read')
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;
