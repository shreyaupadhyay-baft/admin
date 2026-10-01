import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { createCampaign, fetchCampaigns, type Campaign, type CampaignStatus, type CampaignType } from "../api/campaigns.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;
const CAMPAIGN_TYPES: CampaignType[] = ["promotional", "referral", "retention", "reengagement", "other"];

export const CampaignsListPage = () => {
  const { can } = useAuth();

  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [campaignType, setCampaignType] = useState<CampaignType | "">("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CampaignType>("promotional");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCampaigns({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        campaignType: campaignType || undefined,
        search: search || undefined,
      });
      setCampaigns(res.campaigns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, [status, campaignType, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createCampaign({ name: newName, campaignType: newType });
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Campaigns</h1>

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
            setStatus(e.target.value as CampaignStatus | "");
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={campaignType}
          onChange={(e) => {
            setOffset(0);
            setCampaignType(e.target.value as CampaignType | "");
          }}
        >
          <option value="">All types</option>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {can("campaigns.create") && (
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "New campaign"}
          </button>
        )}
      </div>

      {showCreate && can("campaigns.create") && (
        <div style={{ marginBottom: "1rem" }}>
          <input placeholder="Campaign name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newType} onChange={(e) => setNewType(e.target.value as CampaignType)}>
            {CAMPAIGN_TYPES.map((t) => (
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
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <Link to={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </td>
                <td>{campaign.campaignType}</td>
                <td>{campaign.status}</td>
                <td>{campaign.startAt ? new Date(campaign.startAt).toLocaleString() : "—"}</td>
                <td>{campaign.endAt ? new Date(campaign.endAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={campaigns.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
