-- Generic Admin Approvals: a reusable maker-checker foundation, NOT a
-- replacement for Security's existing block_user/unblock_user flow
-- (security_actions), which stays exactly as it is. This is additive
-- infrastructure future modules can register into via a controlled action
-- registry (see services/approvalAction.registry.ts) — resourceType/
-- resourceId/actionType are plain text, validated against that registry at
-- the application layer, not database-enforced business rules.

CREATE SEQUENCE approval_number_seq START 1;

CREATE TABLE approvals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_number    TEXT NOT NULL UNIQUE,
  action_type        TEXT NOT NULL,
  resource_type      TEXT NOT NULL,
  resource_id        TEXT NOT NULL,
  requested_by       UUID NOT NULL REFERENCES admin_users(id),
  approver_admin_id  UUID REFERENCES admin_users(id),
  status             TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled', 'expired')),
  reason             TEXT NOT NULL,
  rejection_reason   TEXT,
  request_metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- NULL until a decision is made; 'executed'/'failed' only apply to actions
  -- whose registered handler actually performs a side effect on approval.
  execution_status   TEXT CHECK (execution_status IN ('executed', 'failed')),
  execution_result   JSONB,
  idempotency_key    TEXT UNIQUE,
  request_id         TEXT,
  correlation_id     TEXT,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at        TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  expired_at         TIMESTAMPTZ,
  executed_at        TIMESTAMPTZ,
  -- Same defense-in-depth pattern as security_actions: the requester-cannot-
  -- approve-own-request rule is enforced in application code AND here.
  CONSTRAINT approvals_requester_not_approver CHECK (approver_admin_id IS NULL OR approver_admin_id <> requested_by)
);

CREATE INDEX idx_approvals_status ON approvals (status);
CREATE INDEX idx_approvals_requested_by ON approvals (requested_by);
CREATE INDEX idx_approvals_approver_admin_id ON approvals (approver_admin_id);
CREATE INDEX idx_approvals_action_type ON approvals (action_type);
CREATE INDEX idx_approvals_resource ON approvals (resource_type, resource_id);
CREATE INDEX idx_approvals_requested_at ON approvals (requested_at);

-- Approval-specific timeline, separate from the platform-wide audit_logs
-- compliance trail (every mutation below also writes there) — same split
-- Security uses between security_case_events and audit_logs.
CREATE TABLE approval_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id    UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'CREATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED',
                   'EXECUTED', 'EXECUTION_FAILED'
                 )),
  note           TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_events_approval_id ON approval_events (approval_id, created_at);
