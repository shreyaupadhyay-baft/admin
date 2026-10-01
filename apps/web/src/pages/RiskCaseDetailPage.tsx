import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  addRiskCaseDecision,
  addRiskCaseEvidence,
  addRiskCaseNote,
  assignRiskCase,
  closeRiskCase,
  fetchRiskCase,
  resolveRiskCase,
  updateRiskCase,
  updateRiskCaseSeverity,
  updateRiskCaseStatus,
  type RiskCase,
  type RiskCaseDecision,
  type RiskCaseDecisionRecord,
  type RiskCaseEvent,
  type RiskCaseEvidence,
  type RiskEvidenceType,
  type RiskSeverity,
} from "../api/risk.js";
import { useAuth } from "../context/AuthContext.js";

const NON_TERMINAL_STATUSES = ["open", "triaged", "investigating"] as const;
const SEVERITIES: RiskSeverity[] = ["low", "medium", "high", "critical"];
const EVIDENCE_TYPES: RiskEvidenceType[] = [
  "risk_signal",
  "provider_signal",
  "device_signal",
  "system_signal",
  "security_event",
  "behavioral_signal",
  "manual_note",
  "external_reference",
];
const DECISIONS: RiskCaseDecision[] = ["no_action", "monitor", "restrict_account", "escalate", "close_case"];

export const RiskCaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [riskCase, setRiskCase] = useState<RiskCase | null>(null);
  const [events, setEvents] = useState<RiskCaseEvent[]>([]);
  const [evidence, setEvidence] = useState<RiskCaseEvidence[]>([]);
  const [decisions, setDecisions] = useState<RiskCaseDecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState("");
  const [statusChoice, setStatusChoice] = useState<(typeof NON_TERMINAL_STATUSES)[number]>("open");
  const [severityChoice, setSeverityChoice] = useState<RiskSeverity>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [evidenceType, setEvidenceType] = useState<RiskEvidenceType>("manual_note");
  const [evidenceSource, setEvidenceSource] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [decisionChoice, setDecisionChoice] = useState<RiskCaseDecision>("monitor");
  const [decisionReason, setDecisionReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRiskCase(id);
      setRiskCase(data.case);
      setEvents(data.events);
      setEvidence(data.evidence);
      setDecisions(data.decisions);
      setSummary(data.case.summary);
      if ((NON_TERMINAL_STATUSES as readonly string[]).includes(data.case.status)) {
        setStatusChoice(data.case.status as (typeof NON_TERMINAL_STATUSES)[number]);
      }
      setSeverityChoice(data.case.severity);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load risk case.");
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
  if (!riskCase) return null;

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

  const isTerminal = riskCase.status === "resolved" || riskCase.status === "closed";

  return (
    <div>
      <h1>
        {riskCase.caseNumber} — {riskCase.title}
      </h1>

      <section>
        <h2>Case Details</h2>
        <p>Category: {riskCase.category}</p>
        {can("risk_cases.update") ? (
          <div>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void runAction(async () => { await updateRiskCase(id, { summary }); })}>
              Save summary
            </button>
          </div>
        ) : (
          <p>Summary: {riskCase.summary}</p>
        )}
      </section>

      <section>
        <h2>Status</h2>
        <p>Current status: {riskCase.status}</p>
        {!isTerminal && can("risk_cases.status.update") && (
          <div>
            <select value={statusChoice} onChange={(e) => setStatusChoice(e.target.value as (typeof NON_TERMINAL_STATUSES)[number])}>
              {NON_TERMINAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(async () => { await updateRiskCaseStatus(id, statusChoice); })}
            >
              Update status
            </button>
          </div>
        )}
        {!isTerminal && can("risk_cases.resolve") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await resolveRiskCase(id); })}>
            Resolve
          </button>
        )}
        {!isTerminal && can("risk_cases.close") && (
          <button type="button" disabled={busy} onClick={() => void runAction(async () => { await closeRiskCase(id); })}>
            Close
          </button>
        )}
      </section>

      <section>
        <h2>Severity</h2>
        <p>Current severity: {riskCase.severity} (impact if confirmed — independent of investigation status)</p>
        {can("risk_cases.severity.update") && (
          <div>
            <select value={severityChoice} onChange={(e) => setSeverityChoice(e.target.value as RiskSeverity)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(async () => { await updateRiskCaseSeverity(id, severityChoice); })}
            >
              Update severity
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Case Assignment</h2>
        <p>Assigned admin: {riskCase.assignedAdminId ?? "Unassigned"}</p>
        {can("risk_cases.assign") && (
          <div>
            <input placeholder="Admin id" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
            <button
              type="button"
              disabled={busy || !assigneeId}
              onClick={() => void runAction(async () => { await assignRiskCase(id, assigneeId); setAssigneeId(""); })}
            >
              Assign
            </button>
            {riskCase.assignedAdminId && (
              <button type="button" disabled={busy} onClick={() => void runAction(async () => { await assignRiskCase(id, null); })}>
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
        {can("risk_cases.add_evidence") && (
          <div>
            <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as RiskEvidenceType)}>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input placeholder="Source" value={evidenceSource} onChange={(e) => setEvidenceSource(e.target.value)} />
            <input
              placeholder="Description"
              value={evidenceDescription}
              onChange={(e) => setEvidenceDescription(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !evidenceSource || !evidenceDescription}
              onClick={() =>
                void runAction(async () => {
                  await addRiskCaseEvidence(id, { evidenceType, source: evidenceSource, description: evidenceDescription });
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
        <h2>Decisions / Actions</h2>
        <p>BAFT's administrative decision only — does not itself trigger an external provider action.</p>
        <ul>
          {decisions.map((d) => (
            <li key={d.id}>
              <strong>{d.decision}</strong> — {d.reason} ({new Date(d.createdAt).toLocaleString()})
            </li>
          ))}
        </ul>
        {can("risk_cases.decide") && (
          <div>
            <select value={decisionChoice} onChange={(e) => setDecisionChoice(e.target.value as RiskCaseDecision)}>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input placeholder="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
            <button
              type="button"
              disabled={busy || !decisionReason.trim()}
              onClick={() =>
                void runAction(async () => {
                  await addRiskCaseDecision(id, decisionChoice, decisionReason.trim());
                  setDecisionReason("");
                })
              }
            >
              Record decision
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Investigation Notes &amp; Activity</h2>
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType}</strong> — {new Date(event.createdAt).toLocaleString()}
              {event.note && <div>{event.note}</div>}
            </li>
          ))}
        </ul>
        {can("risk_cases.add_note") && (
          <div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an investigation note…" />
            <button
              type="button"
              disabled={busy || !noteText.trim()}
              onClick={() =>
                void runAction(async () => {
                  await addRiskCaseNote(id, noteText.trim());
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
