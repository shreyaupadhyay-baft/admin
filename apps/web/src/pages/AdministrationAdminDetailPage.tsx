import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { AdministrationAuditLog } from "../api/administration.js";
import { ApiError } from "../api/client.js";
import {
  assignAdministrationRole,
  disableAdministrationAdmin,
  enableAdministrationAdmin,
  fetchAdminSessions,
  fetchAdministrationAdmin,
  fetchAdministrationAudit,
  fetchAdministrationRoles,
  removeAdministrationRole,
  revokeAdminSessions,
  updateAdministrationAdmin,
  type AdminDetail,
  type AdminSession,
  type RoleSummary,
} from "../api/administration.js";
import { useAuth } from "../context/AuthContext.js";

export const AdministrationAdminDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [admin, setAdmin] = useState<AdminDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [activity, setActivity] = useState<AdministrationAuditLog[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [assignRoleId, setAssignRoleId] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [adminData, sessionData, activityData, rolesData] = await Promise.all([
        fetchAdministrationAdmin(id),
        can("administration.admins.sessions.read") ? fetchAdminSessions(id) : Promise.resolve({ sessions: [], limit: 0, offset: 0 }),
        can("administration.audit.read") ? fetchAdministrationAudit({ targetId: id, limit: 10 }) : Promise.resolve({ auditLogs: [], limit: 0, offset: 0 }),
        fetchAdministrationRoles({ limit: 100, isActive: true }),
      ]);
      setAdmin(adminData);
      setSessions(sessionData.sessions);
      setActivity(activityData.auditLogs);
      setAvailableRoles(rolesData.roles);
      setFullName(adminData.fullName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admin.");
    } finally {
      setLoading(false);
    }
  }, [id, can]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing admin id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>{error}</p>
    );
  }
  if (!admin) return null;

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const assignedRoleIds = new Set(admin.roles.map((r) => r.id));
  const assignableRoles = availableRoles.filter((r) => !assignedRoleIds.has(r.id));

  return (
    <div>
      <h1>{admin.fullName}</h1>

      <section>
        <h2>Profile</h2>
        {can("administration.admins.update") && (
          <div>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateAdministrationAdmin(id, { fullName }); })}>
              Save
            </button>
          </div>
        )}
        <p>Email: {admin.email}</p>
        <p>Created: {new Date(admin.createdAt).toLocaleString()}</p>
        <p>Last login: {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : "Never"}</p>
      </section>

      <section>
        <h2>Status</h2>
        <p>{admin.isActive ? "Active" : "Disabled"}</p>
        {can("administration.admins.status.update") && (
          admin.isActive ? (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await disableAdministrationAdmin(id); })}>
              Disable
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await enableAdministrationAdmin(id); })}>
              Enable
            </button>
          )
        )}
      </section>

      <section>
        <h2>Roles</h2>
        <ul>
          {admin.roles.map((r) => (
            <li key={r.id}>
              {r.name} {!r.isActive && "(role disabled)"}
              {can("administration.admins.roles.update") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => { await removeAdministrationRole(id, r.id); })}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {can("administration.admins.roles.update") && (
          <div>
            <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)}>
              <option value="">Select a role…</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !assignRoleId}
              onClick={() => void runAction(async () => { await assignAdministrationRole(id, assignRoleId); setAssignRoleId(""); })}
            >
              Assign role
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Active Sessions ({admin.activeSessionCount})</h2>
        {can("administration.admins.sessions.read") && (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>User Agent</th>
                <th>IP</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                  <td>{s.userAgent ?? "—"}</td>
                  <td>{s.ipAddress ?? "—"}</td>
                  <td>{s.isActive ? "Active" : "Revoked/expired"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can("administration.admins.sessions.revoke") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await revokeAdminSessions(id); })}>
            Revoke all sessions
          </button>
        )}
      </section>

      {can("administration.audit.read") && (
        <section>
          <h2>Recent Activity</h2>
          {activity.length === 0 ? (
            <p>No recorded activity.</p>
          ) : (
            <ul>
              {activity.map((log) => (
                <li key={log.id}>
                  <strong>{log.action}</strong> — {new Date(log.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
