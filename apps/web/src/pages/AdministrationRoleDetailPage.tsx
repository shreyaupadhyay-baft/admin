import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  disableAdministrationRole,
  enableAdministrationRole,
  fetchAdministrationPermissions,
  fetchAdministrationRole,
  updateAdministrationRole,
  updateRolePermissions,
  type PermissionRecord,
  type RoleDetail,
} from "../api/administration.js";
import { useAuth } from "../context/AuthContext.js";

export const AdministrationRoleDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [role, setRole] = useState<RoleDetail | null>(null);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, PermissionRecord[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [roleData, permsData] = await Promise.all([fetchAdministrationRole(id), fetchAdministrationPermissions()]);
      setRole(roleData);
      setGroupedPermissions(permsData.groupedByResource);
      setDescription(roleData.description);
      setSelectedPermissionIds(new Set(roleData.permissions.map((p) => p.id)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load role.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing role id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>{error}</p>
    );
  }
  if (!role) return null;

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

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const canEditPermissions = can("administration.roles.permissions.update");

  return (
    <div>
      <h1>{role.name}</h1>
      {role.isSystem && <p><em>System role{role.name === "Super Admin" ? " — identity and permissions are immutable" : ""}</em></p>}

      <section>
        <h2>Metadata</h2>
        <p>Assigned admins: {role.assignedAdminCount}</p>
        <p>Status: {role.isActive ? "Active" : "Disabled"}</p>
        {can("administration.roles.update") && (
          <div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateAdministrationRole(id, { description }); })}>
              Save description
            </button>
          </div>
        )}
        {can("administration.roles.status.update") && (
          role.isActive ? (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await disableAdministrationRole(id); })}>
              Disable role
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await enableAdministrationRole(id); })}>
              Enable role
            </button>
          )
        )}
      </section>

      <section>
        <h2>Permissions</h2>
        {Object.entries(groupedPermissions).map(([resource, permissions]) => (
          <div key={resource}>
            <h3>{resource}</h3>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {permissions.map((p) => (
                <li key={p.id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!canEditPermissions}
                      checked={selectedPermissionIds.has(p.id)}
                      onChange={() => togglePermission(p.id)}
                    />
                    {p.key}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {canEditPermissions && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(async () => { await updateRolePermissions(id, [...selectedPermissionIds]); })}
          >
            Save permissions
          </button>
        )}
      </section>
    </div>
  );
};
