import { pool } from "../infrastructure/database/pool.js";

// Every function here is a single grouped aggregation (COUNT ... FILTER),
// never a loop of one-count-per-status queries, and every section's fetch
// runs in parallel via Promise.all in the controller. This file exists so
// the dashboard's read-only aggregations live in one place rather than
// scattered across eight existing modules' repository files — nothing here
// duplicates or reimplements those modules' business rules, it only reads
// their tables.

export type UserOverview = { total: number; active: number; recentlyCreated: number };
export const getUserOverview = async (since: Date): Promise<UserOverview> => {
  const { rows } = await pool.query<{ total: string; active: string; recently_created: string }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE created_at >= $1)::int AS recently_created
     FROM users`,
    [since],
  );
  const row = rows[0]!;
  return { total: Number(row.total), active: Number(row.active), recentlyCreated: Number(row.recently_created) };
};

export type DeviceOverview = { total: number; active: number };
export const getDeviceOverview = async (): Promise<DeviceOverview> => {
  const { rows } = await pool.query<{ total: string; active: string }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active FROM devices`,
  );
  const row = rows[0]!;
  return { total: Number(row.total), active: Number(row.active) };
};

export type SupportOverview = { open: number; unassigned: number; recentlyResolved: number };
export const getSupportOverview = async (since: Date): Promise<SupportOverview> => {
  const { rows } = await pool.query<{ open: string; unassigned: string; recently_resolved: string }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::int AS open,
            COUNT(*) FILTER (WHERE status = 'open' AND assigned_admin_id IS NULL)::int AS unassigned,
            COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= $1)::int AS recently_resolved
     FROM support_cases`,
    [since],
  );
  const row = rows[0]!;
  return { open: Number(row.open), unassigned: Number(row.unassigned), recentlyResolved: Number(row.recently_resolved) };
};

export type AppIssueOverview = { open: number; inProgress: number; recent: number };
export const getAppIssueOverview = async (since: Date): Promise<AppIssueOverview> => {
  const { rows } = await pool.query<{ open: string; in_progress: string; recent: string }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
            COUNT(*) FILTER (WHERE created_at >= $1)::int AS recent
     FROM app_issues`,
    [since],
  );
  const row = rows[0]!;
  return { open: Number(row.open), inProgress: Number(row.in_progress), recent: Number(row.recent) };
};

export type SeverityBreakdown = { low: number; medium: number; high: number; critical: number };
export type CaseModuleOverview = { openBySeverity: SeverityBreakdown; investigating: number; recentlyCreated: number };

const caseOverviewQuery = async (table: "risk_cases" | "security_cases", since: Date): Promise<CaseModuleOverview> => {
  const { rows } = await pool.query<{
    low: string; medium: string; high: string; critical: string; investigating: string; recently_created: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE severity = 'low' AND status NOT IN ('resolved', 'closed'))::int AS low,
       COUNT(*) FILTER (WHERE severity = 'medium' AND status NOT IN ('resolved', 'closed'))::int AS medium,
       COUNT(*) FILTER (WHERE severity = 'high' AND status NOT IN ('resolved', 'closed'))::int AS high,
       COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed'))::int AS critical,
       COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
       COUNT(*) FILTER (WHERE created_at >= $1)::int AS recently_created
     FROM ${table}`,
    [since],
  );
  const row = rows[0]!;
  return {
    openBySeverity: { low: Number(row.low), medium: Number(row.medium), high: Number(row.high), critical: Number(row.critical) },
    investigating: Number(row.investigating),
    recentlyCreated: Number(row.recently_created),
  };
};

export const getRiskOverview = (since: Date): Promise<CaseModuleOverview> => caseOverviewQuery("risk_cases", since);
export const getSecurityCaseOverview = (since: Date): Promise<CaseModuleOverview> => caseOverviewQuery("security_cases", since);

export type ApprovalOverview = { pending: number; recentlyApproved: number; recentlyRejected: number };
export const getApprovalOverview = async (since: Date): Promise<ApprovalOverview> => {
  const { rows } = await pool.query<{ pending: string; recently_approved: string; recently_rejected: string }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'requested')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved' AND updated_at >= $1)::int AS recently_approved,
            COUNT(*) FILTER (WHERE status = 'rejected' AND updated_at >= $1)::int AS recently_rejected
     FROM approvals`,
    [since],
  );
  const row = rows[0]!;
  return {
    pending: Number(row.pending),
    recentlyApproved: Number(row.recently_approved),
    recentlyRejected: Number(row.recently_rejected),
  };
};

export type CampaignOverview = { active: number; scheduled: number; recentlyCompleted: number };
export const getCampaignOverview = async (since: Date): Promise<CampaignOverview> => {
  const { rows } = await pool.query<{ active: string; scheduled: string; recently_completed: string }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
            COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= $1)::int AS recently_completed
     FROM campaigns`,
    [since],
  );
  const row = rows[0]!;
  return { active: Number(row.active), scheduled: Number(row.scheduled), recentlyCompleted: Number(row.recently_completed) };
};

export type RewardOverview = { active: number; paused: number; expiringSoon: number; expired: number };
export const getRewardOverview = async (soon: Date): Promise<RewardOverview> => {
  const { rows } = await pool.query<{ active: string; paused: string; expiring_soon: string; expired: string }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
            COUNT(*) FILTER (WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= $1)::int AS expiring_soon,
            COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
     FROM rewards`,
    [soon],
  );
  const row = rows[0]!;
  return {
    active: Number(row.active),
    paused: Number(row.paused),
    expiringSoon: Number(row.expiring_soon),
    expired: Number(row.expired),
  };
};

