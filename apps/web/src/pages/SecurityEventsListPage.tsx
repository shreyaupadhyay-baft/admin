import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import {
  createSecurityEvent,
  fetchSecurityEvents,
  type SecurityCategory,
  type SecurityEvent,
  type SecurityEventStatus,
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
const SEVERITIES: SecuritySeverity[] = ["low", "medium", "high", "critical"];

export const SecurityEventsListPage = () => {
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SecurityCategory | "">("");
  const [severity, setSeverity] = useState<SecuritySeverity | "">("");
  const [status, setStatus] = useState<SecurityEventStatus | "">("");
  const [source, setSource] = useState("");
  const [detectedFrom, setDetectedFrom] = useState("");
  const [detectedTo, setDetectedTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState("");
  const [newCategory, setNewCategory] = useState<SecurityCategory>("authentication");
  const [newSource, setNewSource] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSecurityEvents({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        category: category || undefined,
        severity: severity || undefined,
        status: status || undefined,
        source: source || undefined,
        detectedFrom: detectedFrom ? new Date(detectedFrom).toISOString() : undefined,
        detectedTo: detectedTo ? new Date(detectedTo).toISOString() : undefined,
      });
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load security events.");
    } finally {
      setLoading(false);
    }
  }, [search, category, severity, status, source, detectedFrom, detectedTo, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createSecurityEvent({ eventType: newType, category: newCategory, source: newSource, description: newDescription });
      setNewType("");
      setNewSource("");
      setNewDescription("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create security event.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Security Events</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search type or description"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
        />
        <select value={category} onChange={(e) => { setOffset(0); setCategory(e.target.value as SecurityCategory | ""); }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value as SecuritySeverity | ""); }}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as SecurityEventStatus | ""); }}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="dismissed">Dismissed</option>
          <option value="escalated">Escalated</option>
        </select>
        <input placeholder="Source" value={source} onChange={(e) => { setOffset(0); setSource(e.target.value); }} />
        <input type="date" value={detectedFrom} onChange={(e) => { setOffset(0); setDetectedFrom(e.target.value); }} />
        <input type="date" value={detectedTo} onChange={(e) => { setOffset(0); setDetectedTo(e.target.value); }} />
        {can("security_events.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Record event"}
          </button>
        )}
      </div>

      {showCreate && can("security_events.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Event type" value={newType} onChange={(e) => setNewType(e.target.value)} />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as SecurityCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
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
        <p role="alert" style={{ color: "crimson" }}>{error}</p>
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
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.eventType}</td>
                <td>{event.category}</td>
                <td>{event.severity}</td>
                <td>{event.source}</td>
                <td>{event.status}</td>
                <td>{new Date(event.detectedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={events.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
