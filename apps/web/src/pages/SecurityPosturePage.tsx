import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { fetchSecurityPosture, type SecurityPosture } from "../api/security.js";

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: "1rem", minWidth: 140 }}>
    <div style={{ fontSize: "1.75rem", fontWeight: 600 }}>{value}</div>
    <div style={{ color: "#555" }}>{label}</div>
  </div>
);

export const SecurityPosturePage = () => {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSecurityPosture()
      .then((data) => {
        if (!cancelled) setPosture(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load security posture.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>{error}</p>
    );
  }
  if (!posture) return null;

  return (
    <div>
      <h1>Security Posture</h1>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <StatTile label="Active Cases" value={posture.activeSecurityCases} />
        <StatTile label="Critical Cases" value={posture.criticalSecurityCases} />
        <StatTile label="High-Severity Events (7d)" value={posture.highSeverityEvents} />
        <StatTile label="Blocked Users" value={posture.blockedUsers} />
        <StatTile label="Pending Actions" value={posture.pendingSecurityActions} />
      </div>

      <h2>Recent Security Events</h2>
      {posture.recentSecurityEvents.length === 0 ? (
        <p>No recent security events.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Severity</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {posture.recentSecurityEvents.map((event) => (
              <tr key={event.id}>
                <td>{event.eventType}</td>
                <td>{event.category}</td>
                <td>{event.severity}</td>
                <td>{new Date(event.detectedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
