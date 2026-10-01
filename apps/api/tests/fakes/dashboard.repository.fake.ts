import { db } from "./store.js";

export type UserOverview = { total: number; active: number; recentlyCreated: number };
export const getUserOverview = async (since: Date): Promise<UserOverview> => ({
  total: db.users.length,
  active: db.users.filter((u) => u.status === "active").length,
  recentlyCreated: db.users.filter((u) => u.created_at >= since).length,
});

export type DeviceOverview = { total: number; active: number };
export const getDeviceOverview = async (): Promise<DeviceOverview> => ({
  total: db.devices.length,
  active: db.devices.filter((d) => d.status === "active").length,
});

export type SupportOverview = { open: number; unassigned: number; recentlyResolved: number };
export const getSupportOverview = async (since: Date): Promise<SupportOverview> => ({
  open: db.supportCases.filter((c) => c.status === "open" || c.status === "in_progress").length,
  unassigned: db.supportCases.filter((c) => c.status === "open" && !c.assigned_admin_id).length,
  recentlyResolved: db.supportCases.filter((c) => c.status === "resolved" && c.resolved_at && c.resolved_at >= since).length,
});

export type AppIssueOverview = { open: number; inProgress: number; recent: number };
export const getAppIssueOverview = async (since: Date): Promise<AppIssueOverview> => ({
  open: db.appIssues.filter((i) => i.status === "open").length,
  inProgress: db.appIssues.filter((i) => i.status === "in_progress").length,
  recent: db.appIssues.filter((i) => i.created_at >= since).length,
});

export type SeverityBreakdown = { low: number; medium: number; high: number; critical: number };
export type CaseModuleOverview = { openBySeverity: SeverityBreakdown; investigating: number; recentlyCreated: number };

const isOpen = (status: string) => status !== "resolved" && status !== "closed";

const caseOverview = (rows: { severity: string; status: string; created_at: Date }[], since: Date): CaseModuleOverview => ({
  openBySeverity: {
    low: rows.filter((r) => r.severity === "low" && isOpen(r.status)).length,
    medium: rows.filter((r) => r.severity === "medium" && isOpen(r.status)).length,
    high: rows.filter((r) => r.severity === "high" && isOpen(r.status)).length,
    critical: rows.filter((r) => r.severity === "critical" && isOpen(r.status)).length,
  },
  investigating: rows.filter((r) => r.status === "investigating").length,
  recentlyCreated: rows.filter((r) => r.created_at >= since).length,
});

export const getRiskOverview = async (since: Date): Promise<CaseModuleOverview> => caseOverview(db.riskCases, since);
export const getSecurityCaseOverview = async (since: Date): Promise<CaseModuleOverview> => caseOverview(db.securityCases, since);

export type ApprovalOverview = { pending: number; recentlyApproved: number; recentlyRejected: number };
export const getApprovalOverview = async (since: Date): Promise<ApprovalOverview> => ({
  pending: db.approvals.filter((a) => a.status === "requested").length,
  recentlyApproved: db.approvals.filter((a) => a.status === "approved" && a.updated_at >= since).length,
  recentlyRejected: db.approvals.filter((a) => a.status === "rejected" && a.updated_at >= since).length,
});

export type CampaignOverview = { active: number; scheduled: number; recentlyCompleted: number };
export const getCampaignOverview = async (since: Date): Promise<CampaignOverview> => ({
  active: db.campaigns.filter((c) => c.status === "active").length,
  scheduled: db.campaigns.filter((c) => c.status === "scheduled").length,
  recentlyCompleted: db.campaigns.filter((c) => c.status === "completed" && c.updated_at >= since).length,
});

export type RewardOverview = { active: number; paused: number; expiringSoon: number; expired: number };
export const getRewardOverview = async (soon: Date): Promise<RewardOverview> => ({
  active: db.rewards.filter((r) => r.status === "active").length,
  paused: db.rewards.filter((r) => r.status === "paused").length,
  expiringSoon: db.rewards.filter((r) => r.status === "active" && r.valid_until !== null && r.valid_until <= soon).length,
  expired: db.rewards.filter((r) => r.status === "expired").length,
});
