-- Phase 1 vertical slice: Campaigns (BAFT-owned resource only).
-- No KYC, beneficiary, transaction, card, or payment-processing data here.
-- Where eligibility needs provider/transaction context, it is modeled as a
-- structured reference condition inside targeting_definition (JSONB), never
-- as a duplicated provider-owned record.

CREATE TABLE campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  campaign_type         TEXT NOT NULL CHECK (campaign_type IN ('promotional', 'referral', 'retention', 'reengagement', 'other')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
  start_at              TIMESTAMPTZ,
  end_at                TIMESTAMPTZ,
  audience_definition   JSONB NOT NULL DEFAULT '{}'::jsonb,
  targeting_definition  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            UUID NOT NULL REFERENCES admin_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaigns_end_after_start CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_campaign_type ON campaigns (campaign_type);
CREATE INDEX idx_campaigns_created_at ON campaigns (created_at);
