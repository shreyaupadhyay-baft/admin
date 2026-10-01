-- Seeds Risk & Fraud permissions and maps them onto existing roles.
--
-- Unlike every prior module, Risk/Fraud Admin is the OWNER here (its name is
-- literally the module) — mirroring how Product/Growth Admin owns
-- Campaigns+Rewards. Role justification:
--   Super Admin      -> everything (below).
--   Risk/Fraud Admin -> owns Risk & Fraud end to end: triage signals,
--                       investigate cases, assign, change status/severity,
--                       add evidence/notes, record decisions, resolve/close.
--   Operations Admin -> read-only visibility (context before taking an
--                       operational action), not investigation authority.
--   Support Admin    -> risk_cases.read only, to explain an account
--                       restriction to a user; no signal-level detail.
--   Auditor          -> read-only across both resources, never mutation.
--   Engineering Admin-> risk_signals.read only, for debugging
--                       system/integration-sourced signals — not case
--                       investigation content.
--   Product/Growth   -> none. Not part of the growth domain.
--   Security Admin   -> none, as with every prior module: it owns ADMIN
--                       identity/access, not BAFT end-user risk.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('risk_signals', 'read', 'risk_signals.read', 'View risk signals'),
  ('risk_signals', 'create', 'risk_signals.create', 'Record a new risk signal'),
  ('risk_signals', 'status.update', 'risk_signals.status.update', 'Change a risk signal''s triage status'),

  ('risk_cases', 'read', 'risk_cases.read', 'View risk cases, including their timeline/evidence/decisions'),
  ('risk_cases', 'create', 'risk_cases.create', 'Open a new risk case'),
  ('risk_cases', 'update', 'risk_cases.update', 'Update a risk case''s title, summary, or category'),
  ('risk_cases', 'assign', 'risk_cases.assign', 'Assign or unassign a risk case'),
  ('risk_cases', 'status.update', 'risk_cases.status.update', 'Change a risk case''s investigation status'),
  ('risk_cases', 'severity.update', 'risk_cases.severity.update', 'Change a risk case''s severity'),
  ('risk_cases', 'resolve', 'risk_cases.resolve', 'Resolve a risk case'),
  ('risk_cases', 'close', 'risk_cases.close', 'Close a risk case'),
  ('risk_cases', 'add_note', 'risk_cases.add_note', 'Add an investigation note to a risk case'),
  ('risk_cases', 'add_evidence', 'risk_cases.add_evidence', 'Attach an evidence reference to a risk case'),
  ('risk_cases', 'decide', 'risk_cases.decide', 'Record an administrative decision on a risk case')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('risk_signals', 'risk_cases')
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('risk_signals', 'risk_cases')
WHERE r.name = 'Risk/Fraud Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('risk_signals.read', 'risk_cases.read')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'risk_cases.read'
WHERE r.name = 'Support Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('risk_signals.read', 'risk_cases.read')
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'risk_signals.read'
WHERE r.name = 'Engineering Admin'
ON CONFLICT DO NOTHING;
