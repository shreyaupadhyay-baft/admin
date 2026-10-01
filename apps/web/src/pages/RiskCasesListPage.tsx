import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  createRiskCase,
  fetchRiskCases,
  type RiskCase,
  type RiskCaseStatus,
  type RiskCategory,
  type RiskSeverity,
} from "../api/risk.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;
const CATEGORIES: RiskCategory[] = [
  "account_identity",
  "authentication_security",
  "fraud",
  "transaction_payment",
  "device",
  "behavioral",
  "integration_provider",
  "operational",
  "system_technical",
  "privacy_data",
  "ai_model",
];

export const RiskCasesListPage = () => {
  const { can } = useAuth();

  const [status, setStatus] = useState<RiskCaseStatus | "">("");
  const [severity, setSeverity] = useState<RiskSeverity | "">("");
  const [category, setCategory] = useState<RiskCategory | "">("");
  const [offset, setOffset] = useState(0);
  const [cases, setCases] = useState<RiskCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<RiskCategory>("fraud");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRiskCases({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        severity: severity || undefined,
        category: category || undefined,
      });
      setCases(res.cases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load risk cases.");
    } finally {
      setLoading(false);
    }
  }, [status, severity, category, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createRiskCase({ title: newTitle, category: newCategory });
      setNewTitle("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open risk case.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Risk Cases</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as RiskCaseStatus | ""); }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="triaged">Triaged</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value as RiskSeverity | ""); }}>
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select value={category} onChange={(e) => { setOffset(0); setCategory(e.target.value as RiskCategory | ""); }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {can("risk_cases.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Open case"}
          </button>
        )}
      </div>

      {showCreate && can("risk_cases.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Case title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as RiskCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" disabled={creating || !newTitle.trim()} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      )}

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
              <th>Case #</th>
              <th>Title</th>
              <th>Category</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((riskCase) => (
              <tr key={riskCase.id}>
                <td>
                  <Link to={`/risk/cases/${riskCase.id}`}>{riskCase.caseNumber}</Link>
                </td>
                <td>{riskCase.title}</td>
                <td>{riskCase.category}</td>
                <td>{riskCase.severity}</td>
                <td>{riskCase.status}</td>
                <td>{new Date(riskCase.createdAt).toLocaleString()}</td>
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
