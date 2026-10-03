import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client.js";
import { fetchAnalytics, type AnalyticsData, type AnalyticsSectionKey, type RangeSelection } from "../../api/analytics.js";
import { AnalyticsView } from "./AnalyticsView.js";
import { DateRangeSelector } from "./DateRangeSelector.js";

export const analyticsErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "You do not have permission to view this analytics section.";
    if (err.status === 400 && err.code === "VALIDATION_ERROR") return "The selected date range is not valid. Choose a range of up to 366 days that ends today or earlier.";
  }
  return "Analytics could not be loaded.";
};

type Props = {
  section: AnalyticsSectionKey;
  title: string;
  /** UX only — the API enforces the analytics permission independently. */
  canRead: boolean;
  load?: typeof fetchAnalytics;
};

export const AnalyticsSection = ({ section, title, canRead, load = fetchAnalytics }: Props) => {
  const [selection, setSelection] = useState<RangeSelection>({ range: "30d" });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await load(section, selection));
    } catch (err) {
      setError(analyticsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [load, section, selection]);

  useEffect(() => {
    if (canRead) void run();
  }, [canRead, run]);

  if (!canRead) return <p role="alert">You do not have access to this analytics section.</p>;

  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <DateRangeSelector value={selection} onChange={setSelection} />
      {loading && (
        <div aria-busy="true" aria-label="Loading analytics">
          <p>Loading analytics…</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ background: "#f3f4f6", borderRadius: "6px", height: "72px", flex: 1 }} />
            ))}
          </div>
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void run()}>
            Retry
          </button>
        </div>
      )}
      {data && <AnalyticsView data={data} />}
    </section>
  );
};
