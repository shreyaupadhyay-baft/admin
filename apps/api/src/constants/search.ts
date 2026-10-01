import { PERMISSIONS } from "./permissions.js";

// Global Search never introduces a new permission of its own — visibility of
// each result type is governed entirely by the permission that already
// protects that resource's own module. An admin with no matching permissions
// gets zero results for that type, never a 403 on the search endpoint itself.
export const SEARCH_RESOURCE_TYPES = [
  "user",
  "device",
  "support_case",
  "app_issue",
  "campaign",
  "reward",
  "risk_case",
  "security_case",
  "admin_user",
  "approval",
] as const;

export type SearchResourceType = (typeof SEARCH_RESOURCE_TYPES)[number];

export const SEARCH_RESOURCE_PERMISSIONS: Record<SearchResourceType, string> = {
  user: PERMISSIONS.USERS_READ,
  device: PERMISSIONS.DEVICES_READ,
  support_case: PERMISSIONS.SUPPORT_CASES_READ,
  app_issue: PERMISSIONS.APP_ISSUES_READ,
  campaign: PERMISSIONS.CAMPAIGNS_READ,
  reward: PERMISSIONS.REWARDS_READ,
  risk_case: PERMISSIONS.RISK_CASES_READ,
  security_case: PERMISSIONS.SECURITY_CASES_READ,
  admin_user: PERMISSIONS.ADMINISTRATION_ADMINS_READ,
  approval: PERMISSIONS.APPROVALS_READ,
};
