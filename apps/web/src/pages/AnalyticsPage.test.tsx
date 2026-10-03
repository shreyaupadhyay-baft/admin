import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../context/AuthContext.js", () => ({ useAuth: () => ({ can: (p: string) => perms.granted.has(p) }) }));
const fetchAnalytics = vi.hoisted(() => vi.fn());
vi.mock("../api/analytics.js", async (orig) => ({ ...(await orig<typeof import("../api/analytics.js")>()), fetchAnalytics }));

import { AnalyticsPage } from "./AnalyticsPage.js";

afterEach(() => {
  cleanup();
  perms.granted.clear();
  fetchAnalytics.mockReset();
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analytics/:section" element={<AnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  );

const empty = (section: string) => ({
  section,
  range: { preset: "30d", from: "2026-05-17", to: "2026-06-15", days: 30, granularity: "day", timezone: "UTC" },
  generatedAt: "2026-06-15T12:00:00.000Z",
  availability: "unavailable",
  summary: "Feature usage data unavailable.",
  metrics: [],
  series: [],
  breakdowns: [],
  unavailable: [],
});

describe("AnalyticsPage permission gating", () => {
  it("shows no section tabs and makes no request without any analytics permission", () => {
    renderAt("/analytics");
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access to Analytics");
    expect(fetchAnalytics).not.toHaveBeenCalled();
  });

  it("lists only permitted sections and redirects /analytics to the first one", async () => {
    perms.granted.add("analytics.rewards.read");
    perms.granted.add("analytics.usage.read");
    fetchAnalytics.mockResolvedValue(empty("usage"));
    renderAt("/analytics");
    const nav = await screen.findByRole("navigation", { name: "Analytics sections" });
    expect(nav).toHaveTextContent("BAFT Usage");
    expect(nav).toHaveTextContent("Rewards");
    expect(nav).not.toHaveTextContent("Financial Analysis");
    expect(nav).not.toHaveTextContent("Overview");
    expect(fetchAnalytics.mock.calls[0]![0]).toBe("usage");
  });

  it("a deep link to a section the admin lacks never loads data", () => {
    perms.granted.add("analytics.overview.read");
    renderAt("/analytics/financial");
    // not permitted → the section renders an access message and never requests data
    expect(fetchAnalytics.mock.calls.every(([s]) => s !== "financial")).toBe(true);
  });

  it("shows a feature-usage unavailable state", async () => {
    perms.granted.add("analytics.features.read");
    fetchAnalytics.mockResolvedValue(empty("features"));
    renderAt("/analytics/features");
    expect(await screen.findByRole("status")).toHaveTextContent("Feature usage data unavailable.");
  });
});
