import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client.js";
import type { AnalyticsData } from "../../api/analytics.js";
import { AnalyticsSection } from "./AnalyticsSection.js";
import { validateCustomRange } from "./DateRangeSelector.js";

afterEach(cleanup);

// TEST FIXTURES ONLY — not BAFT data.
const base: AnalyticsData = {
  section: "overview",
  range: { preset: "30d", from: "2026-05-17", to: "2026-06-15", days: 30, granularity: "day", timezone: "UTC" },
  generatedAt: "2026-06-15T12:00:00.000Z",
  availability: "partial",
  metrics: [
    { key: "users_new", label: "New users", definition: "Users created in range.", unit: "count", scope: "range", value: 1234 },
    { key: "device_adoption", label: "Device adoption", definition: "Adoption.", unit: "percent", scope: "as_of_range_end", value: 66.7 },
    { key: "rate_undefined", label: "Undefined rate", definition: "No base.", unit: "percent", scope: "range", value: null, nullReason: "zero_denominator" },
    { key: "support_open", label: "Open support cases", definition: "Currently open.", unit: "count", scope: "snapshot", value: 0 },
  ],
  series: [
    {
      key: "users_new",
      title: "New users",
      definition: "Users created per period.",
      unit: "count",
      granularity: "day",
      points: [
        { bucket: "2026-06-13", value: 0 },
        { bucket: "2026-06-14", value: 4 },
        { bucket: "2026-06-15", value: 2 },
      ],
    },
  ],
  breakdowns: [
    {
      key: "by_status",
      title: "Users by status",
      definition: "Grouped by status.",
      unit: "count",
      scope: "range",
      suppressionThreshold: 5,
      items: [
        { key: "active", value: 9 },
        { key: "suspended", value: null, suppressed: true },
      ],
    },
  ],
  unavailable: [{ key: "users_active", label: "Active users", reason: "No customer activity source.", requires: "An activity stream." }],
};

describe("AnalyticsSection", () => {
  it("does not request data without permission and shows an access message", () => {
    const load = vi.fn();
    render(<AnalyticsSection section="overview" title="Overview" canRead={false} load={load} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not have access/);
  });

  it("shows a loading skeleton, then KPIs with values, scope labels and definitions", async () => {
    const load = vi.fn().mockResolvedValue(base);
    render(<AnalyticsSection section="overview" title="Overview" canRead load={load} />);
    expect(screen.getByLabelText("Loading analytics")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByTestId("metric-users_new")).toHaveTextContent("1,234");
    expect(screen.getByTestId("metric-device_adoption")).toHaveTextContent("66.7%");
    expect(screen.getByTestId("metric-users_new")).toHaveTextContent("Users created in range.");
    expect(screen.getByTestId("metric-users_new")).toHaveTextContent("In selected range");
    expect(screen.getByTestId("metric-support_open")).toHaveTextContent("Current snapshot");
    expect(load).toHaveBeenCalledWith("overview", { range: "30d" });
  });

  it("states the selected range, timezone and granularity", async () => {
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(base)} />);
    expect(await screen.findByTestId("range-banner")).toHaveTextContent("2026-05-17 to 2026-06-15 (30 days, UTC, by day)");
  });

  it("renders a null metric as a dash with an explanation, never as 0", async () => {
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(base)} />);
    const card = await screen.findByTestId("metric-rate_undefined");
    expect(card).toHaveTextContent("—");
    expect(card).toHaveTextContent(/Not defined/);
    expect(card).not.toHaveTextContent(/0%/);
  });

  it("renders a chart with title, definition, unit, range and an accessible data table", async () => {
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(base)} />);
    const chart = await screen.findByRole("img", { name: /New users: 6 in total across 3 periods/ });
    expect(chart.querySelectorAll("rect")).toHaveLength(3);
    const figure = screen.getByLabelText("New users", { selector: "figure" });
    expect(within(figure).getByText(/Users created per period\. Unit: count per day\. 2026-05-17 to 2026-06-15 \(UTC\)/)).toBeInTheDocument();
    expect(within(figure).getByText(/Few data points/)).toBeInTheDocument();
    expect(within(figure).getByText("2026-06-14").nextSibling).toHaveTextContent("4");
  });

  it("shows an empty state instead of a flat chart when a series is all zeros", async () => {
    const empty = { ...base, series: [{ ...base.series[0]!, points: base.series[0]!.points.map((p) => ({ ...p, value: 0 })) }] };
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(empty)} />);
    expect(await screen.findByText("No activity in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows suppressed breakdown cells as hidden, not as numbers, and an empty breakdown message", async () => {
    const data = { ...base, breakdowns: [...base.breakdowns, { ...base.breakdowns[0]!, key: "none", title: "Empty one", items: [] }] };
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(data)} />);
    expect(await screen.findByText("fewer than 5 (hidden)")).toBeInTheDocument();
    expect(screen.getByText("No data in this period.")).toBeInTheDocument();
  });

  it("explains unavailable metrics (reason + needed source) and never renders them as values", async () => {
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(base)} />);
    const list = await screen.findByLabelText("Unavailable metrics");
    expect(list).toHaveTextContent("Active users");
    expect(list).toHaveTextContent("No customer activity source.");
    expect(list).toHaveTextContent("Needs: An activity stream.");
    expect(screen.queryByTestId("metric-users_active")).not.toBeInTheDocument();
  });

  it("fully unavailable sections show the summary and no KPI/chart, e.g. financial", async () => {
    const financial: AnalyticsData = {
      ...base,
      section: "financial",
      availability: "unavailable",
      summary: "Financial analytics are not currently available: provider-owned transaction data is not connected.",
      metrics: [],
      series: [],
      breakdowns: [],
      unavailable: [{ key: "transaction_volume", label: "Transaction volume", reason: "Provider-owned data is not connected.", requires: "A feed." }],
    };
    render(<AnalyticsSection section="financial" title="Financial Analysis" canRead load={vi.fn().mockResolvedValue(financial)} />);
    expect(await screen.findByRole("status")).toHaveTextContent(/provider-owned transaction data is not connected/);
    expect(screen.getByLabelText("Unavailable metrics")).toHaveTextContent("Transaction volume");
    expect(screen.queryByTestId(/^metric-/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("refetches with the new preset when the range changes", async () => {
    const load = vi.fn().mockResolvedValue(base);
    render(<AnalyticsSection section="overview" title="Overview" canRead load={load} />);
    await screen.findByTestId("metric-users_new");
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("overview", { range: "7d" }));
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies a valid custom range and rejects an invalid one without calling the API", async () => {
    const load = vi.fn().mockResolvedValue(base);
    render(<AnalyticsSection section="overview" title="Overview" canRead load={load} />);
    await screen.findByTestId("metric-users_new");
    load.mockClear();
    const [from, to] = [screen.getByLabelText("From"), screen.getByLabelText("To")];
    fireEvent.change(from, { target: { value: "2026-06-10" } });
    fireEvent.change(to, { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply custom range" }));
    expect(screen.getByText(/must not be after/)).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
    fireEvent.change(to, { target: { value: "2026-06-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply custom range" }));
    await waitFor(() => expect(load).toHaveBeenCalledWith("overview", { range: "custom", from: "2026-06-10", to: "2026-06-12" }));
  });

  it("validateCustomRange mirrors the API rules", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(validateCustomRange("", "2026-06-01", now)).toMatch(/both/);
    expect(validateCustomRange("2026-06-10", "2026-06-01", now)).toMatch(/not be after/);
    expect(validateCustomRange("2026-06-01", "2026-06-16", now)).toMatch(/future/);
    expect(validateCustomRange("2025-06-14", "2026-06-15", now)).toMatch(/366/);
    expect(validateCustomRange("2025-06-15", "2026-06-15", now)).toBeNull();
    expect(validateCustomRange("2026-06-15", "2026-06-15", now)).toBeNull();
  });

  it.each([
    [new ApiError("FORBIDDEN", "RAW x", 403), "You do not have permission to view this analytics section."],
    [new ApiError("VALIDATION_ERROR", "RAW to must not be in the future", 400), "The selected date range is not valid. Choose a range of up to 366 days that ends today or earlier."],
    [new ApiError("INTERNAL", "RAW SQL error at pg", 500), "Analytics could not be loaded."],
    [new TypeError("fetch failed"), "Analytics could not be loaded."],
  ])("maps errors to safe messages (%#) and retries", async (err, message) => {
    const load = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(base);
    render(<AnalyticsSection section="overview" title="Overview" canRead load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body.textContent).not.toMatch(/RAW/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("metric-users_new")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("renders no personal fields even if the payload carries extras", async () => {
    const poisoned = { ...base, users: [{ email: "leak@customer.test", phone: "+15550001234" }], metrics: [{ ...base.metrics[0]!, email: "leak@customer.test" }] } as unknown as AnalyticsData;
    render(<AnalyticsSection section="overview" title="Overview" canRead load={vi.fn().mockResolvedValue(poisoned)} />);
    await screen.findByTestId("metric-users_new");
    expect(document.body.textContent).not.toMatch(/leak@customer\.test|5550001234/);
  });
});
