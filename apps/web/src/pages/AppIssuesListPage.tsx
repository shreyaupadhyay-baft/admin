import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import {
  fetchAppIssues,
  resolveAppIssue,
  type AppIssue,
  type AppIssueSeverity,
  type AppIssueSource,
  type AppIssueStatus,
} from "../api/support.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;

export const AppIssuesListPage = () => {
  const { can } = useAuth();

  const [status, setStatus] = useState<AppIssueStatus | "">("");
  const [source, setSource] = useState<AppIssueSource | "">("");
  const [severity, setSeverity] = useState<AppIssueSeverity | "">("");
  const [offset, setOffset] = useState(0);
  const [issues, setIssues] = useState<AppIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAppIssues({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        source: source || undefined,
        severity: severity || undefined,
      });
      setIssues(res.appIssues);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load app issues.");
    } finally {
      setLoading(false);
    }
  }, [status, source, severity, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResolve = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await resolveAppIssue(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resolve issue.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1>App Issues</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value as AppIssueStatus | "");
          }}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={source}
          onChange={(e) => {
            setOffset(0);
            setSource(e.target.value as AppIssueSource | "");
          }}
        >
          <option value="">All sources</option>
          <option value="IN_APP">In-app</option>
          <option value="USER_REPORTED">User reported</option>
        </select>
        <select
          value={severity}
          onChange={(e) => {
            setOffset(0);
            setSeverity(e.target.value as AppIssueSeverity | "");
          }}
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
              {can("app_issues.resolve") && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id}>
                <td>{issue.title}</td>
                <td>{issue.source}</td>
                <td>{issue.severity}</td>
                <td>{issue.status}</td>
                <td>{new Date(issue.createdAt).toLocaleString()}</td>
                {can("app_issues.resolve") && (
                  <td>
                    {issue.status !== "resolved" && (
                      <button type="button" disabled={busyId === issue.id} onClick={() => void handleResolve(issue.id)}>
                        Resolve
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={issues.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
