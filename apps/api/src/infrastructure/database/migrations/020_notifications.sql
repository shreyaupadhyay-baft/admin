-- Phase: Notifications. A platform capability that consumes events from
-- existing modules (Security, Risk, Support, Approvals, Administration) — it
-- does not duplicate their business logic or become a second audit system.
-- audit_logs remains the authoritative compliance record; notifications are
-- user-facing operational signals with exactly two states (unread/read), not
-- a case/incident lifecycle.
--
-- No notification_events table: unlike a case, a notification has no
-- investigation timeline worth recording — that would just be a second audit
-- system in miniature, which section 13 of the spec explicitly forbids.
CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_admin_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  -- Mirrors constants/notificationTypes.ts NOTIFICATION_TYPES exactly, as a
  -- second line of defense (application code is the only writer — there is
  -- no public "create notification" API — but every other controlled-enum
  -- column in this schema also gets a matching CHECK).
  type                TEXT NOT NULL CHECK (type IN (
                        'security_case_assigned', 'security_action_requested', 'security_action_approved',
                        'security_action_rejected', 'risk_case_assigned', 'risk_case_status_changed',
                        'support_case_assigned', 'support_case_status_changed', 'approval_requested',
                        'approval_approved', 'approval_rejected', 'admin_account_disabled', 'admin_role_changed'
                      )),
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  status              TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  -- Points at the source resource for navigation only. Opening the linked
  -- resource still goes through that resource's own normal authorization —
  -- a notification is never itself a source of access.
  resource_type       TEXT,
  resource_id         TEXT,
  -- Producer-controlled, non-sensitive context only (e.g. previous/new
  -- status, case number) — never provider/KYC/card/credential data. Producers
  -- are internal service code, not client input.
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Deterministic "event type + source entity + recipient + occurrence" key,
  -- set by producers that need retry-safety. NULL for producers where every
  -- call is a legitimately distinct notification (so repeats never collide).
  dedup_key           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at             TIMESTAMPTZ
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_admin_id);
CREATE INDEX idx_notifications_recipient_status ON notifications (recipient_admin_id, status);
CREATE INDEX idx_notifications_recipient_created_at ON notifications (recipient_admin_id, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications (type);
CREATE INDEX idx_notifications_severity ON notifications (severity);

-- Dedup scope is per-recipient: the same underlying event fans out to
-- multiple recipients (e.g. every Security Admin sees "action requested"),
-- and each of those is a distinct, legitimate notification — only a retry of
-- the exact same (event, recipient) pair should collapse.
CREATE UNIQUE INDEX uq_notifications_recipient_dedup
  ON notifications (recipient_admin_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
