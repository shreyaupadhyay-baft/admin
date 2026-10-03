import { randomUUID } from "node:crypto";

export type FakeAdminUser = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type FakeRole = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type FakePermission = {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string;
  created_at: Date;
};

export type FakeSession = {
  id: string;
  admin_user_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  access_expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

export type FakeAuditLog = {
  id: string;
  actor_admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type FakeUser = {
  id: string;
  external_ref: string | null;
  email: string;
  phone_number: string | null;
  full_name: string;
  status: string;
  security_status: string;
  created_at: Date;
  updated_at: Date;
};

export type FakeDevice = {
  id: string;
  user_id: string;
  device_ref: string;
  platform: string;
  status: string;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type FakeSupportCase = {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

export type FakeSupportCaseEvent = {
  id: string;
  support_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type FakeAppIssue = {
  id: string;
  user_id: string | null;
  source: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
};

export type FakeCampaign = {
  id: string;
  name: string;
  description: string;
  campaign_type: string;
  status: string;
  start_at: Date | null;
  end_at: Date | null;
  audience_definition: Record<string, unknown>;
  targeting_definition: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type FakeReward = {
  id: string;
  name: string;
  description: string;
  reward_type: string;
  status: string;
  rule_definition: Record<string, unknown>;
  valid_from: Date | null;
  valid_until: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type FakeRiskSignal = {
  id: string;
  signal_type: string;
  category: string;
  severity: string;
  source: string;
  status: string;
  user_id: string | null;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
};

export type FakeRiskCase = {
  id: string;
  case_number: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  user_id: string | null;
  assigned_admin_id: string | null;
  summary: string;
  source: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

export type FakeRiskCaseEvent = {
  id: string;
  risk_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type FakeRiskCaseEvidence = {
  id: string;
  case_id: string;
  evidence_type: string;
  source: string;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: Date;
};

export type FakeRiskCaseDecision = {
  id: string;
  case_id: string;
  decision: string;
  reason: string;
  created_by: string;
  created_at: Date;
};

export type FakeUserSession = {
  id: string;
  user_id: string;
  device_id: string | null;
  status: string;
  created_at: Date;
  revoked_at: Date | null;
};

export type FakeSecurityEvent = {
  id: string;
  event_type: string;
  category: string;
  severity: string;
  source: string;
  status: string;
  user_id: string | null;
  device_id: string | null;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
};

export type FakeSecurityCase = {
  id: string;
  case_number: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  user_id: string | null;
  device_id: string | null;
  assigned_admin_id: string | null;
  summary: string;
  source: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

export type FakeSecurityCaseEvent = {
  id: string;
  security_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type FakeSecurityCaseEvidence = {
  id: string;
  case_id: string;
  evidence_type: string;
  source: string;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: Date;
};

export type FakeSecurityAction = {
  id: string;
  user_id: string;
  action_type: string;
  status: string;
  reason: string;
  requested_by: string;
  approved_by: string | null;
  requested_at: Date;
  approved_at: Date | null;
  executed_at: Date | null;
  rejected_at: Date | null;
  metadata: Record<string, unknown>;
};

export type FakeApproval = {
  id: string;
  approval_number: string;
  action_type: string;
  resource_type: string;
  resource_id: string;
  requested_by: string;
  approver_admin_id: string | null;
  status: string;
  reason: string;
  rejection_reason: string | null;
  request_metadata: Record<string, unknown>;
  execution_status: string | null;
  execution_result: Record<string, unknown> | null;
  idempotency_key: string | null;
  request_id: string | null;
  correlation_id: string | null;
  requested_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  rejected_at: Date | null;
  cancelled_at: Date | null;
  expired_at: Date | null;
  executed_at: Date | null;
};

export type FakeApprovalEvent = {
  id: string;
  approval_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type FakeNotification = {
  id: string;
  recipient_admin_id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  dedup_key: string | null;
  created_at: Date;
  read_at: Date | null;
};

export const db = {
  adminUsers: [] as FakeAdminUser[],
  roles: [] as FakeRole[],
  permissions: [] as FakePermission[],
  rolePermissions: [] as { role_id: string; permission_id: string }[],
  adminUserRoles: [] as { admin_user_id: string; role_id: string }[],
  sessions: [] as FakeSession[],
  auditLogs: [] as FakeAuditLog[],
  users: [] as FakeUser[],
  devices: [] as FakeDevice[],
  supportCases: [] as FakeSupportCase[],
  supportCaseEvents: [] as FakeSupportCaseEvent[],
  appIssues: [] as FakeAppIssue[],
  campaigns: [] as FakeCampaign[],
  rewards: [] as FakeReward[],
  riskSignals: [] as FakeRiskSignal[],
  riskCases: [] as FakeRiskCase[],
  riskCaseEvents: [] as FakeRiskCaseEvent[],
  riskCaseEvidence: [] as FakeRiskCaseEvidence[],
  riskCaseDecisions: [] as FakeRiskCaseDecision[],
  userSessions: [] as FakeUserSession[],
  securityEvents: [] as FakeSecurityEvent[],
  securityCases: [] as FakeSecurityCase[],
  securityCaseEvents: [] as FakeSecurityCaseEvent[],
  securityCaseEvidence: [] as FakeSecurityCaseEvidence[],
  securityActions: [] as FakeSecurityAction[],
  approvals: [] as FakeApproval[],
  approvalEvents: [] as FakeApprovalEvent[],
  notifications: [] as FakeNotification[],
};

export const resetStore = () => {
  db.adminUsers = [];
  db.roles = [];
  db.permissions = [];
  db.rolePermissions = [];
  db.adminUserRoles = [];
  db.sessions = [];
  db.auditLogs = [];
  db.users = [];
  db.devices = [];
  db.supportCases = [];
  db.supportCaseEvents = [];
  db.appIssues = [];
  db.campaigns = [];
  db.rewards = [];
  db.riskSignals = [];
  db.riskCases = [];
  db.riskCaseEvents = [];
  db.riskCaseEvidence = [];
  db.riskCaseDecisions = [];
  db.userSessions = [];
  db.securityEvents = [];
  db.securityCases = [];
  db.securityCaseEvents = [];
  db.securityCaseEvidence = [];
  db.securityActions = [];
  db.approvals = [];
  db.approvalEvents = [];
  db.notifications = [];
};

export class FakeUniqueViolation extends Error {
  code = "23505";
}

/** Mirrors 003_seed_rbac_data.sql + 005_seed_users_devices_permissions.sql so tests exercise real permission keys. */
export const seedRbacFixtures = () => {
  const permissionDefs: Array<[string, string]> = [
    ["admins", "read"],
    ["admins", "create"],
    ["admins", "update"],
    ["admins", "disable"],
    ["admins", "enable"],
    ["admins", "assign_role"],
    ["admins", "remove_role"],
    ["roles", "read"],
    ["roles", "create"],
    ["roles", "update"],
    ["permissions", "read"],
    ["audit_logs", "read"],
    ["users", "read"],
    ["users", "create"],
    ["users", "update"],
    ["users", "status.read"],
    ["users", "status.update"],
    ["devices", "read"],
    ["devices", "update"],
    ["devices", "status.read"],
    ["devices", "status.update"],
    ["support_cases", "read"],
    ["support_cases", "create"],
    ["support_cases", "update"],
    ["support_cases", "assign"],
    ["support_cases", "resolve"],
    ["support_cases", "close"],
    ["support_cases", "add_note"],
    ["app_issues", "read"],
    ["app_issues", "create"],
    ["app_issues", "update"],
    ["app_issues", "assign"],
    ["app_issues", "resolve"],
    ["campaigns", "read"],
    ["campaigns", "create"],
    ["campaigns", "update"],
    ["campaigns", "schedule"],
    ["campaigns", "activate"],
    ["campaigns", "complete"],
    ["campaigns", "cancel"],
    ["rewards", "read"],
    ["rewards", "create"],
    ["rewards", "update"],
    ["rewards", "activate"],
    ["rewards", "pause"],
    ["rewards", "resume"],
    ["rewards", "expire"],
    ["rewards", "cancel"],
    ["risk_signals", "read"],
    ["risk_signals", "create"],
    ["risk_signals", "status.update"],
    ["risk_cases", "read"],
    ["risk_cases", "create"],
    ["risk_cases", "update"],
    ["risk_cases", "assign"],
    ["risk_cases", "status.update"],
    ["risk_cases", "severity.update"],
    ["risk_cases", "resolve"],
    ["risk_cases", "close"],
    ["risk_cases", "add_note"],
    ["risk_cases", "add_evidence"],
    ["risk_cases", "decide"],
    ["security_events", "read"],
    ["security_events", "create"],
    ["security_events", "status.update"],
    ["security_cases", "read"],
    ["security_cases", "create"],
    ["security_cases", "update"],
    ["security_cases", "assign"],
    ["security_cases", "status.update"],
    ["security_cases", "severity.update"],
    ["security_cases", "add_note"],
    ["security_cases", "add_evidence"],
    ["security_cases", "resolve"],
    ["security_cases", "close"],
    ["security_actions", "read"],
    ["security_actions", "request"],
    ["security_actions", "approve"],
    ["security_actions", "reject"],
    ["security_actions", "force_logout"],
    ["security_actions", "revoke_sessions"],
    ["administration.admins", "read"],
    ["administration.admins", "create"],
    ["administration.admins", "update"],
    ["administration.admins", "status.update"],
    ["administration.admins", "roles.update"],
    ["administration.admins", "sessions.read"],
    ["administration.admins", "sessions.revoke"],
    ["administration.roles", "read"],
    ["administration.roles", "create"],
    ["administration.roles", "update"],
    ["administration.roles", "status.update"],
    ["administration.roles", "permissions.update"],
    ["administration.permissions", "read"],
    ["administration.audit", "read"],
    ["approvals", "read"],
    ["approvals", "create"],
    ["approvals", "approve"],
    ["approvals", "reject"],
    ["approvals", "cancel"],
    ["approvals", "events.read"],
    ["notifications", "read"],
    ["notifications", "mark_read"],
    ["notifications", "mark_all_read"],
    ["system", "integrations.read"],
    ["kyc", "read"],
    ["beneficiaries", "read"],
    ["analytics", "overview.read"],
    ["analytics", "onboarding.read"],
    ["analytics", "features.read"],
    ["analytics", "retention.read"],
    ["analytics", "usage.read"],
    ["analytics", "rewards.read"],
    ["analytics", "financial.read"],
  ];

  for (const [resource, action] of permissionDefs) {
    db.permissions.push({
      id: randomUUID(),
      resource,
      action,
      key: `${resource}.${action}`,
      description: "",
      created_at: new Date(),
    });
  }

  const makeRole = (name: string, isSystem = true): FakeRole => {
    const role: FakeRole = {
      id: randomUUID(),
      name,
      description: "",
      is_system: isSystem,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    db.roles.push(role);
    return role;
  };

  const superAdmin = makeRole("Super Admin");
  const securityAdmin = makeRole("Security Admin");
  const auditor = makeRole("Auditor");
  const operationsAdmin = makeRole("Operations Admin");
  const supportAdmin = makeRole("Support Admin");
  const riskFraudAdmin = makeRole("Risk/Fraud Admin");
  const productGrowthAdmin = makeRole("Product/Growth Admin");
  const engineeringAdmin = makeRole("Engineering Admin");

  const grant = (role: FakeRole, keys: string[]) => {
    for (const permission of db.permissions.filter((p) => keys.includes(p.key))) {
      db.rolePermissions.push({ role_id: role.id, permission_id: permission.id });
    }
  };

  for (const permission of db.permissions) {
    db.rolePermissions.push({ role_id: superAdmin.id, permission_id: permission.id });
  }

  // Notifications are a personal inbox, not a shared resource — every role
  // gets baseline access, mirroring 021_seed_notifications_permissions.sql's
  // CROSS JOIN over all roles (Super Admin already has it from the loop above).
  const notificationKeys = ["notifications.read", "notifications.mark_read", "notifications.mark_all_read"];
  for (const role of [securityAdmin, auditor, operationsAdmin, supportAdmin, riskFraudAdmin, productGrowthAdmin, engineeringAdmin]) {
    grant(role, notificationKeys);
  }

  grant(engineeringAdmin, ["system.integrations.read"]);
  grant(supportAdmin, ["kyc.read"]);
  grant(riskFraudAdmin, ["kyc.read"]);
  grant(supportAdmin, ["beneficiaries.read"]);
  grant(riskFraudAdmin, ["beneficiaries.read"]);
  // Mirrors 027_seed_analytics_permissions.sql
  grant(productGrowthAdmin, ["analytics.overview.read", "analytics.onboarding.read", "analytics.features.read", "analytics.retention.read", "analytics.usage.read", "analytics.rewards.read"]);
  grant(operationsAdmin, ["analytics.overview.read", "analytics.onboarding.read", "analytics.rewards.read"]);
  grant(engineeringAdmin, ["analytics.usage.read"]);

  grant(securityAdmin, [
    "admins.read",
    "admins.create",
    "admins.update",
    "admins.disable",
    "admins.enable",
    "admins.assign_role",
    "admins.remove_role",
    "roles.read",
    "roles.create",
    "roles.update",
    "permissions.read",
    "audit_logs.read",
    "security_events.read",
    "security_events.create",
    "security_events.status.update",
    "security_cases.read",
    "security_cases.create",
    "security_cases.update",
    "security_cases.assign",
    "security_cases.status.update",
    "security_cases.severity.update",
    "security_cases.add_note",
    "security_cases.add_evidence",
    "security_cases.resolve",
    "security_cases.close",
    "security_actions.read",
    "security_actions.request",
    "security_actions.approve",
    "security_actions.reject",
    "security_actions.force_logout",
    "security_actions.revoke_sessions",
    "administration.admins.read",
    "administration.admins.status.update",
    "administration.admins.sessions.read",
    "administration.admins.sessions.revoke",
    "administration.audit.read",
    "approvals.read",
    "approvals.approve",
    "approvals.reject",
    "approvals.events.read",
  ]);

  grant(auditor, [
    "admins.read",
    "roles.read",
    "permissions.read",
    "audit_logs.read",
    "users.read",
    "users.status.read",
    "devices.read",
    "devices.status.read",
    "support_cases.read",
    "app_issues.read",
    "campaigns.read",
    "rewards.read",
    "risk_signals.read",
    "risk_cases.read",
    "security_events.read",
    "security_cases.read",
    "security_actions.read",
    "administration.admins.read",
    "administration.admins.sessions.read",
    "administration.roles.read",
    "administration.permissions.read",
    "administration.audit.read",
    "approvals.read",
    "approvals.events.read",
  ]);

  grant(operationsAdmin, [
    "users.read",
    "users.create",
    "users.update",
    "users.status.read",
    "users.status.update",
    "devices.read",
    "devices.update",
    "devices.status.read",
    "devices.status.update",
    "support_cases.read",
    "support_cases.create",
    "support_cases.update",
    "support_cases.assign",
    "support_cases.resolve",
    "support_cases.close",
    "support_cases.add_note",
    "app_issues.read",
    "app_issues.create",
    "app_issues.update",
    "app_issues.assign",
    "app_issues.resolve",
    "campaigns.read",
    "campaigns.activate",
    "campaigns.cancel",
    "rewards.read",
    "rewards.activate",
    "rewards.pause",
    "rewards.resume",
    "rewards.cancel",
    "risk_signals.read",
    "risk_cases.read",
    "security_events.read",
    "security_cases.read",
  ]);

  grant(supportAdmin, [
    "users.read",
    "users.status.read",
    "devices.read",
    "devices.status.read",
    "support_cases.read",
    "support_cases.create",
    "support_cases.update",
    "support_cases.assign",
    "support_cases.resolve",
    "support_cases.close",
    "support_cases.add_note",
    "app_issues.read",
    "app_issues.create",
    "app_issues.update",
    "app_issues.assign",
    "app_issues.resolve",
    "campaigns.read",
    "rewards.read",
    "risk_cases.read",
    "security_cases.read",
  ]);

  grant(riskFraudAdmin, [
    "users.read",
    "users.status.read",
    "users.status.update",
    "devices.read",
    "devices.status.read",
    "devices.status.update",
    "support_cases.read",
    "app_issues.read",
    "campaigns.read",
    "rewards.read",
    "risk_signals.read",
    "risk_signals.create",
    "risk_signals.status.update",
    "risk_cases.read",
    "risk_cases.create",
    "risk_cases.update",
    "risk_cases.assign",
    "risk_cases.status.update",
    "risk_cases.severity.update",
    "risk_cases.resolve",
    "risk_cases.close",
    "risk_cases.add_note",
    "risk_cases.add_evidence",
    "risk_cases.decide",
    "security_events.read",
    "security_cases.read",
  ]);

  grant(productGrowthAdmin, [
    "users.read",
    "app_issues.read",
    "campaigns.read",
    "campaigns.create",
    "campaigns.update",
    "campaigns.schedule",
    "campaigns.activate",
    "campaigns.complete",
    "campaigns.cancel",
    "rewards.read",
    "rewards.create",
    "rewards.update",
    "rewards.activate",
    "rewards.pause",
    "rewards.resume",
    "rewards.expire",
    "rewards.cancel",
  ]);

  grant(engineeringAdmin, [
    "users.read",
    "devices.read",
    "app_issues.read",
    "campaigns.read",
    "rewards.read",
    "risk_signals.read",
    "security_events.read",
  ]);

  return {
    superAdmin,
    securityAdmin,
    auditor,
    operationsAdmin,
    supportAdmin,
    riskFraudAdmin,
    productGrowthAdmin,
    engineeringAdmin,
  };
};
