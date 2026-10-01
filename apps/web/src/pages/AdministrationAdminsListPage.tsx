import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  createAdministrationAdmin,
  fetchAdministrationAdmins,
  fetchAdministrationRoles,
  type AdminSort,
  type AdminSummary,
  type RoleSummary,
} from "../api/administration.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;

export const AdministrationAdminsListPage = () => {
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<"" | "true" | "false">("");
  const [roleId, setRoleId] = useState("");
  const [sort, setSort] = useState<AdminSort>("created_at_desc");
  const [offset, setOffset] = useState(0);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAdministrationRoles({ limit: 100 })
      .then((res) => setRoles(res.roles))
      .catch(() => {
        // Role filter dropdown is a UX convenience; a failure here shouldn't block the admin list itself.
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdministrationAdmins({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        isActive: isActive === "" ? undefined : isActive === "true",
        roleId: roleId || undefined,
        sort,
      });
      setAdmins(res.admins);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admins.");
    } finally {
      setLoading(false);
    }
  }, [search, isActive, roleId, sort, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createAdministrationAdmin({ email: newEmail, password: newPassword, fullName: newFullName });
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create admin.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Admins</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
        />
        <select value={isActive} onChange={(e) => { setOffset(0); setIsActive(e.target.value as "" | "true" | "false"); }}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
        <select value={roleId} onChange={(e) => { setOffset(0); setRoleId(e.target.value); }}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as AdminSort)}>
          <option value="created_at_desc">Newest first</option>
          <option value="created_at_asc">Oldest first</option>
          <option value="full_name_asc">Name A-Z</option>
          <option value="full_name_desc">Name Z-A</option>
          <option value="email_asc">Email A-Z</option>
          <option value="email_desc">Email Z-A</option>
        </select>
        {can("administration.admins.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Create admin"}
          </button>
        )}
      </div>

      {showCreate && can("administration.admins.create") && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <input placeholder="Full name" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
          <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="button" disabled={creating || !newEmail || !newFullName || !newPassword} onClick={() => void handleCreate()}>
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
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td>
                  <Link to={`/administration/admins/${admin.id}`}>{admin.fullName}</Link>
                </td>
                <td>{admin.email}</td>
                <td>{admin.roles.map((r) => r.name).join(", ") || "—"}</td>
                <td>{admin.isActive ? "Active" : "Disabled"}</td>
                <td>{new Date(admin.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={admins.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
