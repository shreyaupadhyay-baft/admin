import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  addSupportCaseNote,
  assignSupportCase,
  closeSupportCase,
  fetchSupportCase,
  resolveSupportCase,
  updateSupportCase,
  type SupportCase,
  type SupportCaseEvent,
} from "../api/support.js";
import { useAuth } from "../context/AuthContext.js";

export const SupportCaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [events, setEvents] = useState<SupportCaseEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [priority, setPriority] = useState<SupportCase["priority"]>("medium");
  const [nonTerminalStatus, setNonTerminalStatus] = useState<"open" | "in_progress">("open");
  const [assigneeId, setAssigneeId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupportCase(id);
      setSupportCase(data.case);
      setEvents(data.events);
      setPriority(data.case.priority);
      if (data.case.status === "open" || data.case.status === "in_progress") {
        setNonTerminalStatus(data.case.status);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load support case.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return <p>Missing case id.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert" style={{ color: "crimson" }}>
        {error}
      </p>
    );
  }
  if (!supportCase) return null;

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

  const isTerminal = supportCase.status === "resolved" || supportCase.status === "closed";

  return (
    <div>
      <h1>{supportCase.subject}</h1>

      <section>
        <h2>Case Details</h2>
        <p>Description: {supportCase.description}</p>
        <p>Category: {supportCase.category}</p>
        <p>
          Priority: {supportCase.priority}
          {can("support_cases.update") && !isTerminal && (
            <>
              {" "}
              <select value={priority} onChange={(e) => setPriority(e.target.value as SupportCase["priority"])}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction(async () => { await updateSupportCase(id, { priority }); })}
              >
                Save priority
              </button>
            </>
          )}
        </p>
      </section>

      <section>
        <h2>Status</h2>
        <p>Current status: {supportCase.status}</p>
        {can("support_cases.update") && !isTerminal && (
          <div>
            <select
              value={nonTerminalStatus}
              onChange={(e) => setNonTerminalStatus(e.target.value as "open" | "in_progress")}
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(async () => { await updateSupportCase(id, { status: nonTerminalStatus }); })}
            >
              Update status
            </button>
          </div>
        )}
        {!isTerminal && can("support_cases.resolve") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await resolveSupportCase(id); })}>
            Resolve
          </button>
        )}
        {!isTerminal && can("support_cases.close") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await closeSupportCase(id); })}>
            Close
          </button>
        )}
      </section>

      <section>
        <h2>Assignments</h2>
        <p>Assigned admin: {supportCase.assignedAdminId ?? "Unassigned"}</p>
        {can("support_cases.assign") && (
          <div>
            <input
              placeholder="Admin id"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !assigneeId}
              onClick={() => void runAction(async () => { await assignSupportCase(id, assigneeId); setAssigneeId(""); })}
            >
              Assign
            </button>
            {supportCase.assignedAdminId && (
              <button type="button" disabled={busy} onClick={() => void runAction(async () => { await assignSupportCase(id, null); })}>
                Unassign
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Notes &amp; Activity</h2>
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType}</strong> — {new Date(event.createdAt).toLocaleString()}
              {event.note && <div>{event.note}</div>}
            </li>
          ))}
        </ul>
        {can("support_cases.add_note") && (
          <div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" />
            <button
              type="button"
              disabled={busy || !noteText.trim()}
              onClick={() =>
                void runAction(async () => {
                  await addSupportCaseNote(id, noteText.trim());
                  setNoteText("");
                })
              }
            >
              Add note
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
