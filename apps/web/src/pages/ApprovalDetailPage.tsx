import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  approveApproval,
  cancelApproval,
  fetchApproval,
  fetchApprovalEvents,
  rejectApproval,
  type Approval,
  type ApprovalEvent,
} from "../api/approvals.js";
import { useAuth } from "../context/AuthContext.js";

const TERMINAL_STATUSES = ["approved", "rejected", "cancelled", "expired"];

export const ApprovalDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can, state } = useAuth();
  const currentAdminId = state.status === "authenticated" ? state.admin.id : null;

  const [approval, setApproval] = useState<Approval | null>(null);
  const [events, setEvents] = useState<ApprovalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [approvalData, eventsData] = await Promise.all([fetchApproval(id), fetchApprovalEvents(id)]);
      setApproval(approvalData);
      setEvents(eventsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load approval.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing approval id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return <p role="alert" style={{ color: "crimson" }}>{error}</p>;
  }
  if (!approval) return null;

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

  const isTerminal = TERMINAL_STATUSES.includes(approval.status);
  const isOwnRequest = approval.requestedBy === currentAdminId;

  // UI-only convenience: the backend independently re-checks self-approval,
  // the action's own required permission, and per-action approver
  // eligibility (holding approvals.approve is never sufficient by itself).
  // A control shown here can still be legitimately rejected by the server.
  const showApprove = !isTerminal && !isOwnRequest && can("approvals.approve");
  const showReject = !isTerminal && !isOwnRequest && can("approvals.reject");
  const showCancel = !isTerminal && (isOwnRequest || can("approvals.cancel"));

  return (
    <div>
      <h1>{approval.approvalNumber}</h1>

      <section>
        <h2>Request</h2>
        <p>Action type: {approval.actionType}</p>
        <p>Resource: {approval.resourceType}:{approval.resourceId}</p>
        <p>Reason: {approval.reason}</p>
        <p>Requested by: {approval.requestedBy}</p>
        <p>Requested at: {new Date(approval.requestedAt).toLocaleString()}</p>
      </section>

      <section>
        <h2>Status</h2>
        <p>Status: {approval.status}</p>
        {approval.approverAdminId && <p>Decided by: {approval.approverAdminId}</p>}
        {approval.rejectionReason && <p>Rejection reason: {approval.rejectionReason}</p>}
        <p>Execution: {approval.executionStatus ?? "not applicable"}</p>
        {approval.executionResult && (
          <pre style={{ background: "#f5f5f5", padding: "0.5rem" }}>{JSON.stringify(approval.executionResult, null, 2)}</pre>
        )}
      </section>

      {(showApprove || showReject || showCancel) && (
        <section>
          <h2>Decision</h2>
          {isOwnRequest && !isTerminal && (
            <p style={{ fontSize: "0.85rem", color: "#555" }}>
              You requested this approval — you cannot approve or reject your own request.
            </p>
          )}
          {showApprove && (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await approveApproval(id); })}>
              Approve
            </button>
          )}
          {showReject && (
            <div>
              <input
                placeholder="Rejection reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !rejectReason.trim()}
                onClick={() =>
                  void runAction(async () => {
                    await rejectApproval(id, rejectReason.trim());
                    setRejectReason("");
                  })
                }
              >
                Reject
              </button>
            </div>
          )}
          {showCancel && (
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await cancelApproval(id); })}>
              Cancel
            </button>
          )}
        </section>
      )}

      <section>
        <h2>Timeline</h2>
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType}</strong> — {new Date(event.createdAt).toLocaleString()}
              {event.note && <div>{event.note}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
