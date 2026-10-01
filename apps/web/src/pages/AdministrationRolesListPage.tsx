import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { createAdministrationRole, fetchAdministrationRoles, type RoleSummary } from "../api/administration.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;

export const AdministrationRolesListPage = () => {
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<"" | "true" | "false">("");
  const [offset, setOffset] = useState(0);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdministrationRoles({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        isActive: isActive === "" ? undefined : isActive === "true",
      });
      setRoles(res.roles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roles.");
    } finally {
      setLoading(false);
    }
  }, [search, isActive, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createAdministrationRole({ name: newName, permissionIds: [] });
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create role.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Roles</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="search"
          placeholder="Search name or description"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
        />
        <select value={isActive} onChange={(e) => { setOffset(0); setIsActive(e.target.value as "" | "true" | "false"); }}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
        {can("administration.roles.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Create role"}
          </button>
        )}
      </div>

      {showCreate && can("administration.roles.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Role name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="button" disabled={creating || !newName.trim()} onClick={() => void handleCreate()}>
            Create (permissions can be added on the role's detail page)
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
              <th>Name</th>
              <th>Description</th>
              <th>System</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>
                  <Link to={`/administration/roles/${role.id}`}>{role.name}</Link>
                </td>
                <td>{role.description}</td>
                <td>{role.isSystem ? "Yes" : "No"}</td>
                <td>{role.isActive ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={roles.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
