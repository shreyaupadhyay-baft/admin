import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { fetchAdministrationAuditDetail, type AdministrationAuditLog } from "../api/administration.js";

const renderMetadataValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

export const AdministrationAuditDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<AdministrationAuditLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setLog(await fetchAdministrationAuditDetail(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load this audit event.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing audit event id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) return <p role="alert" style={{ color: "crimson" }}>{error}</p>;
  if (!log) return null;

  const metadataEntries = Object.entries(log.metadata ?? {});

  return (
    <div>
      <h1>Audit Event</h1>
      <p style={{ color: "#555" }}>A single administrative activity record. Read-only.</p>

      <table style={{ marginBottom: "1.5rem" }}>
        <tbody>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Timestamp</th>
            <td>{new Date(log.createdAt).toLocaleString()}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Actor</th>
            <td>
              {log.actorFullName ? `${log.actorFullName} (${log.actorEmail})` : log.actorEmail ?? (log.actorAdminId ? log.actorAdminId : "system")}
            </td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Action</th>
            <td><code>{log.action}</code></td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Resource</th>
            <td>{log.targetType ?? "—"}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Target</th>
            <td style={{ fontFamily: "monospace" }}>{log.targetId ?? "—"}</td>
          </tr>
          {(log.requestId || log.correlationId) && (
            <tr>
              <th style={{ textAlign: "left", paddingRight: "1rem" }}>Request / Correlation</th>
              <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                {log.requestId ?? "—"} / {log.correlationId ?? "—"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Metadata</h2>
      {metadataEntries.length === 0 ? (
        <p style={{ color: "#555" }}>No additional metadata was recorded for this event.</p>
      ) : (
        <table>
          <tbody>
            {metadataEntries.map(([key, value]) => (
              <tr key={key}>
                <th style={{ textAlign: "left", paddingRight: "1rem", verticalAlign: "top" }}>{key}</th>
                <td style={{ whiteSpace: "pre-wrap", fontFamily: typeof value === "object" ? "monospace" : "inherit" }}>
                  {renderMetadataValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
