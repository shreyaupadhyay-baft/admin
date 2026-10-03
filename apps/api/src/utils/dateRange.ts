import { z } from "zod";

/**
 * Analytics date-range contract.
 *
 * - The application has no timezone convention, so ALL analytics calendar math is UTC.
 * - `from` / `to` are inclusive UTC calendar days (YYYY-MM-DD).
 * - Internally a range is the half-open interval [start, endExclusive):
 *   start = from 00:00:00.000Z, endExclusive = (to + 1 day) 00:00:00.000Z.
 *   A timestamp exactly at endExclusive belongs to the NEXT day.
 * - Presets are anchored on the current UTC day (inclusive of today):
 *   today = [today, today]; 7d = [today-6, today]; 30d = [today-29, today]; 90d = [today-89, today].
 * - Custom ranges: from <= to, to <= today (UTC), at most MAX_RANGE_DAYS days.
 */
export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const MAX_RANGE_DAYS = 366;
export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export interface ResolvedRange {
  preset: RangePreset;
  /** Inclusive first UTC day, YYYY-MM-DD. */
  from: string;
  /** Inclusive last UTC day, YYYY-MM-DD. */
  to: string;
  start: Date;
  endExclusive: Date;
  days: number;
  granularity: Granularity;
  timezone: "UTC";
}

export class RangeError_ extends Error {}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (value: string): number => {
  if (!DAY_RE.test(value)) throw new RangeError_(`"${value}" is not a YYYY-MM-DD date`);
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  // Round-trip rejects impossible dates such as 2026-02-31 (Date.parse would roll them over).
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new RangeError_(`"${value}" is not a valid calendar date`);
  }
  return ms;
};
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const startOfUtcDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

export const granularityFor = (days: number): Granularity => (days <= 31 ? "day" : days <= 180 ? "week" : "month");

export const rangeQuerySchema = z
  .strictObject({
    range: z.enum(RANGE_PRESETS).default("30d"),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.range === "custom") {
      if (!q.from || !q.to) ctx.addIssue({ code: "custom", message: "custom range requires both from and to (YYYY-MM-DD)" });
    } else if (q.from !== undefined || q.to !== undefined) {
      ctx.addIssue({ code: "custom", message: "from/to are only allowed with range=custom" });
    }
  });
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

/** Throws RangeError_ with a safe, user-presentable message on invalid input. */
export const resolveRange = (query: RangeQuery, now: Date = new Date()): ResolvedRange => {
  const today = startOfUtcDay(now.getTime());
  let fromMs: number;
  let toMs: number;
  if (query.range === "custom") {
    fromMs = parseDay(query.from!);
    toMs = parseDay(query.to!);
    if (fromMs > toMs) throw new RangeError_("from must not be after to");
    if (toMs > today) throw new RangeError_("to must not be in the future");
    if ((toMs - fromMs) / DAY_MS + 1 > MAX_RANGE_DAYS) throw new RangeError_(`range must not exceed ${MAX_RANGE_DAYS} days`);
  } else {
    toMs = today;
    fromMs = today - (PRESET_DAYS[query.range] - 1) * DAY_MS;
  }
  const days = (toMs - fromMs) / DAY_MS + 1;
  return {
    preset: query.range,
    from: fmt(fromMs),
    to: fmt(toMs),
    start: new Date(fromMs),
    endExclusive: new Date(toMs + DAY_MS),
    days,
    granularity: granularityFor(days),
    timezone: "UTC",
  };
};
