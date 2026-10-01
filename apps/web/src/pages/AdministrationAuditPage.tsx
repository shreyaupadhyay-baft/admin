import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { fetchAdministrationAudit, type AdministrationAuditLog } from "../api/administration.js";

const PAGE_SIZE = 25;

type DatePreset = "today" | "7d" | "30d" | "custom";

// A date-only <input type="date"> value (e.g. "2026-09-30") parses as UTC
// midnight. Used as dateFrom that's the correct inclusive start of day; used
// as-is for dateTo it would WRONGLY exclude the entire day except its first
// instant. So dateTo is explicitly pushed to the end of that same day here —
// an inclusive upper bound, made explicit rather than left to silently
// truncate the last day of the range.
const toEndOfDayIso = (dateOnly: string): string => {
  const d = new Date(dateOnly);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
};

const toStartOfDayIso = (dateOnly: string): string => new Date(dateOnly).toISOString();

const isoDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export const AdministrationAuditPage = () => {
  const [search, setSearch] = useState("");
  const [actorAdminId, setActorAdminId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState<DatePreset>("custom");
  const [offset, setOffset] = useState(0);

  const [logs, setLogs] = useState<AdministrationAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdministrationAudit({
        limit: PAGE_SIZE,
        offset,
        search: search.trim() || undefined,
        actorAdminId: actorAdminId.trim() || undefined,
        action: action.trim() || undefined,
        targetType: targetType.trim() || undefined,
        targetId: targetId.trim() || undefined,
        dateFrom: dateFrom ? toStartOfDayIso(dateFrom) : undefined,
        dateTo: dateTo ? toEndOfDayIso(dateTo) : undefined,
      });
      setLogs(res.auditLogs);
      setTotal(res.total);
      setHasNext(res.hasNext);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the audit trail.");
    } finally {
      setLoading(false);
    }
  }, [search, actorAdminId, action, targetType, targetId, dateFrom, dateTo, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (next: DatePreset) => {
    setOffset(0);
    setPreset(next);
    const now = new Date();
    if (next === "today") {
      setDateFrom(isoDateOnly(now));
      setDateTo(isoDateOnly(now));
    } else if (next === "7d") {
      setDateFrom(isoDateOnly(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)));
      setDateTo(isoDateOnly(now));
    } else if (next === "30d") {
      setDateFrom(isoDateOnly(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)));
      setDateTo(isoDateOnly(now));
    }
  };

  const clearFilters = () => {
    setOffset(0);
    setSearch("");
    setActorAdminId("");
    setAction("");
    setTargetType("");
    setTargetId("");
    setDateFrom("");
    setDateTo("");
    setPreset("custom");
  };

  const hasActiveFilters = Boolean(search || actorAdminId || action || targetType || targetId || dateFrom || dateTo);

  return (
    <div>
      <h1>Audit</h1>
      <p style={{ color: "#555" }}>
        Investigate administrative activity across BAFT Admin. Read-only — there are no mutation controls here.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <input
          placeholder="Search action, actor, resource, or target…"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
          style={{ minWidth: "260px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Actor admin id" value={actorAdminId} onChange={(e) => { setOffset(0); setActorAdminId(e.target.value); }} />
        <input placeholder="Action" value={action} onChange={(e) => { setOffset(0); setAction(e.target.value); }} />
        <input placeholder="Resource (target type)" value={targetType} onChange={(e) => { setOffset(0); setTargetType(e.target.value); }} />
        <input placeholder="Target id" value={targetId} onChange={(e) => { setOffset(0); setTargetId(e.target.value); }} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={preset === "today"} onClick={() => applyPreset("today")}>Today</button>
        <button type="button" disabled={preset === "7d"} onClick={() => applyPreset("7d")}>Last 7 days</button>
        <button type="button" disabled={preset === "30d"} onClick={() => applyPreset("30d")}>Last 30 days</button>
        <input type="date" value={dateFrom} onChange={(e) => { setOffset(0); setPreset("custom"); setDateFrom(e.target.value); }} />
        <span>to</span>
        <input type="date" value={dateTo} onChange={(e) => { setOffset(0); setPreset("custom"); setDateTo(e.target.value); }} />
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : logs.length === 0 ? (
        <p>{hasActiveFilters ? "No audit events match these filters." : "No audit events yet."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>
                  <Link to={`/administration/audit/${log.id}`}>{new Date(log.createdAt).toLocaleString()}</Link>
                </td>
                <td>{log.actorFullName ?? log.actorEmail ?? (log.actorAdminId ? log.actorAdminId : "system")}</td>
                <td><code>{log.action}</code></td>
                <td>{log.targetType ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{log.targetId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
        {!loading && (
          <span style={{ color: "#555", fontSize: "0.85rem" }}>
            {total === 0 ? "0 results" : `${offset + 1}–${offset + logs.length} of ${total}`}
          </span>
        )}
      </div>
    </div>
  );
};
