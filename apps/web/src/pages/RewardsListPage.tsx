import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { createReward, fetchRewards, type Reward, type RewardStatus, type RewardType } from "../api/rewards.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;
const REWARD_TYPES: RewardType[] = ["cashback", "points", "voucher", "fee_waiver", "bonus"];

export const RewardsListPage = () => {
  const { can } = useAuth();

  const [status, setStatus] = useState<RewardStatus | "">("");
  const [rewardType, setRewardType] = useState<RewardType | "">("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<RewardType>("points");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRewards({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        rewardType: rewardType || undefined,
        search: search || undefined,
      });
      setRewards(res.rewards);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load rewards.");
    } finally {
      setLoading(false);
    }
  }, [status, rewardType, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createReward({ name: newName, rewardType: newType });
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create reward.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Rewards</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="search"
          placeholder="Search name or description"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value as RewardStatus | "");
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={rewardType}
          onChange={(e) => {
            setOffset(0);
            setRewardType(e.target.value as RewardType | "");
          }}
        >
          <option value="">All types</option>
          {REWARD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {can("rewards.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "New reward"}
          </button>
        )}
      </div>

      {showCreate && can("rewards.create") && (
        <div style={{ marginBottom: "1rem" }}>
          <input placeholder="Reward name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newType} onChange={(e) => setNewType(e.target.value as RewardType)}>
            {REWARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" disabled={creating || !newName.trim()} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      )}

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
              <th>Type</th>
              <th>Status</th>
              <th>Valid from</th>
              <th>Valid until</th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((reward) => (
              <tr key={reward.id}>
                <td>
                  <Link to={`/rewards/${reward.id}`}>{reward.name}</Link>
                </td>
                <td>{reward.rewardType}</td>
                <td>{reward.status}</td>
                <td>{reward.validFrom ? new Date(reward.validFrom).toLocaleString() : "—"}</td>
                <td>{reward.validUntil ? new Date(reward.validUntil).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={rewards.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
