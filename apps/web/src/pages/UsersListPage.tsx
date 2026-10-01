import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { fetchUsers, type AdminUser, type UserStatus } from "../api/users.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;

export const UsersListPage = () => {
  const { can } = useAuth();
  const canSeeStatus = can("users.status.read");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUsers({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        status: canSeeStatus && status ? status : undefined,
      });
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [search, status, offset, canSeeStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>Users</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="search"
          placeholder="Search name, email, or phone"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
        />
        {canSeeStatus && (
          <select
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value as UserStatus | "");
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        )}
      </div>

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
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              {canSeeStatus && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link to={`/users/${user.id}`}>{user.fullName}</Link>
                </td>
                <td>{user.email}</td>
                <td>{user.phoneNumber ?? "—"}</td>
                {canSeeStatus && <td>{user.status}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={users.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
