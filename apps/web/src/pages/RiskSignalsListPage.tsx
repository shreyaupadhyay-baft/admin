import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import {
  createRiskSignal,
  fetchRiskSignals,
  updateRiskSignalStatus,
  type RiskCategory,
  type RiskSeverity,
  type RiskSignal,
  type RiskSignalStatus,
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
const SEVERITIES: RiskSeverity[] = ["low", "medium", "high", "critical"];

export const RiskSignalsListPage = () => {
  const { can } = useAuth();

  const [category, setCategory] = useState<RiskCategory | "">("");
  const [severity, setSeverity] = useState<RiskSeverity | "">("");
  const [status, setStatus] = useState<RiskSignalStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState("");
  const [newCategory, setNewCategory] = useState<RiskCategory>("fraud");
  const [newSource, setNewSource] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRiskSignals({
        limit: PAGE_SIZE,
        offset,
        category: category || undefined,
        severity: severity || undefined,
        status: status || undefined,
      });
      setSignals(res.signals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load risk signals.");
    } finally {
      setLoading(false);
    }
  }, [category, severity, status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createRiskSignal({ signalType: newType, category: newCategory, source: newSource, description: newDescription });
      setNewType("");
      setNewSource("");
      setNewDescription("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create risk signal.");
    } finally {
      setCreating(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    setBusyId(id);
    try {
      await updateRiskSignalStatus(id, "acknowledged");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update signal.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1>Risk Signals</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select value={category} onChange={(e) => { setOffset(0); setCategory(e.target.value as RiskCategory | ""); }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value as RiskSeverity | ""); }}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as RiskSignalStatus | ""); }}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="dismissed">Dismissed</option>
          <option value="escalated">Escalated</option>
        </select>
        {can("risk_signals.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Record signal"}
          </button>
        )}
      </div>

      {showCreate && can("risk_signals.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Signal type" value={newType} onChange={(e) => setNewType(e.target.value)} />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as RiskCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input placeholder="Source" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
          <input placeholder="Description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <button type="button" disabled={creating || !newType || !newSource || !newDescription} onClick={() => void handleCreate()}>
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
              <th>Type</th>
              <th>Category</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Status</th>
              <th>Detected</th>
              {can("risk_signals.status.update") && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal.id}>
                <td>{signal.signalType}</td>
                <td>{signal.category}</td>
                <td>{signal.severity}</td>
                <td>{signal.source}</td>
                <td>{signal.status}</td>
                <td>{new Date(signal.detectedAt).toLocaleString()}</td>
                {can("risk_signals.status.update") && (
                  <td>
                    {signal.status === "new" && (
                      <button type="button" disabled={busyId === signal.id} onClick={() => void handleAcknowledge(signal.id)}>
                        Acknowledge
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
        <button type="button" disabled={signals.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
