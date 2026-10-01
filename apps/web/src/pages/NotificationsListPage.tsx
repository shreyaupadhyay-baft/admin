import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resourceRoute,
  type Notification,
  type NotificationSeverity,
  type NotificationStatus,
} from "../api/notifications.js";

const PAGE_SIZE = 20;
const SEVERITIES: NotificationSeverity[] = ["info", "success", "warning", "critical"];
const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  info: "#2563eb",
  success: "#16a34a",
  warning: "#d97706",
  critical: "#dc2626",
};

export const NotificationsListPage = () => {
  const [status, setStatus] = useState<NotificationStatus | "">("");
  const [severity, setSeverity] = useState<NotificationSeverity | "">("");
  const [offset, setOffset] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        severity: severity || undefined,
      });
      setNotifications(res.notifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [status, severity, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkRead = async (id: string) => {
    setBusyId(id);
    try {
      await markNotificationRead(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark as read.");
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div>
      <h1>Notifications</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center" }}>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as NotificationStatus | ""); }}>
          <option value="">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        <select value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value as NotificationSeverity | ""); }}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="button" disabled={markingAll} onClick={() => void handleMarkAllRead()}>
          Mark all as read
        </button>
      </div>

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : notifications.length === 0 ? (
        <p>No notifications.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {notifications.map((n) => {
            const route = resourceRoute(n.resourceType, n.resourceId);
            return (
              <li
                key={n.id}
                style={{
                  borderLeft: `4px solid ${SEVERITY_COLORS[n.severity]}`,
                  padding: "0.5rem 0.75rem",
                  marginBottom: "0.5rem",
                  background: n.status === "unread" ? "#f8fafc" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <div>
                    <strong>{n.title}</strong>
                    {n.status === "unread" && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: SEVERITY_COLORS[n.severity] }}>● unread</span>}
                    <div>{n.message}</div>
                    <div style={{ fontSize: "0.8rem", color: "#555" }}>
                      {n.type} · {new Date(n.createdAt).toLocaleString()}
                      {route && (
                        <>
                          {" · "}
                          <Link to={route} onClick={() => { if (n.status === "unread") void handleMarkRead(n.id); }}>
                            View related resource
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  {n.status === "unread" && (
                    <button type="button" disabled={busyId === n.id} onClick={() => void handleMarkRead(n.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={notifications.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
