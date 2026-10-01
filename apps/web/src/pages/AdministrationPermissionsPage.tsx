import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { fetchAdministrationPermissions, type PermissionRecord } from "../api/administration.js";

export const AdministrationPermissionsPage = () => {
  const [search, setSearch] = useState("");
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, PermissionRecord[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdministrationPermissions({ search: search || undefined });
      setGroupedPermissions(res.groupedByResource);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load permissions.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>Permissions</h1>
      <p>Read-only catalogue. Permissions are centrally defined — Administration cannot invent new ones.</p>

      <input
        type="search"
        placeholder="Search key, resource, action, or description"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "1rem" }}
      />

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        Object.entries(groupedPermissions).map(([resource, permissions]) => (
          <div key={resource}>
            <h2>{resource}</h2>
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.key}</td>
                    <td>{p.action}</td>
                    <td>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};
