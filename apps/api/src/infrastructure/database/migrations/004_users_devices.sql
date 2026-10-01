-- Phase 1 vertical slice: Users + Devices (BAFT-owned resources only).
-- No KYC documents, transaction history, beneficiary data, or card records
-- here — those belong to the Transcorp integration domain, implemented
-- separately. `external_ref` is only a placeholder linkage boundary for that
-- future integration; it is never populated with provider data in this phase.

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE,
  email        TEXT NOT NULL UNIQUE,
  phone_number TEXT UNIQUE,
  full_name    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_created_at ON users (created_at);

-- A device's "Linked User" (user_id) and "Status" are the two IA sub-items,
-- and are intentionally gated by distinct permissions (devices.update vs.
-- devices.status.update) at the API layer.
CREATE TABLE devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_ref     TEXT NOT NULL UNIQUE,
  platform       TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id ON devices (user_id);
CREATE INDEX idx_devices_status ON devices (status);
