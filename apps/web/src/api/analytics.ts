import { apiGet } from "./client.js";

export const ANALYTICS_SECTIONS = ["overview", "onboarding", "features", "retention", "usage", "rewards", "financial"] as const;
export type AnalyticsSectionKey = (typeof ANALYTICS_SECTIONS)[number];

export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";
export type RangeSelection = { range: RangePreset; from?: string; to?: string };

export type MetricScope = "range" | "as_of_range_end" | "snapshot";
export type Metric = {
  key: string;
  label: string;
  definition: string;
  unit: "count" | "percent";
  scope: MetricScope;
  /** null = not computable (e.g. zero denominator) — never rendered as 0. */
  value: number | null;
  nullReason?: "zero_denominator";
};
export type Series = {
  key: string;
  title: string;
  definition: string;
  unit: "count";
  granularity: "day" | "week" | "month";
  points: Array<{ bucket: string; value: number }>;
};
export type Breakdown = {
  key: string;
  title: string;
  definition: string;
  unit: "count";
  scope: MetricScope;
  items: Array<{ key: string; value: number | null; suppressed?: true }>;
  suppressionThreshold?: number;
};
export type UnavailableMetric = { key: string; label: string; reason: string; requires: string };

export type AnalyticsData = {
  section: AnalyticsSectionKey;
  range: { preset: RangePreset; from: string; to: string; days: number; granularity: "day" | "week" | "month"; timezone: "UTC" };
  generatedAt: string;
  availability: "available" | "partial" | "unavailable";
  summary?: string;
  metrics: Metric[];
  series: Series[];
  breakdowns: Breakdown[];
  unavailable: UnavailableMetric[];
};

export const fetchAnalytics = async (section: AnalyticsSectionKey, sel: RangeSelection): Promise<AnalyticsData> => {
  const q = new URLSearchParams({ range: sel.range });
  if (sel.range === "custom" && sel.from && sel.to) {
    q.set("from", sel.from);
    q.set("to", sel.to);
  }
  const res = await apiGet<AnalyticsData>(`/api/v1/analytics/${section}?${q.toString()}`);
  return res.data;
};
