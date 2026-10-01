-- Phase 1 vertical slice: Rewards (BAFT-owned reward rules only).
-- No card/payment/ledger data here. `rule_definition` is a structured,
-- evolvable eligibility rule evaluated against BAFT-owned user fields —
-- never a record of an actual disbursement or provider transaction.
-- "User entitlement" (see IA) is a read-only evaluation of this rule against
-- a user, not a stored grant/redemption record.

CREATE TABLE rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  reward_type      TEXT NOT NULL CHECK (reward_type IN ('cashback', 'points', 'voucher', 'fee_waiver', 'bonus')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'expired', 'cancelled')),
  rule_definition  JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES admin_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rewards_valid_until_after_from CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX idx_rewards_status ON rewards (status);
CREATE INDEX idx_rewards_reward_type ON rewards (reward_type);
CREATE INDEX idx_rewards_created_at ON rewards (created_at);
