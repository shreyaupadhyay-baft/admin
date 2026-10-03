import type { AnalyticsData, Breakdown, Metric, MetricScope, Series } from "../../api/analytics.js";

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: "6px", padding: "0.9rem 1rem" };
const SCOPE_LABELS: Record<MetricScope, string> = {
  range: "In selected range",
  as_of_range_end: "As of range end",
  snapshot: "Current snapshot (not range-based)",
};

export const formatMetricValue = (m: Metric): string => {
  if (m.value === null) return "—";
  return m.unit === "percent" ? `${m.value}%` : m.value.toLocaleString();
};

const KpiCard = ({ metric }: { metric: Metric }) => (
  <div style={{ ...box, flex: "1 1 200px" }} data-testid={`metric-${metric.key}`}>
    <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatMetricValue(metric)}</div>
    <div style={{ fontSize: "0.85rem" }} title={metric.definition}>
      {metric.label}
    </div>
    {metric.value === null && <div style={{ fontSize: "0.75rem", color: "#555" }}>Not defined: there are no users in the base population.</div>}
    <div style={{ fontSize: "0.7rem", color: "#555" }}>{SCOPE_LABELS[metric.scope]}</div>
    <div style={{ fontSize: "0.7rem", color: "#555" }}>{metric.definition}</div>
  </div>
);

const UNIT_PERIOD = { day: "day", week: "week (Mon–Sun, UTC)", month: "month (UTC)" } as const;

/** Simple accessible SVG bar chart. Bars (not lines) so sparse data is not visually interpolated. */
export const BarChart = ({ series, range }: { series: Series; range: AnalyticsData["range"] }) => {
  const total = series.points.reduce((a, p) => a + p.value, 0);
  const max = Math.max(1, ...series.points.map((p) => p.value));
  const nonZero = series.points.filter((p) => p.value > 0).length;
  const W = 600;
  const H = 140;
  const bw = W / Math.max(1, series.points.length);
  return (
    <figure style={{ ...box, margin: 0, flex: "1 1 420px" }} aria-label={series.title}>
      <figcaption>
        <strong>{series.title}</strong>
        <div style={{ fontSize: "0.75rem", color: "#555" }}>
          {series.definition} Unit: count per {UNIT_PERIOD[series.granularity]}. {range.from} to {range.to} (UTC).
        </div>
      </figcaption>
      {total === 0 ? (
        <p>No activity in this period.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.title}: ${total} in total across ${series.points.length} periods`} style={{ width: "100%", height: "auto" }}>
            <title>{series.title}</title>
            {series.points.map((p, i) => {
              const h = (p.value / max) * (H - 10);
              return (
                <rect key={p.bucket} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} fill="#2563eb">
                  <title>{`${p.bucket}: ${p.value}`}</title>
                </rect>
              );
            })}
          </svg>
          <div style={{ fontSize: "0.75rem", color: "#555" }}>
            Peak {max} per {series.granularity}. Total {total}.
          </div>
          {nonZero < 3 && <div style={{ fontSize: "0.75rem", color: "#92400e" }}>Few data points — read this trend with caution.</div>}
        </>
      )}
      <details>
        <summary>Data table</summary>
        <table>
          <thead>
            <tr>
              <th>Period start (UTC)</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((p) => (
              <tr key={p.bucket}>
                <td>{p.bucket}</td>
                <td>{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
};

const BreakdownCard = ({ b }: { b: Breakdown }) => {
  const max = Math.max(1, ...b.items.map((i) => i.value ?? 0));
  return (
    <div style={{ ...box, flex: "1 1 280px" }} aria-label={b.title} role="group">
      <strong>{b.title}</strong>
      <div style={{ fontSize: "0.75rem", color: "#555" }}>
        {b.definition} Unit: count. {SCOPE_LABELS[b.scope]}.
      </div>
      {b.items.length === 0 ? (
        <p>No data in this period.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {b.items.map((i) => (
            <li key={i.key} style={{ margin: "0.3rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{i.key}</span>
                <span>{i.suppressed ? `fewer than ${b.suppressionThreshold} (hidden)` : i.value}</span>
              </div>
              {!i.suppressed && <div style={{ background: "#2563eb", height: "6px", width: `${((i.value ?? 0) / max) * 100}%` }} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const AnalyticsView = ({ data }: { data: AnalyticsData }) => (
  <div>
    <p data-testid="range-banner" style={{ color: "#555" }}>
      Showing {data.range.from} to {data.range.to} ({data.range.days} day{data.range.days === 1 ? "" : "s"}, UTC, by {data.range.granularity}). Source: BAFT data only.
    </p>
    {data.availability === "unavailable" && (
      <div role="status" style={{ ...box, background: "#fffbeb" }}>
        <strong>{data.summary ?? "Not available."}</strong>
      </div>
    )}
    {data.metrics.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
        {data.metrics.map((m) => (
          <KpiCard key={m.key} metric={m} />
        ))}
      </div>
    )}
    {data.series.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
        {data.series.map((s) => (
          <BarChart key={s.key} series={s} range={data.range} />
        ))}
      </div>
    )}
    {data.breakdowns.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
        {data.breakdowns.map((b) => (
          <BreakdownCard key={b.key} b={b} />
        ))}
      </div>
    )}
    {data.unavailable.length > 0 && (
      <section aria-label="Unavailable metrics" style={{ ...box, margin: "1rem 0" }}>
        <h3 style={{ marginTop: 0 }}>Unavailable metrics</h3>
        <p style={{ fontSize: "0.8rem", color: "#555" }}>These are not shown as zero because BAFT does not hold the data needed to calculate them.</p>
        <ul>
          {data.unavailable.map((u) => (
            <li key={u.key}>
              <strong>{u.label}</strong> — {u.reason} <em>Needs: {u.requires}</em>
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);
