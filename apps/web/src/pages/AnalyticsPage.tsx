import { Link, Navigate, useParams } from "react-router-dom";
import { ANALYTICS_SECTIONS, type AnalyticsSectionKey } from "../api/analytics.js";
import { AnalyticsSection } from "../components/analytics/AnalyticsSection.js";
import { useAuth } from "../context/AuthContext.js";

export const ANALYTICS_TABS: Record<AnalyticsSectionKey, { label: string; permission: string }> = {
  overview: { label: "Overview", permission: "analytics.overview.read" },
  onboarding: { label: "Onboarding Users", permission: "analytics.onboarding.read" },
  features: { label: "Feature Usage", permission: "analytics.features.read" },
  retention: { label: "User Retention", permission: "analytics.retention.read" },
  usage: { label: "BAFT Usage", permission: "analytics.usage.read" },
  rewards: { label: "Rewards", permission: "analytics.rewards.read" },
  financial: { label: "Financial Analysis", permission: "analytics.financial.read" },
};

export const AnalyticsPage = () => {
  const { section } = useParams<{ section?: string }>();
  const { can } = useAuth();
  const permitted = ANALYTICS_SECTIONS.filter((s) => can(ANALYTICS_TABS[s].permission));

  if (permitted.length === 0) return <p role="alert">You do not have access to Analytics.</p>;
  const current = ANALYTICS_SECTIONS.find((s) => s === section);
  if (!current) return <Navigate to={`/analytics/${permitted[0]}`} replace />;

  return (
    <div>
      <h1>Analytics</h1>
      <nav aria-label="Analytics sections">
        <ul style={{ display: "flex", gap: "1rem", listStyle: "none", padding: 0, flexWrap: "wrap" }}>
          {permitted.map((s) => (
            <li key={s}>
              <Link to={`/analytics/${s}`} aria-current={s === current ? "page" : undefined} style={{ fontWeight: s === current ? 700 : 400 }}>
                {ANALYTICS_TABS[s].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <AnalyticsSection key={current} section={current} title={ANALYTICS_TABS[current].label} canRead={can(ANALYTICS_TABS[current].permission)} />
    </div>
  );
};
