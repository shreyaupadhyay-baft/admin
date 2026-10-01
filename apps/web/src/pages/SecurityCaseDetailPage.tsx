import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  addSecurityCaseEvidence,
  addSecurityCaseNote,
  assignSecurityCase,
  closeSecurityCase,
  fetchSecurityCase,
  resolveSecurityCase,
  updateSecurityCase,
  updateSecurityCaseSeverity,
  updateSecurityCaseStatus,
  type SecurityCase,
  type SecurityCaseEvent,
  type SecurityCaseEvidence,
  type SecurityEvidenceType,
  type SecuritySeverity,
} from "../api/security.js";
import { useAuth } from "../context/AuthContext.js";

const NON_TERMINAL_STATUSES = ["open", "triaged", "investigating"] as const;
const SEVERITIES: SecuritySeverity[] = ["low", "medium", "high", "critical"];
const EVIDENCE_TYPES: SecurityEvidenceType[] = [
  "security_event",
  "device_signal",
  "authentication_event",
  "configuration_event",
  "system_signal",
  "provider_signal",
  "manual_note",
  "external_reference",
];

export const SecurityCaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [securityCase, setSecurityCase] = useState<SecurityCase | null>(null);
  const [events, setEvents] = useState<SecurityCaseEvent[]>([]);
  const [evidence, setEvidence] = useState<SecurityCaseEvidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState("");
  const [statusChoice, setStatusChoice] = useState<(typeof NON_TERMINAL_STATUSES)[number]>("open");
  const [severityChoice, setSeverityChoice] = useState<SecuritySeverity>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [evidenceType, setEvidenceType] = useState<SecurityEvidenceType>("manual_note");
  const [evidenceSource, setEvidenceSource] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSecurityCase(id);
      setSecurityCase(data.case);
      setEvents(data.events);
      setEvidence(data.evidence);
      setSummary(data.case.summary);
      if ((NON_TERMINAL_STATUSES as readonly string[]).includes(data.case.status)) {
        setStatusChoice(data.case.status as (typeof NON_TERMINAL_STATUSES)[number]);
      }
      setSeverityChoice(data.case.severity);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load security case.");
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
      <p role="alert" style={{ color: "crimson" }}>{error}</p>
    );
  }
  if (!securityCase) return null;

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

  const isTerminal = securityCase.status === "resolved" || securityCase.status === "closed";

  return (
    <div>
      <h1>
        {securityCase.caseNumber} — {securityCase.title}
      </h1>

      <section>
        <h2>Case Details</h2>
        <p>Category: {securityCase.category}</p>
      </section>

      <section>
        <h2>Summary</h2>
        {can("security_cases.update") ? (
          <div>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateSecurityCase(id, { summary }); })}>
              Save summary
            </button>
          </div>
        ) : (
          <p>{securityCase.summary}</p>
        )}
      </section>

      <section>
        <h2>Status</h2>
        <p>Current status: {securityCase.status}</p>
        {!isTerminal && can("security_cases.status.update") && (
          <div>
            <select value={statusChoice} onChange={(e) => setStatusChoice(e.target.value as (typeof NON_TERMINAL_STATUSES)[number])}>
              {NON_TERMINAL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateSecurityCaseStatus(id, statusChoice); })}>
              Change status
            </button>
          </div>
        )}
        {!isTerminal && can("security_cases.resolve") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await resolveSecurityCase(id); })}>
            Resolve
          </button>
        )}
        {!isTerminal && can("security_cases.close") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await closeSecurityCase(id); })}>
            Close
          </button>
        )}
      </section>

      <section>
        <h2>Severity</h2>
        <p>Current severity: {securityCase.severity} (impact — independent of investigation status)</p>
        {can("security_cases.severity.update") && (
          <div>
            <select value={severityChoice} onChange={(e) => setSeverityChoice(e.target.value as SecuritySeverity)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateSecurityCaseSeverity(id, severityChoice); })}>
              Change severity
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Assignment</h2>
        <p>Assigned admin: {securityCase.assignedAdminId ?? "Unassigned"}</p>
        {can("security_cases.assign") && (
          <div>
            <input placeholder="Admin id" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
            <button
              type="button"
              disabled={busy || !assigneeId}
              onClick={() => void runAction(async () => { await assignSecurityCase(id, assigneeId); setAssigneeId(""); })}
            >
              Assign
            </button>
            {securityCase.assignedAdminId && (
              <button type="button" disabled={busy} onClick={() => void runAction(async () => { await assignSecurityCase(id, null); })}>
                Unassign
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Evidence</h2>
        <p>References only — never a copy of a provider transaction, KYC, or card record.</p>
        <ul>
          {evidence.map((e) => (
            <li key={e.id}>
              <strong>{e.evidenceType}</strong> ({e.source}
              {e.externalReference ? `, ref: ${e.externalReference}` : ""}) — {e.description}
            </li>
          ))}
        </ul>
        {can("security_cases.add_evidence") && (
          <div>
            <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as SecurityEvidenceType)}>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input placeholder="Source" value={evidenceSource} onChange={(e) => setEvidenceSource(e.target.value)} />
            <input placeholder="Description" value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} />
            <button
              type="button"
              disabled={busy || !evidenceSource || !evidenceDescription}
              onClick={() =>
                void runAction(async () => {
                  await addSecurityCaseEvidence(id, { evidenceType, source: evidenceSource, description: evidenceDescription });
                  setEvidenceSource("");
                  setEvidenceDescription("");
                })
              }
            >
              Add evidence
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Investigation Timeline</h2>
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType}</strong> — {new Date(event.createdAt).toLocaleString()}
              {event.note && <div>{event.note}</div>}
            </li>
          ))}
        </ul>
        {can("security_cases.add_note") && (
          <div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an investigation note…" />
            <button
              type="button"
              disabled={busy || !noteText.trim()}
              onClick={() =>
                void runAction(async () => {
                  await addSecurityCaseNote(id, noteText.trim());
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
