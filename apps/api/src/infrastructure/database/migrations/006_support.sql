-- Phase 1 vertical slice: Support (BAFT-owned resources only).
-- No Transcorp KYC, transactions, beneficiaries, cards, payment issues, or
-- disputes here. App Issues are the BAFT-side user-facing/product issue
-- domain, distinct from engineering's own issue tracker (not this table).

CREATE TABLE support_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject            TEXT NOT NULL,
  description        TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('account', 'technical', 'app_issue', 'other')),
  priority           TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_admin_id  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ
);

CREATE INDEX idx_support_cases_user_id ON support_cases (user_id);
CREATE INDEX idx_support_cases_status ON support_cases (status);
CREATE INDEX idx_support_cases_assigned_admin_id ON support_cases (assigned_admin_id);
CREATE INDEX idx_support_cases_created_at ON support_cases (created_at);

-- Case timeline/history, including Notes (event_type = NOTE_ADDED, body in
-- `note`). This is the visible case activity feed shown to support agents —
-- separate from the platform-wide `audit_logs` compliance trail, which every
-- mutation here also writes to via the existing audit.service.
CREATE TABLE support_case_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_case_id  UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  actor_admin_id   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'CASE_CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED',
                     'NOTE_ADDED', 'UPDATED', 'RESOLVED', 'CLOSED'
                   )),
  note             TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_case_events_case_id ON support_case_events (support_case_id, created_at);

CREATE TABLE app_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  source             TEXT NOT NULL CHECK (source IN ('IN_APP', 'USER_REPORTED')),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  assigned_admin_id  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX idx_app_issues_user_id ON app_issues (user_id);
CREATE INDEX idx_app_issues_status ON app_issues (status);
CREATE INDEX idx_app_issues_source ON app_issues (source);
CREATE INDEX idx_app_issues_assigned_admin_id ON app_issues (assigned_admin_id);
