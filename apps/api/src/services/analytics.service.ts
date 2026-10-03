import { PERMISSIONS } from "../constants/permissions.js";
import * as repo from "../repositories/analytics.repository.js";
import type { BreakdownRow, SeriesPoint } from "../repositories/analytics.repository.js";
import type { Granularity, ResolvedRange } from "../utils/dateRange.js";

/**
 * Analytics = read-only aggregation over BAFT-owned tables. No provider (Transcorp) data is read,
 * mirrored or inferred. Every metric carries an explicit definition and scope; anything the schema
 * cannot support is returned as `unavailable` with a reason — never as a zero.
 *
 * Source mapping: see src/analytics/README.md.
 */

/** User/device-derived breakdown cells smaller than this are suppressed (value: null) to avoid singling out individuals. */
export const MIN_GROUP_SIZE = 5;

/**
 * range            → rows whose timestamp is inside the selected [from, to] UTC days.
 * as_of_range_end  → rows that existed before the end of the selected range (cumulative).
 * snapshot         → the CURRENT state (statuses have no history), independent of the selected range.
 */
export type MetricScope = "range" | "as_of_range_end" | "snapshot";

export interface Metric {
  key: string;
  label: string;
  definition: string;
  unit: "count" | "percent";
  scope: MetricScope;
  /** null = not computable (e.g. zero denominator) — never a fabricated 0. */
  value: number | null;
  nullReason?: "zero_denominator";
}
export interface Series {
  key: string;
  title: string;
  definition: string;
  unit: "count";
  granularity: Granularity;
  points: SeriesPoint[];
}
export interface BreakdownItem {
  key: string;
  value: number | null;
  suppressed?: true;
}
export interface Breakdown {
  key: string;
  title: string;
  definition: string;
  unit: "count";
  scope: MetricScope;
  items: BreakdownItem[];
  suppressionThreshold?: number;
}
export interface Unavailable {
  key: string;
  label: string;
  reason: string;
  /** The data source that would have to exist for this metric to be computed. */
  requires: string;
}
export interface AnalyticsSection {
  section: "overview" | "onboarding" | "features" | "retention" | "usage" | "rewards" | "financial";
  range: Omit<ResolvedRange, "start" | "endExclusive"> & { start: string; endExclusive: string };
  generatedAt: string;
  /** unavailable = nothing in this section can be computed from BAFT-owned data today. */
  availability: "available" | "partial" | "unavailable";
  summary?: string;
  metrics: Metric[];
  series: Series[];
  breakdowns: Breakdown[];
  unavailable: Unavailable[];
}

const NO_CUSTOMER_ACTIVITY =
  "BAFT does not yet record end-customer activity events. Admin portal requests are not customer usage, devices.last_seen_at has no writer in this system and only holds the latest value, and user_sessions is only a revoke marker.";
const CUSTOMER_ACTIVITY_SOURCE = "A BAFT-owned customer activity/event stream (user id, event type, timestamp) written by the mobile app or its backend.";
const PROVIDER_FINANCIAL_SOURCE = "An authorized Transcorp transaction/settlement feed or a BAFT-owned financial aggregate dataset. Neither is connected.";

const baseSection = (section: AnalyticsSection["section"], range: ResolvedRange): AnalyticsSection => ({
  section,
  range: { ...range, start: range.start.toISOString(), endExclusive: range.endExclusive.toISOString() },
  generatedAt: new Date().toISOString(),
  availability: "available",
  metrics: [],
  series: [],
  breakdowns: [],
  unavailable: [],
});

const count = (key: string, label: string, scope: MetricScope, value: number, definition: string): Metric => ({
  key,
  label,
  definition,
  unit: "count",
  scope,
  value,
});
const percent = (key: string, label: string, scope: MetricScope, numerator: number, denominator: number, definition: string): Metric =>
  denominator === 0
    ? { key, label, definition, unit: "percent", scope, value: null, nullReason: "zero_denominator" }
    : { key, label, definition, unit: "percent", scope, value: Math.round((numerator / denominator) * 1000) / 10 };

const series = (key: string, title: string, definition: string, range: ResolvedRange, points: SeriesPoint[]): Series => ({
  key,
  title,
  definition,
  unit: "count",
  granularity: range.granularity,
  points,
});

const breakdown = (
  key: string,
  title: string,
  definition: string,
  scope: MetricScope,
  rows: BreakdownRow[],
  suppress: boolean,
): Breakdown => ({
  key,
  title,
  definition,
  unit: "count",
  scope,
  items: rows.map((r) =>
    suppress && r.value < MIN_GROUP_SIZE ? { key: r.key, value: null, suppressed: true as const } : { key: r.key, value: r.value },
  ),
  ...(suppress ? { suppressionThreshold: MIN_GROUP_SIZE } : {}),
});

// ───────────────────────── Overview ─────────────────────────

export const getOverview = async (range: ResolvedRange, permissions: readonly string[]): Promise<AnalyticsSection> => {
  const has = (p: string) => permissions.includes(p);
  const out = baseSection("overview", range);
  const canRisk = has(PERMISSIONS.RISK_CASES_READ);
  const canSecurity = has(PERMISSIONS.SECURITY_CASES_READ);

  const [users, devices, support, appIssues, campaigns, rewards, risk, security, newUsers, supportSeries, issueSeries] = await Promise.all([
    repo.getUserCounts(range),
    repo.getDeviceCounts(range),
    repo.getSupportCaseCounts(range),
    repo.getAppIssueCounts(range),
    repo.getCampaignCounts(range),
    repo.getRewardCounts(range),
    canRisk ? repo.getCaseCounts("risk_cases", range) : Promise.resolve(null),
    canSecurity ? repo.getCaseCounts("security_cases", range) : Promise.resolve(null),
    repo.getSeries("users", range),
    repo.getSeries("support_cases", range),
    repo.getSeries("app_issues", range),
  ]);

  out.metrics.push(
    count("users_total", "Total users", "as_of_range_end", users.totalAsOfEnd, "BAFT users created before the end of the selected range."),
    count("users_new", "New users", "range", users.newInRange, "BAFT users whose created_at falls inside the selected range."),
    count(
      "users_active_status",
      "Active-status accounts",
      "snapshot",
      users.activeStatusNow,
      "Users whose account status is currently 'active'. This is an account flag, not a measure of customer activity.",
    ),
    percent(
      "device_adoption",
      "Device adoption",
      "as_of_range_end",
      devices.usersWithDeviceAsOfEnd,
      users.totalAsOfEnd,
      "Users with at least one registered device, divided by total users, both as of the end of the range.",
    ),
    count("devices_registered", "Devices registered", "range", devices.registeredInRange, "Devices whose first_seen_at falls inside the selected range."),
    count("support_cases_created", "Support cases created", "range", support.createdInRange, "Support cases created inside the selected range."),
    count("support_cases_open", "Open support cases", "snapshot", support.openNow, "Support cases currently open or in progress."),
    count("app_issues_created", "App issues created", "range", appIssues.createdInRange, "App issues created inside the selected range."),
    count("app_issues_open", "Open app issues", "snapshot", appIssues.openNow, "App issues currently open or in progress."),
    count("campaigns_created", "Campaigns created", "range", campaigns.createdInRange, "Campaigns created inside the selected range."),
    count("campaigns_active", "Active campaigns", "snapshot", campaigns.activeNow, "Campaigns whose status is currently 'active'."),
    count("rewards_created", "Rewards created", "range", rewards.createdInRange, "Rewards created inside the selected range."),
    count("rewards_active", "Active rewards", "snapshot", rewards.activeNow, "Rewards whose status is currently 'active'."),
  );
  if (risk) {
    out.metrics.push(
      count("risk_cases_created", "Risk cases created", "range", risk.createdInRange, "Risk cases created inside the selected range."),
      count("risk_cases_open", "Open risk cases", "snapshot", risk.openNow, "Risk cases not yet resolved or closed."),
    );
  }
  if (security) {
    out.metrics.push(
      count("security_cases_created", "Security cases created", "range", security.createdInRange, "Security cases created inside the selected range."),
      count("security_cases_open", "Open security cases", "snapshot", security.openNow, "Security cases not yet resolved or closed."),
    );
  }

  out.series.push(
    series("users_new", "New users", "Users created per period.", range, newUsers),
    series("support_cases_created", "Support cases created", "Support cases created per period.", range, supportSeries),
    series("app_issues_created", "App issues created", "App issues created per period.", range, issueSeries),
  );

  out.unavailable.push(
    {
      key: "users_active",
      label: "Active users",
      reason: NO_CUSTOMER_ACTIVITY,
      requires: CUSTOMER_ACTIVITY_SOURCE,
    },
    {
      key: "activation_rate",
      label: "User activation rate",
      reason: "The schema has no defensible activation signal (e.g. first successful action), so activation is not inferred.",
      requires: CUSTOMER_ACTIVITY_SOURCE,
    },
  );
  out.availability = "partial";
  return out;
};

// ───────────────────────── Onboarding ─────────────────────────

export const getOnboarding = async (range: ResolvedRange): Promise<AnalyticsSection> => {
  const out = baseSection("onboarding", range);
  const [onb, newUsers, byStatus] = await Promise.all([
    repo.getOnboardingCounts(range),
    repo.getSeries("users", range),
    repo.getBreakdown("users.status", range),
  ]);
  out.metrics.push(
    count("users_created", "Users created", "range", onb.usersCreated, "BAFT users whose created_at falls inside the selected range."),
    count(
      "users_created_with_device",
      "Created users with a device",
      "range",
      onb.withDevice,
      "Users created in the range who have at least one registered device by the end of the range.",
    ),
    percent(
      "device_registration_rate",
      "Device registration rate",
      "range",
      onb.withDevice,
      onb.usersCreated,
      "Created users with a registered device divided by users created in the range. This is device registration only, not activation.",
    ),
  );
  out.series.push(series("users_created", "Users created", "Users created per period.", range, newUsers));
  out.breakdowns.push(
    breakdown(
      "users_by_status",
      "Users created by account status",
      "Users created in the range grouped by their CURRENT account status (status has no history). Groups under the minimum size are hidden.",
      "range",
      byStatus,
      true,
    ),
  );
  out.unavailable.push(
    {
      key: "activation_rate",
      label: "Activation rate",
      reason: "The schema has no activation signal; activation is not inferred from device registration or admin activity.",
      requires: CUSTOMER_ACTIVITY_SOURCE,
    },
    {
      key: "onboarding_funnel",
      label: "Onboarding funnel stages",
      reason: "BAFT does not store onboarding stages (e.g. phone verified, KYC submitted, first login). KYC state is Transcorp-owned and is not used.",
      requires: "BAFT-owned onboarding stage timestamps per user.",
    },
    {
      key: "users_inactive_by_activity",
      label: "Inactive users (by activity)",
      reason: NO_CUSTOMER_ACTIVITY,
      requires: CUSTOMER_ACTIVITY_SOURCE,
    },
  );
  out.availability = "partial";
  return out;
};

// ───────────────────────── Feature usage / Retention (no source) ─────────────────────────

export const getFeatureUsage = (range: ResolvedRange): AnalyticsSection => {
  const out = baseSection("features", range);
  out.availability = "unavailable";
  out.summary = "Feature usage data unavailable.";
  out.unavailable.push(
    ...["Feature usage count", "Unique users per feature", "Feature usage trend", "Feature distribution"].map((label) => ({
      key: label.toLowerCase().replace(/[^a-z]+/g, "_"),
      label,
      reason: "BAFT does not yet record customer feature events. Admin API requests and page views are not customer feature usage.",
      requires: "A BAFT-owned feature-event stream (user id, feature key, timestamp).",
    })),
  );
  return out;
};

export const getRetention = (range: ResolvedRange): AnalyticsSection => {
  const out = baseSection("retention", range);
  out.availability = "unavailable";
  out.summary = "Retention cannot be calculated: there is no customer activity source to define 'retained'.";
  out.unavailable.push(
    {
      key: "cohort_retention",
      label: "Cohort retention",
      reason: `Cohorts (users by created_at) are available, but retention needs a defined later activity per user. ${NO_CUSTOMER_ACTIVITY}`,
      requires: CUSTOMER_ACTIVITY_SOURCE,
    },
    { key: "retained_users", label: "Retained users", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
    { key: "retention_percentage", label: "Retention percentage", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
  );
  return out;
};

// ───────────────────────── BAFT usage ─────────────────────────

export const getUsage = async (range: ResolvedRange): Promise<AnalyticsSection> => {
  const out = baseSection("usage", range);
  const [devices, newDevices, byPlatform, byStatus] = await Promise.all([
    repo.getDeviceCounts(range),
    repo.getSeries("devices", range),
    repo.getBreakdown("devices.platform", range),
    repo.getBreakdown("devices.status", range),
  ]);
  // Device INVENTORY (registered devices) — explicitly not usage.
  out.metrics.push(
    count("devices_total", "Registered devices", "as_of_range_end", devices.totalAsOfEnd, "Devices registered (first_seen_at) before the end of the range. A device inventory count, not usage."),
    count("devices_registered", "Devices registered in range", "range", devices.registeredInRange, "Devices whose first_seen_at falls inside the selected range."),
  );
  out.series.push(series("devices_registered", "Devices registered", "Devices first seen per period.", range, newDevices));
  out.breakdowns.push(
    breakdown("devices_by_platform", "Registered devices by platform", "Devices registered before the end of the range, by platform. Groups under the minimum size are hidden.", "as_of_range_end", byPlatform, true),
    breakdown("devices_by_status", "Registered devices by current status", "Devices registered before the end of the range, grouped by their CURRENT status. Groups under the minimum size are hidden.", "as_of_range_end", byStatus, true),
  );
  out.unavailable.push(
    { key: "active_users", label: "Active users", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
    { key: "active_devices", label: "Active devices (by activity)", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
    { key: "usage_frequency", label: "Usage frequency", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
    { key: "activity_trend", label: "Activity trend", reason: NO_CUSTOMER_ACTIVITY, requires: CUSTOMER_ACTIVITY_SOURCE },
  );
  out.availability = "partial";
  return out;
};

// ───────────────────────── Rewards ─────────────────────────

export const getRewardsAnalytics = async (range: ResolvedRange): Promise<AnalyticsSection> => {
  const out = baseSection("rewards", range);
  const [rewards, campaigns, rewardSeries, campaignSeries, rByType, rByStatus, cByType, cByStatus] = await Promise.all([
    repo.getRewardCounts(range),
    repo.getCampaignCounts(range),
    repo.getSeries("rewards", range),
    repo.getSeries("campaigns", range),
    repo.getBreakdown("rewards.reward_type", range),
    repo.getBreakdown("rewards.status", range),
    repo.getBreakdown("campaigns.campaign_type", range),
    repo.getBreakdown("campaigns.status", range),
  ]);
  out.metrics.push(
    count("rewards_created", "Rewards created", "range", rewards.createdInRange, "Reward definitions created inside the selected range."),
    count("rewards_active", "Active rewards", "snapshot", rewards.activeNow, "Rewards whose status is currently 'active'."),
    count("rewards_paused", "Paused rewards", "snapshot", rewards.pausedNow, "Rewards whose status is currently 'paused'."),
    count("rewards_expired", "Expired rewards", "snapshot", rewards.expiredNow, "Rewards whose status is currently 'expired'."),
    count("campaigns_created", "Campaigns created", "range", campaigns.createdInRange, "Campaigns created inside the selected range."),
    count("campaigns_active", "Active campaigns", "snapshot", campaigns.activeNow, "Campaigns whose status is currently 'active'."),
    count("campaigns_completed", "Completed campaigns", "snapshot", campaigns.completedNow, "Campaigns whose status is currently 'completed'."),
  );
  out.series.push(
    series("rewards_created", "Rewards created", "Reward definitions created per period.", range, rewardSeries),
    series("campaigns_created", "Campaigns created", "Campaigns created per period.", range, campaignSeries),
  );
  const note = "Grouped by the CURRENT value; only items created in the range are counted.";
  out.breakdowns.push(
    breakdown("rewards_by_type", "Rewards created by type", `Reward definitions created in the range. ${note}`, "range", rByType, false),
    breakdown("rewards_by_status", "Rewards created by current status", `Reward definitions created in the range. ${note}`, "range", rByStatus, false),
    breakdown("campaigns_by_type", "Campaigns created by type", `Campaigns created in the range. ${note}`, "range", cByType, false),
    breakdown("campaigns_by_status", "Campaigns created by current status", `Campaigns created in the range. ${note}`, "range", cByStatus, false),
  );
  const noGrants = "BAFT stores reward and campaign definitions only. Entitlement checks are computed on demand and no grant, redemption or payout record exists.";
  out.unavailable.push(
    { key: "entitlement_evaluations", label: "Entitlement evaluations", reason: "Evaluations are computed on demand and not stored, so they cannot be counted.", requires: "A BAFT-owned log of entitlement evaluations." },
    { key: "rewards_redeemed", label: "Redeemed rewards", reason: noGrants, requires: "A BAFT-owned reward grant/redemption ledger." },
    { key: "redemption_rate", label: "Reward redemption rate", reason: noGrants, requires: "A BAFT-owned reward grant/redemption ledger." },
    { key: "reward_payouts", label: "Total reward payouts", reason: noGrants, requires: "A BAFT-owned reward grant/redemption ledger." },
    { key: "user_reward_history", label: "User reward history", reason: noGrants, requires: "A BAFT-owned reward grant/redemption ledger." },
  );
  out.availability = "partial";
  return out;
};

// ───────────────────────── Financial ─────────────────────────

export const getFinancial = (range: ResolvedRange): AnalyticsSection => {
  const out = baseSection("financial", range);
  out.availability = "unavailable";
  out.summary = "Financial analytics are not currently available: provider-owned transaction data is not connected, and BAFT owns no financial aggregate dataset.";
  out.unavailable.push(
    ...[
      ["transaction_volume", "Transaction volume"],
      ["transaction_value", "Transaction value"],
      ["card_spend", "Card spend"],
      ["merchant_spend", "Merchant spend"],
      ["balances", "Balances"],
      ["settlement", "Settlement"],
      ["transaction_revenue", "Revenue from transactions"],
    ].map(([key, label]) => ({
      key: key!,
      label: label!,
      reason: "Provider-owned data is not connected to BAFT Admin, and BAFT does not mirror it.",
      requires: PROVIDER_FINANCIAL_SOURCE,
    })),
  );
  return out;
};
