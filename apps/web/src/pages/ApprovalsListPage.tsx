import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { createApproval, fetchApprovals, type Approval, type ApprovalStatus } from "../api/approvals.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;
const STATUSES: ApprovalStatus[] = ["requested", "approved", "rejected", "cancelled", "expired"];

export const ApprovalsListPage = () => {
  const { can } = useAuth();

  const [status, setStatus] = useState<ApprovalStatus | "">("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [actionType, setActionType] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApprovals({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        search: search || undefined,
      });
      setApprovals(res.approvals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load approvals.");
    } finally {
      setLoading(false);
    }
  }, [status, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!actionType.trim() || !resourceType.trim() || !resourceId.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createApproval({
        actionType: actionType.trim(),
        resourceType: resourceType.trim(),
        resourceId: resourceId.trim(),
        reason: reason.trim(),
      });
      setActionType("");
      setResourceType("");
      setResourceId("");
      setReason("");
      setOffset(0);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create approval request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Approvals</h1>

      {can("approvals.create") && (
        <section style={{ marginBottom: "1rem" }}>
          <h2>Request an approval</h2>
          <p style={{ fontSize: "0.85rem", color: "#555" }}>
            actionType must be a server-registered action (e.g. security.block_user, security.unblock_user,
            administration.role_permission_change). Unregistered action types are rejected by the backend.
          </p>
          <input placeholder="Action type" value={actionType} onChange={(e) => setActionType(e.target.value)} />
          <input placeholder="Resource type" value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
          <input placeholder="Resource id" value={resourceId} onChange={(e) => setResourceId(e.target.value)} />
          <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            type="button"
            disabled={submitting || !actionType.trim() || !resourceType.trim() || !resourceId.trim() || !reason.trim()}
            onClick={() => void handleCreate()}
          >
            Submit request
          </button>
        </section>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as ApprovalStatus | ""); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          placeholder="Search (approval #, reason, resource id)"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
        />
      </div>

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Approval #</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Status</th>
              <th>Execution</th>
              <th>Requested By</th>
              <th>Requested At</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.id}>
                <td><Link to={`/approvals/${approval.id}`}>{approval.approvalNumber}</Link></td>
                <td>{approval.actionType}</td>
                <td>{approval.resourceType}:{approval.resourceId}</td>
                <td>{approval.status}</td>
                <td>{approval.executionStatus ?? "—"}</td>
                <td>{approval.requestedBy}</td>
                <td>{new Date(approval.requestedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={approvals.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
