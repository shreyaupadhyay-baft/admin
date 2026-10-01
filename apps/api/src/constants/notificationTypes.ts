// The controlled vocabulary of notification types. Producers reference these
// constants rather than hard-coding strings, and the `notifications.type`
// column's CHECK constraint mirrors this list exactly. Only types with a real
// producer wired up in an existing, completed module are listed here — no
// speculative "system_alert" or similar with nothing behind it.
export const NOTIFICATION_TYPES = {
  SECURITY_CASE_ASSIGNED: "security_case_assigned",
  SECURITY_ACTION_REQUESTED: "security_action_requested",
  SECURITY_ACTION_APPROVED: "security_action_approved",
  SECURITY_ACTION_REJECTED: "security_action_rejected",

  RISK_CASE_ASSIGNED: "risk_case_assigned",
  RISK_CASE_STATUS_CHANGED: "risk_case_status_changed",

  SUPPORT_CASE_ASSIGNED: "support_case_assigned",
  SUPPORT_CASE_STATUS_CHANGED: "support_case_status_changed",

  APPROVAL_REQUESTED: "approval_requested",
  APPROVAL_APPROVED: "approval_approved",
  APPROVAL_REJECTED: "approval_rejected",

  ADMIN_ACCOUNT_DISABLED: "admin_account_disabled",
  ADMIN_ROLE_CHANGED: "admin_role_changed",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationSeverity = "info" | "success" | "warning" | "critical";
