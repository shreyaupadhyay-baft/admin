import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { fetchUserOverview, updateUser, updateUserStatus, type UserOverview, type UserStatus } from "../api/users.js";
import { useAuth } from "../context/AuthContext.js";

export const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [statusChoice, setStatusChoice] = useState<UserStatus>("active");
  const [statusReason, setStatusReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUserOverview(id);
      setOverview(data);
      setFullName(data.profile.fullName);
      if (data.status) setStatusChoice(data.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing user id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>
        {error}
      </p>
    );
  }
  if (!overview) return null;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateUser(id, { fullName });
      await load();
      setIsEditingProfile(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeStatus = async () => {
    setSavingStatus(true);
    try {
      await updateUserStatus(id, statusChoice, statusReason || undefined);
      await load();
      setStatusReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const canReadDeviceStatus = can("devices.status.read");

  return (
    <div>
      <h1>{overview.profile.fullName}</h1>

      <section>
        <h2>Profile</h2>
        {isEditingProfile ? (
          <div>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <button type="button" disabled={savingProfile} onClick={() => void handleSaveProfile()}>
              Save
            </button>
            <button type="button" onClick={() => setIsEditingProfile(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <p>Email: {overview.profile.email}</p>
            <p>Phone: {overview.profile.phoneNumber ?? "—"}</p>
            {can("users.update") && (
              <button type="button" onClick={() => setIsEditingProfile(true)}>
                Edit profile
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Status</h2>
        {overview.status ? (
          <div>
            <p>Current status: {overview.status}</p>
            {can("users.status.update") && (
              <div>
                <select value={statusChoice} onChange={(e) => setStatusChoice(e.target.value as UserStatus)}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                </select>
                <input
                  placeholder="Reason (optional)"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
                <button type="button" disabled={savingStatus} onClick={() => void handleChangeStatus()}>
                  Update status
                </button>
              </div>
            )}
          </div>
        ) : (
          <p>You do not have permission to view this user&apos;s status.</p>
        )}
      </section>

      <section>
        <h2>Devices</h2>
        {overview.devices.length === 0 ? (
          <p>No devices on record.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Platform</th>
                {canReadDeviceStatus && <th>Status</th>}
                <th>First seen</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {overview.devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.deviceRef}</td>
                  <td>{device.platform}</td>
                  {canReadDeviceStatus && <td>{device.status}</td>}
                  <td>{new Date(device.firstSeenAt).toLocaleString()}</td>
                  <td>{new Date(device.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
