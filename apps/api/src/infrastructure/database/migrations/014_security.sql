-- Phase 1 vertical slice: Security (BAFT-side security operations layer).
-- No KYC, beneficiary, transaction, card, or payment-security records here —
-- those are Transcorp-owned. Provider events are referenced as evidence
-- (source + external_reference + metadata), never copied in.
--
-- security_actions has no case_id: it is a standalone maker-checker ledger,
-- not case-scoped, per the given field list. ACTION_REQUESTED/APPROVED/
-- REJECTED remain valid security_case_events values for forward-compatibility
-- with a future case-linked action, but no code path in this slice emits
-- them, since actions aren't linked to cases yet.

-- BAFT-side security status, independent of the general account status
-- (active/suspended/disabled) already on `users`. Only the security action
-- workflow (this migration's security_actions table) may change it — never
-- the general users.update/status endpoints.
ALTER TABLE users ADD COLUMN security_status TEXT NOT NULL DEFAULT 'normal' CHECK (security_status IN ('normal', 'blocked'));
CREATE INDEX idx_users_security_status ON users (security_status);

-- This Admin backend has no end-user login/session API of its own — BAFT
-- end users authenticate through the mobile app, not this panel. To give
-- force-logout/revoke-sessions something concrete and BAFT-owned to act on
-- without redesigning end-user authentication (explicitly out of scope),
-- this is a minimal session marker, not a token/credential store. It never
-- attempts to revoke a Transcorp/provider-side session.
CREATE TABLE user_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   UUID REFERENCES devices(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id, status);

CREATE SEQUENCE security_case_number_seq START 1;

CREATE TABLE security_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN (
                        'authentication', 'account', 'device', 'access', 'session',
                        'api', 'integration', 'privacy', 'configuration', 'system'
                      )),
  severity            TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'dismissed', 'escalated')),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id           UUID REFERENCES devices(id) ON DELETE SET NULL,
  external_reference  TEXT,
  description         TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_category ON security_events (category);
CREATE INDEX idx_security_events_severity ON security_events (severity);
CREATE INDEX idx_security_events_status ON security_events (status);
CREATE INDEX idx_security_events_source ON security_events (source);
CREATE INDEX idx_security_events_user_id ON security_events (user_id);
CREATE INDEX idx_security_events_device_id ON security_events (device_id);
CREATE INDEX idx_security_events_detected_at ON security_events (detected_at);

CREATE TABLE security_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number        TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN (
                       'authentication', 'account', 'device', 'access', 'session',
                       'api', 'integration', 'privacy', 'configuration', 'system'
                     )),
  -- Severity (impact) and status (investigation stage) are transitioned
  -- independently — never combine severity with event/finding confidence.
  severity           TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'investigating', 'resolved', 'closed')),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id          UUID REFERENCES devices(id) ON DELETE SET NULL,
  assigned_admin_id  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  summary            TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT 'manual',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ
);

CREATE INDEX idx_security_cases_status ON security_cases (status);
CREATE INDEX idx_security_cases_severity ON security_cases (severity);
CREATE INDEX idx_security_cases_category ON security_cases (category);
CREATE INDEX idx_security_cases_user_id ON security_cases (user_id);
CREATE INDEX idx_security_cases_assigned_admin_id ON security_cases (assigned_admin_id);
CREATE INDEX idx_security_cases_created_at ON security_cases (created_at);

CREATE TABLE security_case_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_case_id   UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  actor_admin_id     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN (
                       'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_UNASSIGNED', 'STATUS_CHANGED', 'SEVERITY_CHANGED',
                       'NOTE_ADDED', 'EVIDENCE_ADDED', 'ACTION_REQUESTED', 'ACTION_APPROVED', 'ACTION_REJECTED',
                       'CASE_RESOLVED', 'CASE_CLOSED'
                     )),
  note               TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_case_events_case_id ON security_case_events (security_case_id, created_at);

CREATE TABLE security_case_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  evidence_type       TEXT NOT NULL CHECK (evidence_type IN (
                        'security_event', 'device_signal', 'authentication_event', 'configuration_event',
                        'system_signal', 'provider_signal', 'manual_note', 'external_reference'
                      )),
  source              TEXT NOT NULL,
  external_reference  TEXT,
  description         TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID NOT NULL REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_case_evidence_case_id ON security_case_evidence (case_id, created_at);

-- Maker-checker ledger for high-blast-radius account actions. block_user and
-- unblock_user must go through requested -> approved -> executed (or
-- -> rejected); force_logout and revoke_sessions execute immediately
-- (status jumps straight to 'executed', approved_by stays NULL) since they
-- carry lower risk and are reversible session-level operations, not account
-- state changes. The requester-cannot-approve-own-action rule is enforced in
-- application code AND at the database level as a second line of defense.
CREATE TABLE security_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type    TEXT NOT NULL CHECK (action_type IN ('block_user', 'unblock_user', 'force_logout', 'revoke_sessions')),
  status         TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'executed')),
  reason         TEXT NOT NULL,
  requested_by   UUID NOT NULL REFERENCES admin_users(id),
  approved_by    UUID REFERENCES admin_users(id),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at    TIMESTAMPTZ,
  executed_at    TIMESTAMPTZ,
  rejected_at    TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT security_actions_requester_not_approver CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE INDEX idx_security_actions_user_id ON security_actions (user_id);
CREATE INDEX idx_security_actions_action_type ON security_actions (action_type);
CREATE INDEX idx_security_actions_status ON security_actions (status);
CREATE INDEX idx_security_actions_requested_at ON security_actions (requested_at);
