import type { Request, Response } from "express";
import { sendSuccess } from "../utils/response.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { checkDatabaseHealth } from "../infrastructure/database/pool.js";
import { checkRedisHealth } from "../infrastructure/redis/client.js";
import { countUnreadForAdmin } from "../repositories/notification.repository.js";
import { countPendingSecurityActions } from "../repositories/securityAction.repository.js";
import {
  getApprovalOverview,
  getAppIssueOverview,
  getCampaignOverview,
  getDeviceOverview,
  getRewardOverview,
  getRiskOverview,
  getSecurityCaseOverview,
  getSupportOverview,
  getUserOverview,
} from "../repositories/dashboard.repository.js";

// A concise operational snapshot, not the future Analytics module: current
// counts plus one small, explicit "recent activity" window. 7 days mirrors
// the existing Security Posture endpoint's own window for the same reason —
// numbers reflect current state, not an ever-growing lifetime total.
const RECENT_WINDOW_DAYS = 7;
const REWARD_EXPIRING_SOON_DAYS = 7;

// Every optional section is fetched independently via Promise.allSettled
// semantics (each promise below already swallows its own error into a
// tagged result) so one module's query failing never takes down sections
// that succeeded. { status: "error" } is returned instead of silently
// showing a fabricated zero, and a permission the admin lacks means the key
// is absent entirely — three distinguishable outcomes, never conflated.
const fetchSection = async <T extends Record<string, unknown>>(
  fn: () => Promise<T>,
): Promise<({ status: "ok" } & T) | { status: "error" }> => {
  try {
    const data = await fn();
    return { status: "ok", ...data };
  } catch {
    return { status: "error" };
  }
};

export const getDashboardHandler = async (req: Request, res: Response): Promise<void> => {
  const permissions = req.admin?.permissions ?? [];
  const has = (permission: string) => permissions.includes(permission);
  const adminId = req.admin?.id as string;

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const expiringSoonBy = new Date(Date.now() + REWARD_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const canUsers = has(PERMISSIONS.USERS_READ);
  const canDevices = has(PERMISSIONS.DEVICES_READ);
  const canSupport = has(PERMISSIONS.SUPPORT_CASES_READ);
  const canAppIssues = has(PERMISSIONS.APP_ISSUES_READ);
  const canRisk = has(PERMISSIONS.RISK_CASES_READ);
  const canSecurity = has(PERMISSIONS.SECURITY_CASES_READ);
  const canSecurityActions = has(PERMISSIONS.SECURITY_ACTIONS_READ);
  const canApprovals = has(PERMISSIONS.APPROVALS_READ);
  const canCampaigns = has(PERMISSIONS.CAMPAIGNS_READ);
  const canRewards = has(PERMISSIONS.REWARDS_READ);
  const canNotifications = has(PERMISSIONS.NOTIFICATIONS_READ);

  const [
    userSection,
    deviceSection,
    supportSection,
    appIssueSection,
    riskSection,
    securityCaseSection,
    approvalSection,
    campaignSection,
    rewardSection,
    unreadNotifications,
    pendingSecurityActions,
    databaseUp,
    redisUp,
  ] = await Promise.all([
    canUsers ? fetchSection(() => getUserOverview(since)) : Promise.resolve(undefined),
    canDevices ? fetchSection(() => getDeviceOverview()) : Promise.resolve(undefined),
    canSupport ? fetchSection(() => getSupportOverview(since)) : Promise.resolve(undefined),
    canAppIssues ? fetchSection(() => getAppIssueOverview(since)) : Promise.resolve(undefined),
    canRisk ? fetchSection(() => getRiskOverview(since)) : Promise.resolve(undefined),
    canSecurity ? fetchSection(() => getSecurityCaseOverview(since)) : Promise.resolve(undefined),
    canApprovals ? fetchSection(() => getApprovalOverview(since)) : Promise.resolve(undefined),
    canCampaigns ? fetchSection(() => getCampaignOverview(since)) : Promise.resolve(undefined),
    canRewards ? fetchSection(() => getRewardOverview(expiringSoonBy)) : Promise.resolve(undefined),
    canNotifications ? countUnreadForAdmin(adminId).catch(() => null) : Promise.resolve(null),
    canSecurity && canSecurityActions ? countPendingSecurityActions().catch(() => null) : Promise.resolve(null),
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  // Top-level overview cards reuse each section's already-fetched numbers —
  // "open support cases" here is the exact same count as the deeper Support
  // section's own "open", never a second, possibly-divergent definition.
  const overview: Record<string, number> = {};
  if (userSection?.status === "ok") {
    overview.totalUsers = userSection.total;
    overview.activeUsers = userSection.active;
  }
  if (deviceSection?.status === "ok") overview.totalDevices = deviceSection.total;
  if (supportSection?.status === "ok") overview.openSupportCases = supportSection.open;
  if (riskSection?.status === "ok") {
    const s = riskSection.openBySeverity;
    overview.openRiskCases = s.low + s.medium + s.high + s.critical;
  }
  if (securityCaseSection?.status === "ok") {
    const s = securityCaseSection.openBySeverity;
    overview.openSecurityCases = s.low + s.medium + s.high + s.critical;
  }
  if (approvalSection?.status === "ok") overview.pendingApprovals = approvalSection.pending;
  if (canNotifications && unreadNotifications !== null) overview.unreadNotifications = unreadNotifications;

  const users =
    userSection?.status === "ok"
      ? { status: "ok" as const, total: userSection.total, active: userSection.active, inactive: userSection.total - userSection.active, recentlyCreated: userSection.recentlyCreated }
      : userSection;

  const devices =
    deviceSection?.status === "ok"
      ? { status: "ok" as const, total: deviceSection.total, active: deviceSection.active, inactive: deviceSection.total - deviceSection.active }
      : deviceSection;

  const security =
    securityCaseSection?.status === "ok"
      ? {
          status: "ok" as const,
          openBySeverity: securityCaseSection.openBySeverity,
          investigating: securityCaseSection.investigating,
          recentlyCreated: securityCaseSection.recentlyCreated,
          ...(canSecurityActions && pendingSecurityActions !== null ? { pendingSecurityActions } : {}),
        }
      : securityCaseSection;

  const isReady = databaseUp && redisUp;
  const systemHealth = {
    status: !databaseUp ? "unavailable" : isReady ? "healthy" : "degraded",
    database: databaseUp ? "up" : "down",
    redis: redisUp ? "up" : "down",
  };

  sendSuccess(res, 200, {
    overview,
    ...(users ? { users } : {}),
    ...(devices ? { devices } : {}),
    ...(supportSection ? { support: supportSection } : {}),
    ...(appIssueSection ? { appIssues: appIssueSection } : {}),
    ...(riskSection ? { risk: riskSection } : {}),
    ...(security ? { security } : {}),
    ...(approvalSection ? { approvals: approvalSection } : {}),
    ...(campaignSection ? { campaigns: campaignSection } : {}),
    ...(rewardSection ? { rewards: rewardSection } : {}),
    systemHealth,
  });
};
