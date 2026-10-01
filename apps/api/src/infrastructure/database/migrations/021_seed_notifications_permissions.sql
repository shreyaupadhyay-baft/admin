-- Seeds Notifications permissions.
--
-- Unlike every prior module, notifications are a personal inbox, not a
-- shared resource — every admin, regardless of role, should be able to see
-- and manage their OWN notification stream (the backend already scopes every
-- query to the authenticated admin; see notification.controller.ts). So
-- these three permissions are granted to every existing role, not mapped to
-- a subset like other modules' permissions are. This is deliberate, not an
-- oversight: reading a notification never grants access to the resource it
-- links to (that resource's own permission is re-checked independently), so
-- there is no privilege-escalation surface in granting this broadly.
--
-- `notifications.read_unread_count` from the suggested vocabulary was NOT
-- added: the unread-count endpoint returns a count over the exact same
-- recipient-scoped rows `notifications.read` already governs, so a second
-- permission would gate nothing that the first doesn't already cover
-- ("least privilege", not "most permissions").
INSERT INTO permissions (resource, action, key, description) VALUES
  ('notifications', 'read', 'notifications.read', 'View your own notifications and unread count'),
  ('notifications', 'mark_read', 'notifications.mark_read', 'Mark one of your own notifications as read'),
  ('notifications', 'mark_all_read', 'notifications.mark_all_read', 'Mark all of your own notifications as read')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE p.resource = 'notifications'
ON CONFLICT DO NOTHING;
