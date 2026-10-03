import { useCallback, useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { fetchUnreadCount } from "../api/notifications.js";
import { GlobalSearch } from "../components/GlobalSearch.js";

const ANALYTICS_PERMISSIONS = [
  "analytics.overview.read",
  "analytics.onboarding.read",
  "analytics.features.read",
  "analytics.retention.read",
  "analytics.usage.read",
  "analytics.rewards.read",
  "analytics.financial.read",
];

// No WebSocket/SSE infrastructure exists in this app, and adding one just for
// a badge count would be disproportionate — a 30s poll while the shell is
// mounted is a reasonable refresh strategy that fits the existing app.
const UNREAD_COUNT_POLL_MS = 30_000;

// Phase 1 foundation shell: current admin + roles/permissions + a
// permission-aware nav. Later modules add their own nav entries and routes
// behind the same can() helper — the backend stays authoritative regardless.
export const AdminShellLayout = () => {
  const { state, logout, can } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const canReadNotifications = state.status === "authenticated" && can("notifications.read");

  const refreshUnreadCount = useCallback(async () => {
    if (!canReadNotifications) return;
    try {
      setUnreadCount(await fetchUnreadCount());
    } catch {
      // A failed poll should never disrupt the shell — just leave the last known count.
    }
  }, [canReadNotifications]);

  useEffect(() => {
    if (!canReadNotifications) return;
    void refreshUnreadCount();
    const interval = setInterval(() => void refreshUnreadCount(), UNREAD_COUNT_POLL_MS);
    return () => clearInterval(interval);
  }, [canReadNotifications, refreshUnreadCount]);

  if (state.status !== "authenticated") {
    return null;
  }

  const { admin } = state;

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem" }}>
        <div>
          <strong>BAFT Admin</strong> — {admin.fullName} ({admin.email})
          <div style={{ fontSize: "0.85rem", color: "#555" }}>Roles: {admin.roles.join(", ") || "none"}</div>
        </div>
        <GlobalSearch />
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {canReadNotifications && (
            <Link to="/notifications" aria-label="Notifications" style={{ position: "relative" }}>
              Notifications
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-10px",
                    background: "#dc2626",
                    color: "white",
                    borderRadius: "999px",
                    fontSize: "0.7rem",
                    padding: "0 5px",
                    minWidth: "1rem",
                    textAlign: "center",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          <button type="button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <nav style={{ padding: "0 1rem" }}>
        <ul style={{ display: "flex", gap: "1rem", listStyle: "none", padding: 0 }}>
          <li>
            <Link to="/">Dashboard</Link>
          </li>
          <li>
            <Link to="/system-health">System Health</Link>
          </li>
          {ANALYTICS_PERMISSIONS.some((p) => can(p)) && (
            <li>
              <Link to="/analytics">Analytics</Link>
            </li>
          )}
          {can("users.read") && (
            <li>
              <Link to="/users">Users</Link>
            </li>
          )}
          {can("support_cases.read") && (
            <li>
              <Link to="/support/cases">Support Cases</Link>
            </li>
          )}
          {can("app_issues.read") && (
            <li>
              <Link to="/support/app-issues">App Issues</Link>
            </li>
          )}
          {can("campaigns.read") && (
            <li>
              <Link to="/campaigns">Campaigns</Link>
            </li>
          )}
          {can("rewards.read") && (
            <li>
              <Link to="/rewards">Rewards</Link>
            </li>
          )}
          {can("risk_signals.read") && (
            <li>
              <Link to="/risk/signals">Risk Signals</Link>
            </li>
          )}
          {can("risk_cases.read") && (
            <li>
              <Link to="/risk/cases">Risk Cases</Link>
            </li>
          )}
          {can("security_events.read") && (
            <li>
              <Link to="/security/events">Security Events</Link>
            </li>
          )}
          {can("security_cases.read") && (
            <li>
              <Link to="/security/cases">Security Cases</Link>
            </li>
          )}
          {can("security_actions.read") && (
            <li>
              <Link to="/security/actions">Security Actions</Link>
            </li>
          )}
          {can("security_cases.read") && (
            <li>
              <Link to="/security/posture">Security Posture</Link>
            </li>
          )}
          {can("administration.admins.read") && (
            <li>
              <Link to="/administration/admins">Admins</Link>
            </li>
          )}
          {can("administration.roles.read") && (
            <li>
              <Link to="/administration/roles">Roles</Link>
            </li>
          )}
          {can("administration.permissions.read") && (
            <li>
              <Link to="/administration/permissions">Permissions</Link>
            </li>
          )}
          {can("administration.audit.read") && (
            <li>
              <Link to="/administration/audit">Audit</Link>
            </li>
          )}
          {can("approvals.read") && (
            <li>
              <Link to="/approvals">Approvals</Link>
            </li>
          )}
        </ul>
      </nav>

      <main style={{ padding: "0 1rem" }}>
        <Outlet />
      </main>
    </div>
  );
};
