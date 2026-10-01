import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { fetchDashboard, type DashboardData, type SectionResult } from "../api/dashboard.js";

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "6px",
  padding: "0.9rem 1rem",
  minWidth: "140px",
  flex: "1 1 140px",
  textDecoration: "none",
  color: "inherit",
  display: "block",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "6px",
  padding: "1rem",
  flex: "1 1 320px",
};

const KpiCard = ({ label, value, to }: { label: string; value: number; to?: string }) => {
  const content = (
    <div style={cardStyle}>
      <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "#555" }}>{label}</div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
};

// Every section prop is `undefined` (no permission — omitted entirely),
// `{status:"error"}` (that one module's query failed), or `{status:"ok",
// ...}` (real data, possibly zero). These three outcomes are never
// conflated: a missing section is never shown as zero, and a failed section
// never fabricates a number.
const SectionBlock = <T extends Record<string, unknown>>({
  title,
  section,
  render,
}: {
  title: string;
  section: SectionResult<T> | undefined;
  render: (data: T) => React.ReactNode;
}) => {
  if (!section) return null;
  return (
    <div style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {section.status === "error" ? (
        <p role="alert" style={{ color: "crimson" }}>
          Could not load this section right now.
        </p>
      ) : (
        render(section as T)
      )}
    </div>
  );
};

const healthColor = { healthy: "#16a34a", degraded: "#d97706", unavailable: "#dc2626" } as const;

export const DashboardPage = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboard());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p>Loading dashboard…</p>;
  if (error) {
    return (
      <div>
        <p role="alert" style={{ color: "crimson" }}>{error}</p>
        <button type="button" onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const { overview } = data;
  const hasAnyOverviewCard = Object.keys(overview).length > 0;

  return (
    <div>
      <h1>Dashboard</h1>
      <p style={{ color: "#555" }}>Your operational starting point — a live snapshot of what needs attention right now.</p>

      {hasAnyOverviewCard && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
          {overview.totalUsers !== undefined && <KpiCard label="Total Users" value={overview.totalUsers} to="/users" />}
          {overview.activeUsers !== undefined && <KpiCard label="Active Users" value={overview.activeUsers} to="/users" />}
          {overview.totalDevices !== undefined && <KpiCard label="Total Devices" value={overview.totalDevices} />}
          {overview.openSupportCases !== undefined && (
            <KpiCard label="Open Support Cases" value={overview.openSupportCases} to="/support/cases" />
          )}
          {overview.openRiskCases !== undefined && <KpiCard label="Open Risk Cases" value={overview.openRiskCases} to="/risk/cases" />}
          {overview.openSecurityCases !== undefined && (
            <KpiCard label="Open Security Cases" value={overview.openSecurityCases} to="/security/cases" />
          )}
          {overview.pendingApprovals !== undefined && (
            <KpiCard label="Pending Approvals" value={overview.pendingApprovals} to="/approvals" />
          )}
          {overview.unreadNotifications !== undefined && (
            <KpiCard label="Unread Notifications" value={overview.unreadNotifications} to="/notifications" />
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <SectionBlock
          title="Support / App Issues"
          section={data.support}
          render={(support) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Open: {support.open}</li>
              <li>Unassigned (needs attention): {support.unassigned}</li>
              <li>Resolved in the last 7 days: {support.recentlyResolved}</li>
              {data.appIssues?.status === "ok" && (
                <>
                  <li>App issues open: {data.appIssues.open}</li>
                  <li>App issues in progress: {data.appIssues.inProgress}</li>
                  <li>App issues reported in the last 7 days: {data.appIssues.recent}</li>
                </>
              )}
            </ul>
          )}
        />

        <SectionBlock
          title="Risk"
          section={data.risk}
          render={(risk) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Low: {risk.openBySeverity.low}</li>
              <li>Medium: {risk.openBySeverity.medium}</li>
              <li>High: {risk.openBySeverity.high}</li>
              <li>Critical: {risk.openBySeverity.critical}</li>
              <li>Under investigation: {risk.investigating}</li>
              <li>New in the last 7 days: {risk.recentlyCreated}</li>
            </ul>
          )}
        />

        <SectionBlock
          title="Security"
          section={data.security}
          render={(security) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Low: {security.openBySeverity.low}</li>
              <li>Medium: {security.openBySeverity.medium}</li>
              <li>High: {security.openBySeverity.high}</li>
              <li>Critical: {security.openBySeverity.critical}</li>
              <li>Under investigation: {security.investigating}</li>
              <li>New in the last 7 days: {security.recentlyCreated}</li>
              {security.pendingSecurityActions !== undefined && (
                <li>Pending security actions: {security.pendingSecurityActions}</li>
              )}
            </ul>
          )}
        />

        <SectionBlock
          title="Approvals"
          section={data.approvals}
          render={(approvals) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Pending: {approvals.pending}</li>
              <li>Approved in the last 7 days: {approvals.recentlyApproved}</li>
              <li>Rejected in the last 7 days: {approvals.recentlyRejected}</li>
            </ul>
          )}
        />

        <SectionBlock
          title="Campaigns"
          section={data.campaigns}
          render={(campaigns) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Active: {campaigns.active}</li>
              <li>Scheduled: {campaigns.scheduled}</li>
              <li>Completed in the last 7 days: {campaigns.recentlyCompleted}</li>
            </ul>
          )}
        />

        <SectionBlock
          title="Rewards"
          section={data.rewards}
          render={(rewards) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Active: {rewards.active}</li>
              <li>Paused: {rewards.paused}</li>
              <li>Expiring within 7 days: {rewards.expiringSoon}</li>
              <li>Expired: {rewards.expired}</li>
            </ul>
          )}
        />

        <SectionBlock
          title="Users / Devices"
          section={data.users}
          render={(users) => (
            <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
              <li>Total users: {users.total}</li>
              <li>Active users: {users.active}</li>
              <li>Inactive users: {users.inactive}</li>
              <li>Created in the last 7 days: {users.recentlyCreated}</li>
              {data.devices?.status === "ok" && (
                <>
                  <li>Total devices: {data.devices.total}</li>
                  <li>Active devices: {data.devices.active}</li>
                  <li>Inactive devices: {data.devices.inactive}</li>
                </>
              )}
            </ul>
          )}
        />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>System Health</h3>
        <p>
          <span style={{ color: healthColor[data.systemHealth.status], fontWeight: 600, textTransform: "uppercase" }}>
            {data.systemHealth.status}
          </span>
        </p>
        <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
          <li>Database: {data.systemHealth.database}</li>
          <li>Redis: {data.systemHealth.redis}</li>
        </ul>
      </div>
    </div>
  );
};
