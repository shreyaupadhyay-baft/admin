import { useState } from "react";
import type { RangePreset, RangeSelection } from "../../api/analytics.js";

const PRESETS: Array<[Exclude<RangePreset, "custom">, string]> = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
];
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

/** Client-side mirror of the API rules (the API remains authoritative). Dates are UTC days. */
export const validateCustomRange = (from: string, to: string, now: Date = new Date()): string | null => {
  if (!from || !to) return "Choose both a start and an end date.";
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return "Enter valid dates.";
  if (f > t) return "The start date must not be after the end date.";
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  if (t > today) return "The end date must not be in the future (UTC).";
  if ((t - f) / DAY_MS + 1 > MAX_DAYS) return `The range must not exceed ${MAX_DAYS} days.`;
  return null;
};

type Props = { value: RangeSelection; onChange: (next: RangeSelection) => void };

export const DateRangeSelector = ({ value, onChange }: Props) => {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [error, setError] = useState<string | null>(null);

  const applyCustom = () => {
    const message = validateCustomRange(from, to);
    setError(message);
    if (!message) onChange({ range: "custom", from, to });
  };

  return (
    <div role="group" aria-label="Date range" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", margin: "0.75rem 0" }}>
      {PRESETS.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value.range === key} onClick={() => onChange({ range: key })} style={{ fontWeight: value.range === key ? 700 : 400 }}>
          {label}
        </button>
      ))}
      <span style={{ marginLeft: "0.5rem" }}>
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>{" "}
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>{" "}
        <button type="button" aria-pressed={value.range === "custom"} onClick={applyCustom}>
          Apply custom range
        </button>
      </span>
      {error && (
        <span role="alert" style={{ color: "crimson" }}>
          {error}
        </span>
      )}
    </div>
  );
};
