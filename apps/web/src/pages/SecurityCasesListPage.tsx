import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  createSecurityCase,
  fetchSecurityCases,
  type SecurityCase,
  type SecurityCaseStatus,
  type SecurityCategory,
  type SecuritySeverity,
} from "../api/security.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;
const CATEGORIES: SecurityCategory[] = [
  "authentication",
  "account",
  "device",
  "access",
  "session",
  "api",
  "integration",
  "privacy",
  "configuration",
  "system",
];

export const SecurityCasesListPage = () => {
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SecurityCaseStatus | "">("");
  const [severity, setSeverity] = useState<SecuritySeverity | "">("");
  const [category, setCategory] = useState<SecurityCategory | "">("");
  const [assignedAdminId, setAssignedAdminId] = useState("");
  const [offset, setOffset] = useState(0);
  const [cases, setCases] = useState<SecurityCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<SecurityCategory>("authentication");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSecurityCases({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        status: status || undefined,
        severity: severity || undefined,
        category: category || undefined,
        assignedAdminId: assignedAdminId || undefined,
      });
      setCases(res.cases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load security cases.");
    } finally {
      setLoading(false);
    }
  }, [search, status, severity, category, assignedAdminId, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createSecurityCase({ title: newTitle, category: newCategory });
      setNewTitle("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open security case.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Security Cases</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search title, summary, or case #"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
        />
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as SecurityCaseStatus | ""); }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="triaged">Triaged</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value as SecuritySeverity | ""); }}>
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select value={category} onChange={(e) => { setOffset(0); setCategory(e.target.value as SecurityCategory | ""); }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          placeholder="Assignee admin id"
          value={assignedAdminId}
          onChange={(e) => { setOffset(0); setAssignedAdminId(e.target.value); }}
        />
        {can("security_cases.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Open case"}
          </button>
        )}
      </div>

      {showCreate && can("security_cases.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Case title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as SecurityCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="button" disabled={creating || !newTitle.trim()} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      )}

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

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
            {cases.map((securityCase) => (
              <tr key={securityCase.id}>
                <td>
                  <Link to={`/security/cases/${securityCase.id}`}>{securityCase.caseNumber}</Link>
                </td>
                <td>{securityCase.title}</td>
                <td>{securityCase.category}</td>
                <td>{securityCase.severity}</td>
                <td>{securityCase.status}</td>
                <td>{new Date(securityCase.createdAt).toLocaleString()}</td>
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
