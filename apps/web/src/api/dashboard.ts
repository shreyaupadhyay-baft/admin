import { apiGet } from "./client.js";

export type SectionResult<T> = ({ status: "ok" } & T) | { status: "error" };

export type UsersSection = { total: number; active: number; inactive: number; recentlyCreated: number };
export type DevicesSection = { total: number; active: number; inactive: number };
export type SupportSection = { open: number; unassigned: number; recentlyResolved: number };
export type AppIssuesSection = { open: number; inProgress: number; recent: number };
export type SeverityBreakdown = { low: number; medium: number; high: number; critical: number };
export type RiskSection = { openBySeverity: SeverityBreakdown; investigating: number; recentlyCreated: number };
export type SecuritySection = RiskSection & { pendingSecurityActions?: number };
export type ApprovalsSection = { pending: number; recentlyApproved: number; recentlyRejected: number };
export type CampaignsSection = { active: number; scheduled: number; recentlyCompleted: number };
export type RewardsSection = { active: number; paused: number; expiringSoon: number; expired: number };
export type SystemHealth = { status: "healthy" | "degraded" | "unavailable"; database: "up" | "down"; redis: "up" | "down" };

export type DashboardData = {
  overview: Partial<{
    totalUsers: number;
    activeUsers: number;
    totalDevices: number;
    openSupportCases: number;
    openRiskCases: number;
    openSecurityCases: number;
    pendingApprovals: number;
    unreadNotifications: number;
  }>;
  users?: SectionResult<UsersSection>;
  devices?: SectionResult<DevicesSection>;
  support?: SectionResult<SupportSection>;
  appIssues?: SectionResult<AppIssuesSection>;
  risk?: SectionResult<RiskSection>;
  security?: SectionResult<SecuritySection>;
  approvals?: SectionResult<ApprovalsSection>;
  campaigns?: SectionResult<CampaignsSection>;
  rewards?: SectionResult<RewardsSection>;
  systemHealth: SystemHealth;
};

export const fetchDashboard = async (): Promise<DashboardData> => {
  const res = await apiGet<DashboardData>("/api/v1/dashboard");
  return res.data;
};
