-- Seeds permissions for the new Users + Devices resources and maps them onto
-- existing roles. Mirrors the IA: each resource splits into a base read/write
-- pair (Profile / Linked User) plus a distinct status read/write pair
-- (Status), so a role can see/change one without the other.
--
-- Role justification (least privilege, not "grant everything"):
--   Super Admin      -> everything (below).
--   Auditor          -> full read (profile + status) on both resources, no writes.
--   Operations Admin -> owns day-to-day user/device operations -> full read+write.
--   Support Admin    -> needs full read to assist users, but escalates any
--                       account/device change to Operations -> read only.
--   Risk/Fraud Admin -> freezes accounts and blocks devices -> read + status
--                       writes only, not profile edits or device relinking.
--   Product/Growth   -> looks at user profiles for segmentation, nothing else
--                       -> users.read only.
--   Engineering Admin-> needs basic lookup access while debugging -> read
--                       only on both resources, no status detail.
--   Security Admin   -> owns ADMIN identity/access, not BAFT end-user
--                       accounts; kept out to avoid scope overlap with Risk.

INSERT INTO permissions (resource, action, key, description) VALUES
  ('users', 'read', 'users.read', 'View user profiles'),
  ('users', 'create', 'users.create', 'Create user accounts'),
  ('users', 'update', 'users.update', 'Update a user profile'),
  ('users', 'status.read', 'users.status.read', 'View a user''s account status'),
  ('users', 'status.update', 'users.status.update', 'Change a user''s account status'),
  ('devices', 'read', 'devices.read', 'View devices and their linked user'),
  ('devices', 'update', 'devices.update', 'Relink a device to a different user'),
  ('devices', 'status.read', 'devices.status.read', 'View a device''s status'),
  ('devices', 'status.update', 'devices.status.update', 'Change a device''s status')
ON CONFLICT (key) DO NOTHING;

-- Super Admin: every permission, including ones added after its original seed.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('users', 'devices')
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('users.read', 'users.status.read', 'devices.read', 'devices.status.read')
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('users', 'devices')
WHERE r.name = 'Operations Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('users.read', 'users.status.read', 'devices.read', 'devices.status.read')
WHERE r.name = 'Support Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'users.read', 'users.status.read', 'users.status.update',
  'devices.read', 'devices.status.read', 'devices.status.update'
)
WHERE r.name = 'Risk/Fraud Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key = 'users.read'
WHERE r.name = 'Product/Growth Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('users.read', 'devices.read')
WHERE r.name = 'Engineering Admin'
ON CONFLICT DO NOTHING;
