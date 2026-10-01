import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import {
  approveSecurityAction,
  fetchSecurityActions,
  forceLogout,
  rejectSecurityAction,
  requestBlock,
  requestUnblock,
  revokeSessions,
  type SecurityAction,
  type SecurityActionStatus,
  type SecurityActionType,
} from "../api/security.js";
import { useAuth } from "../context/AuthContext.js";

const PAGE_SIZE = 20;

export const SecurityActionsListPage = () => {
  const { can, state } = useAuth();
  const currentAdminId = state.status === "authenticated" ? state.admin.id : null;

  const [status, setStatus] = useState<SecurityActionStatus | "">("");
  const [actionType, setActionType] = useState<SecurityActionType | "">("");
  const [offset, setOffset] = useState(0);
  const [actions, setActions] = useState<SecurityAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSecurityActions({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        actionType: actionType || undefined,
      });
      setActions(res.actions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load security actions.");
    } finally {
      setLoading(false);
    }
  }, [status, actionType, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRequest = async (kind: "block" | "unblock" | "force-logout" | "revoke-sessions") => {
    if (!targetUserId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "block") await requestBlock(targetUserId, reason.trim());
      else if (kind === "unblock") await requestUnblock(targetUserId, reason.trim());
      else if (kind === "force-logout") await forceLogout(targetUserId, reason.trim());
      else await revokeSessions(targetUserId, reason.trim());
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await approveSecurityAction(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await rejectSecurityAction(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rejection failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1>Security Actions</h1>

      {(can("security_actions.request") || can("security_actions.force_logout") || can("security_actions.revoke_sessions")) && (
        <section style={{ marginBottom: "1rem" }}>
          <h2>Request an action</h2>
          <input placeholder="Target user id" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />
          <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          {can("security_actions.request") && (
            <>
              <button type="button" disabled={submitting || !targetUserId || !reason.trim()} onClick={() => void handleRequest("block")}>
                Request block
              </button>
              <button type="button" disabled={submitting || !targetUserId || !reason.trim()} onClick={() => void handleRequest("unblock")}>
                Request unblock
              </button>
            </>
          )}
          {can("security_actions.force_logout") && (
            <button type="button" disabled={submitting || !targetUserId || !reason.trim()} onClick={() => void handleRequest("force-logout")}>
              Force logout
            </button>
          )}
          {can("security_actions.revoke_sessions") && (
            <button type="button" disabled={submitting || !targetUserId || !reason.trim()} onClick={() => void handleRequest("revoke-sessions")}>
              Revoke sessions
            </button>
          )}
        </section>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as SecurityActionStatus | ""); }}>
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="executed">Executed</option>
        </select>
        <select value={actionType} onChange={(e) => { setOffset(0); setActionType(e.target.value as SecurityActionType | ""); }}>
          <option value="">All types</option>
          <option value="block_user">Block user</option>
          <option value="unblock_user">Unblock user</option>
          <option value="force_logout">Force logout</option>
          <option value="revoke_sessions">Revoke sessions</option>
        </select>
      </div>

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>User</th>
              <th>Type</th>
              <th>Status</th>
              <th>Requested By</th>
              <th>Approved By</th>
              <th>Requested At</th>
              <th>Executed At</th>
              {can("security_actions.approve") || can("security_actions.reject") ? <th>Decision</th> : null}
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              // Backend independently rejects self-approval regardless — this
              // only controls whether the control is shown at all.
              const isOwnRequest = action.requestedBy === currentAdminId;
              const showDecisionControls =
                action.status === "requested" &&
                !isOwnRequest &&
                (action.actionType === "block_user" || action.actionType === "unblock_user");

              return (
                <tr key={action.id}>
                  <td>{action.id.slice(0, 8)}</td>
                  <td>{action.userId}</td>
                  <td>{action.actionType}</td>
                  <td>{action.status}</td>
                  <td>{action.requestedBy}</td>
                  <td>{action.approvedBy ?? "—"}</td>
                  <td>{new Date(action.requestedAt).toLocaleString()}</td>
                  <td>{action.executedAt ? new Date(action.executedAt).toLocaleString() : "—"}</td>
                  {can("security_actions.approve") || can("security_actions.reject") ? (
                    <td>
                      {showDecisionControls && can("security_actions.approve") && (
                        <button type="button" disabled={busyId === action.id} onClick={() => void handleApprove(action.id)}>
                          Approve
                        </button>
                      )}
                      {showDecisionControls && can("security_actions.reject") && (
                        <button type="button" disabled={busyId === action.id} onClick={() => void handleReject(action.id)}>
                          Reject
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <button type="button" disabled={actions.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
};
