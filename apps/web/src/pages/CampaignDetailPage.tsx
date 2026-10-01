import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  activateCampaign,
  cancelCampaign,
  completeCampaign,
  fetchCampaign,
  scheduleCampaign,
  updateCampaign,
  type Campaign,
} from "../api/campaigns.js";
import { useAuth } from "../context/AuthContext.js";

export const CampaignDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState("");
  const [scheduleStartAt, setScheduleStartAt] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCampaign(id);
      setCampaign(data);
      setDescription(data.description);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load campaign.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing campaign id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>
        {error}
      </p>
    );
  }
  if (!campaign) return null;

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

  return (
    <div>
      <h1>{campaign.name}</h1>

      <section>
        <h2>Campaign Details</h2>
        <p>Type: {campaign.campaignType}</p>
        {can("campaigns.update") && campaign.status === "draft" ? (
          <div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(async () => { await updateCampaign(id, { description }); })}
            >
              Save description
            </button>
          </div>
        ) : (
          <p>Description: {campaign.description}</p>
        )}
      </section>

      <section>
        <h2>Audience</h2>
        <pre>{JSON.stringify(campaign.audienceDefinition, null, 2)}</pre>
      </section>

      <section>
        <h2>Targeting</h2>
        <pre>{JSON.stringify(campaign.targetingDefinition, null, 2)}</pre>
      </section>

      <section>
        <h2>Lifecycle</h2>
        <p>Status: {campaign.status}</p>
        <p>Start: {campaign.startAt ? new Date(campaign.startAt).toLocaleString() : "—"}</p>
        <p>End: {campaign.endAt ? new Date(campaign.endAt).toLocaleString() : "—"}</p>

        {campaign.status === "draft" && can("campaigns.schedule") && (
          <div>
            <input
              type="datetime-local"
              value={scheduleStartAt}
              onChange={(e) => setScheduleStartAt(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !scheduleStartAt}
              onClick={() =>
                void runAction(async () => {
                  await scheduleCampaign(id, new Date(scheduleStartAt).toISOString());
                })
              }
            >
              Schedule
            </button>
          </div>
        )}

        {campaign.status === "scheduled" && can("campaigns.activate") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await activateCampaign(id); })}>
            Activate
          </button>
        )}

        {campaign.status === "active" && can("campaigns.complete") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await completeCampaign(id); })}>
            Mark completed
          </button>
        )}

        {["draft", "scheduled", "active"].includes(campaign.status) && can("campaigns.cancel") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await cancelCampaign(id); })}>
            Cancel campaign
          </button>
        )}
      </section>
    </div>
  );
};
