-- Phase 1 vertical slice: Risk & Fraud (BAFT-side investigation layer only).
-- This is not a transaction/card fraud engine, a transaction ledger, a KYC
-- system, or a payment processor — those are Transcorp-owned. Provider
-- signals are referenced as external evidence (source + external_reference +
-- metadata), never copied in as duplicated provider records.
--
-- Conceptual flow: Signal -> Risk Indicator (category/severity on the
-- signal itself) -> Risk Case (investigation container) -> Investigation
-- (notes/evidence on the case) -> Decision/Action (recorded outcome).
-- Creating a case from a signal is a deliberate admin action in this slice,
-- not an automatic reaction to every signal.

CREATE SEQUENCE risk_case_number_seq START 1;

-- Shared taxonomy for both signals and cases (a case's category need not
-- match its originating signal's category verbatim, but draws from the same
-- BAFT risk taxonomy).
CREATE TABLE risk_signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type         TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN (
                        'account_identity', 'authentication_security', 'fraud', 'transaction_payment',
                        'device', 'behavioral', 'integration_provider', 'operational', 'system_technical',
                        'privacy_data', 'ai_model'
                      )),
  severity            TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'dismissed', 'escalated')),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  external_reference  TEXT,
  description         TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_signals_category ON risk_signals (category);
CREATE INDEX idx_risk_signals_severity ON risk_signals (severity);
CREATE INDEX idx_risk_signals_status ON risk_signals (status);
CREATE INDEX idx_risk_signals_source ON risk_signals (source);
CREATE INDEX idx_risk_signals_user_id ON risk_signals (user_id);
CREATE INDEX idx_risk_signals_detected_at ON risk_signals (detected_at);

CREATE TABLE risk_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number        TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN (
                       'account_identity', 'authentication_security', 'fraud', 'transaction_payment',
                       'device', 'behavioral', 'integration_provider', 'operational', 'system_technical',
                       'privacy_data', 'ai_model'
                     )),
  -- Severity (impact if true) and status (investigation stage) are tracked
  -- and transitioned independently — severity is never inferred from status,
  -- and neither one is a proxy for confidence in the finding.
  severity           TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'investigating', 'resolved', 'closed')),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_admin_id  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  summary            TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT 'manual',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ
);

CREATE INDEX idx_risk_cases_status ON risk_cases (status);
CREATE INDEX idx_risk_cases_severity ON risk_cases (severity);
CREATE INDEX idx_risk_cases_category ON risk_cases (category);
CREATE INDEX idx_risk_cases_user_id ON risk_cases (user_id);
CREATE INDEX idx_risk_cases_assigned_admin_id ON risk_cases (assigned_admin_id);
CREATE INDEX idx_risk_cases_created_at ON risk_cases (created_at);

-- Investigation timeline (Notes live here as NOTE_ADDED events, same pattern
-- as support_case_events). Separate from the platform-wide `audit_logs`
-- compliance trail, which every mutation here also writes to.
CREATE TABLE risk_case_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_case_id   UUID NOT NULL REFERENCES risk_cases(id) ON DELETE CASCADE,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_UNASSIGNED', 'STATUS_CHANGED', 'SEVERITY_CHANGED',
                   'NOTE_ADDED', 'EVIDENCE_ADDED', 'DECISION_RECORDED', 'CASE_RESOLVED', 'CASE_CLOSED'
                 )),
  note           TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_case_events_case_id ON risk_case_events (risk_case_id, created_at);

-- References to evidence, never copies of provider-owned records. A row
-- here points at a signal/event/external system; it does not duplicate a
-- transaction, KYC document, or card record.
CREATE TABLE risk_case_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES risk_cases(id) ON DELETE CASCADE,
  evidence_type       TEXT NOT NULL CHECK (evidence_type IN (
                        'risk_signal', 'provider_signal', 'device_signal', 'system_signal',
                        'security_event', 'behavioral_signal', 'manual_note', 'external_reference'
                      )),
  source              TEXT NOT NULL,
  external_reference  TEXT,
  description         TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID NOT NULL REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_case_evidence_case_id ON risk_case_evidence (case_id, created_at);

-- Records BAFT's administrative decision only. Does not itself trigger an
-- irreversible external provider action — that would require an explicit,
-- separately-scoped integration this phase does not build.
CREATE TABLE risk_case_decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES risk_cases(id) ON DELETE CASCADE,
  decision    TEXT NOT NULL CHECK (decision IN ('no_action', 'monitor', 'restrict_account', 'escalate', 'close_case')),
  reason      TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES admin_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_case_decisions_case_id ON risk_case_decisions (case_id, created_at);
