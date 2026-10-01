import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  fetchSupportCases,
  type SupportCase,
  type SupportCaseCategory,
  type SupportCasePriority,
  type SupportCaseStatus,
} from "../api/support.js";

const PAGE_SIZE = 20;

export const SupportCasesListPage = () => {
  const [status, setStatus] = useState<SupportCaseStatus | "">("");
  const [category, setCategory] = useState<SupportCaseCategory | "">("");
  const [priority, setPriority] = useState<SupportCasePriority | "">("");
  const [offset, setOffset] = useState(0);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSupportCases({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        category: category || undefined,
        priority: priority || undefined,
      });
      setCases(res.cases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load support cases.");
    } finally {
      setLoading(false);
    }
  }, [status, category, priority, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>Support Cases</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value as SupportCaseStatus | "");
          }}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={category}
          onChange={(e) => {
            setOffset(0);
            setCategory(e.target.value as SupportCaseCategory | "");
          }}
        >
          <option value="">All categories</option>
          <option value="account">Account</option>
          <option value="technical">Technical</option>
          <option value="app_issue">App issue</option>
          <option value="other">Other</option>
        </select>
        <select
          value={priority}
          onChange={(e) => {
            setOffset(0);
            setPriority(e.target.value as SupportCasePriority | "");
          }}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
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
              <th>Subject</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((supportCase) => (
              <tr key={supportCase.id}>
                <td>
                  <Link to={`/support/cases/${supportCase.id}`}>{supportCase.subject}</Link>
                </td>
                <td>{supportCase.category}</td>
                <td>{supportCase.priority}</td>
                <td>{supportCase.status}</td>
                <td>{new Date(supportCase.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={cases.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
