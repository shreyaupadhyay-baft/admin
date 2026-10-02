// Mirrors the permission keys seeded in 003_seed_rbac_data.sql. The database
// remains the source of truth (requirePermission checks the admin's loaded
// permission set, not this list) — these constants just give callers
// compile-time safety against typos when protecting a route.
export const PERMISSIONS = {
  ADMINS_READ: "admins.read",
  ADMINS_CREATE: "admins.create",
  ADMINS_UPDATE: "admins.update",
  ADMINS_DISABLE: "admins.disable",
  ADMINS_ENABLE: "admins.enable",
  ADMINS_ASSIGN_ROLE: "admins.assign_role",
  ADMINS_REMOVE_ROLE: "admins.remove_role",
  ROLES_READ: "roles.read",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  PERMISSIONS_READ: "permissions.read",
  AUDIT_LOGS_READ: "audit_logs.read",

  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_STATUS_READ: "users.status.read",
  USERS_STATUS_UPDATE: "users.status.update",

  DEVICES_READ: "devices.read",
  DEVICES_UPDATE: "devices.update",
  DEVICES_STATUS_READ: "devices.status.read",
  DEVICES_STATUS_UPDATE: "devices.status.update",

  SUPPORT_CASES_READ: "support_cases.read",
  SUPPORT_CASES_CREATE: "support_cases.create",
  SUPPORT_CASES_UPDATE: "support_cases.update",
  SUPPORT_CASES_ASSIGN: "support_cases.assign",
  SUPPORT_CASES_RESOLVE: "support_cases.resolve",
  SUPPORT_CASES_CLOSE: "support_cases.close",
  SUPPORT_CASES_ADD_NOTE: "support_cases.add_note",

  APP_ISSUES_READ: "app_issues.read",
  APP_ISSUES_CREATE: "app_issues.create",
  APP_ISSUES_UPDATE: "app_issues.update",
  APP_ISSUES_ASSIGN: "app_issues.assign",
  APP_ISSUES_RESOLVE: "app_issues.resolve",

  CAMPAIGNS_READ: "campaigns.read",
  CAMPAIGNS_CREATE: "campaigns.create",
  CAMPAIGNS_UPDATE: "campaigns.update",
  CAMPAIGNS_SCHEDULE: "campaigns.schedule",
  CAMPAIGNS_ACTIVATE: "campaigns.activate",
  CAMPAIGNS_COMPLETE: "campaigns.complete",
  CAMPAIGNS_CANCEL: "campaigns.cancel",

  REWARDS_READ: "rewards.read",
  REWARDS_CREATE: "rewards.create",
  REWARDS_UPDATE: "rewards.update",
  REWARDS_ACTIVATE: "rewards.activate",
  REWARDS_PAUSE: "rewards.pause",
  REWARDS_RESUME: "rewards.resume",
  REWARDS_EXPIRE: "rewards.expire",
  REWARDS_CANCEL: "rewards.cancel",

  RISK_SIGNALS_READ: "risk_signals.read",
  RISK_SIGNALS_CREATE: "risk_signals.create",
  RISK_SIGNALS_STATUS_UPDATE: "risk_signals.status.update",

  RISK_CASES_READ: "risk_cases.read",
  RISK_CASES_CREATE: "risk_cases.create",
  RISK_CASES_UPDATE: "risk_cases.update",
  RISK_CASES_ASSIGN: "risk_cases.assign",
  RISK_CASES_STATUS_UPDATE: "risk_cases.status.update",
  RISK_CASES_SEVERITY_UPDATE: "risk_cases.severity.update",
  RISK_CASES_RESOLVE: "risk_cases.resolve",
  RISK_CASES_CLOSE: "risk_cases.close",
  RISK_CASES_ADD_NOTE: "risk_cases.add_note",
  RISK_CASES_ADD_EVIDENCE: "risk_cases.add_evidence",
  RISK_CASES_DECIDE: "risk_cases.decide",

  SECURITY_EVENTS_READ: "security_events.read",
  SECURITY_EVENTS_CREATE: "security_events.create",
  SECURITY_EVENTS_STATUS_UPDATE: "security_events.status.update",

  SECURITY_CASES_READ: "security_cases.read",
  SECURITY_CASES_CREATE: "security_cases.create",
  SECURITY_CASES_UPDATE: "security_cases.update",
  SECURITY_CASES_ASSIGN: "security_cases.assign",
  SECURITY_CASES_STATUS_UPDATE: "security_cases.status.update",
  SECURITY_CASES_SEVERITY_UPDATE: "security_cases.severity.update",
  SECURITY_CASES_ADD_NOTE: "security_cases.add_note",
  SECURITY_CASES_ADD_EVIDENCE: "security_cases.add_evidence",
  SECURITY_CASES_RESOLVE: "security_cases.resolve",
  SECURITY_CASES_CLOSE: "security_cases.close",

  SECURITY_ACTIONS_READ: "security_actions.read",
  SECURITY_ACTIONS_REQUEST: "security_actions.request",
  SECURITY_ACTIONS_APPROVE: "security_actions.approve",
  SECURITY_ACTIONS_REJECT: "security_actions.reject",
  SECURITY_ACTIONS_FORCE_LOGOUT: "security_actions.force_logout",
  SECURITY_ACTIONS_REVOKE_SESSIONS: "security_actions.revoke_sessions",

  ADMINISTRATION_ADMINS_READ: "administration.admins.read",
  ADMINISTRATION_ADMINS_CREATE: "administration.admins.create",
  ADMINISTRATION_ADMINS_UPDATE: "administration.admins.update",
  ADMINISTRATION_ADMINS_STATUS_UPDATE: "administration.admins.status.update",
  ADMINISTRATION_ADMINS_ROLES_UPDATE: "administration.admins.roles.update",
  ADMINISTRATION_ADMINS_SESSIONS_READ: "administration.admins.sessions.read",
  ADMINISTRATION_ADMINS_SESSIONS_REVOKE: "administration.admins.sessions.revoke",

  ADMINISTRATION_ROLES_READ: "administration.roles.read",
  ADMINISTRATION_ROLES_CREATE: "administration.roles.create",
  ADMINISTRATION_ROLES_UPDATE: "administration.roles.update",
  ADMINISTRATION_ROLES_STATUS_UPDATE: "administration.roles.status.update",
  ADMINISTRATION_ROLES_PERMISSIONS_UPDATE: "administration.roles.permissions.update",

  ADMINISTRATION_PERMISSIONS_READ: "administration.permissions.read",

  ADMINISTRATION_AUDIT_READ: "administration.audit.read",

  APPROVALS_READ: "approvals.read",
  APPROVALS_CREATE: "approvals.create",
  APPROVALS_APPROVE: "approvals.approve",
  APPROVALS_REJECT: "approvals.reject",
  APPROVALS_CANCEL: "approvals.cancel",
  APPROVALS_EVENTS_READ: "approvals.events.read",

  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_MARK_READ: "notifications.mark_read",
  NOTIFICATIONS_MARK_ALL_READ: "notifications.mark_all_read",

  // Infrastructure visibility only (integration connectivity/config status).
  // Deliberately NOT a "Transcorp admin" permission: provider data modules
  // gate on their own permissions (kyc.read, transactions.read, ...).
  SYSTEM_INTEGRATIONS_READ: "system.integrations.read",

  // Provider-sourced (Transcorp) KYC status view. Read-only; distinct from users.read.
  KYC_READ: "kyc.read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
