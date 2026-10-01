import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  activateReward,
  cancelReward,
  checkRewardEntitlement,
  expireReward,
  fetchReward,
  pauseReward,
  resumeReward,
  type EntitlementResult,
  type Reward,
} from "../api/rewards.js";
import { useAuth } from "../context/AuthContext.js";

export const RewardDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [entitlementUserId, setEntitlementUserId] = useState("");
  const [entitlementResult, setEntitlementResult] = useState<EntitlementResult | null>(null);
  const [checkingEntitlement, setCheckingEntitlement] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setReward(await fetchReward(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reward.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing reward id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>
        {error}
      </p>
    );
  }
  if (!reward) return null;

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

  const handleCheckEntitlement = async () => {
    setCheckingEntitlement(true);
    setError(null);
    setEntitlementResult(null);
    try {
      setEntitlementResult(await checkRewardEntitlement(id, entitlementUserId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to check entitlement.");
    } finally {
      setCheckingEntitlement(false);
    }
  };

  return (
    <div>
      <h1>{reward.name}</h1>

      <section>
        <h2>Reward Details</h2>
        <p>Type: {reward.rewardType}</p>
        <p>Description: {reward.description}</p>
        <p>Valid from: {reward.validFrom ? new Date(reward.validFrom).toLocaleString() : "—"}</p>
        <p>Valid until: {reward.validUntil ? new Date(reward.validUntil).toLocaleString() : "—"}</p>
        <h3>Rule definition</h3>
        <pre>{JSON.stringify(reward.ruleDefinition, null, 2)}</pre>
      </section>

      <section>
        <h2>Lifecycle</h2>
        <p>Status: {reward.status}</p>

        {reward.status === "draft" && can("rewards.activate") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await activateReward(id); })}>
            Activate
          </button>
        )}
        {reward.status === "active" && can("rewards.pause") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await pauseReward(id); })}>
            Pause
          </button>
        )}
        {reward.status === "paused" && can("rewards.resume") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await resumeReward(id); })}>
            Resume
          </button>
        )}
        {["active", "paused"].includes(reward.status) && can("rewards.expire") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await expireReward(id); })}>
            Expire
          </button>
        )}
        {["draft", "active", "paused"].includes(reward.status) && can("rewards.cancel") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await cancelReward(id); })}>
            Cancel
          </button>
        )}
      </section>

      <section>
        <h2>User Entitlement</h2>
        <p>Check whether a specific user currently qualifies for this reward, based on its rule definition.</p>
        <input placeholder="User id" value={entitlementUserId} onChange={(e) => setEntitlementUserId(e.target.value)} />
        <button type="button" disabled={checkingEntitlement || !entitlementUserId} onClick={() => void handleCheckEntitlement()}>
          Check entitlement
        </button>

        {entitlementResult && (
          <div>
            <p>
              Eligible by rule: {entitlementResult.eligible ? "Yes" : "No"} — Entitled now:{" "}
              {entitlementResult.entitled ? "Yes" : "No"} (reward status: {entitlementResult.rewardStatus})
            </p>
            <ul>
              {entitlementResult.evaluatedConditions.map((c, idx) => (
                <li key={idx}>
                  {c.field} {c.operator} {JSON.stringify(c.value)} — actual: {JSON.stringify(c.actual)} —{" "}
                  {c.passed ? "passed" : "failed"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};
