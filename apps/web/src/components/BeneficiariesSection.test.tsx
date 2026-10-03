import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import type { BeneficiaryLookup } from "../api/beneficiaries.js";
import { BeneficiariesSection, beneficiaryErrorMessage } from "./BeneficiariesSection.js";

afterEach(cleanup);

// TEST FIXTURE ONLY — not Transcorp data.
const available: BeneficiaryLookup = {
  source: "transcorp",
  state: "available",
  beneficiaries: [{ status: "active", displayName: "Fixture Payee", beneficiaryType: "fixture-type", maskedReference: "XXXX1234", addedAt: "2026-01-05T10:00:00.000Z" }],
};

describe("BeneficiariesSection", () => {
  it("renders nothing and makes no request without beneficiaries.read", () => {
    const load = vi.fn();
    const { container } = render(<BeneficiariesSection userId="u1" canRead={false} load={load} />);
    expect(container).toBeEmptyDOMElement();
    expect(load).not.toHaveBeenCalled();
  });

  it("shows loading, then provider-sourced rows with a Source: Transcorp label", async () => {
    const load = vi.fn().mockResolvedValue(available);
    render(<BeneficiariesSection userId="u1" canRead load={load} />);
    expect(screen.getByText(/Loading beneficiaries/)).toBeInTheDocument();
    expect(await screen.findByText("Fixture Payee")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Source: Transcorp/)).toBeInTheDocument();
    expect(screen.getByText("XXXX1234")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("u1");
  });

  it("renders only allow-listed fields — extra/sensitive fields in the payload are never shown", async () => {
    const poisoned = {
      ...available,
      beneficiaries: [{ ...available.beneficiaries[0], accountNumber: "123456789012345", ifsc: "ABCD0123456", providerId: "PROV-SECRET" }],
    } as unknown as BeneficiaryLookup;
    render(<BeneficiariesSection userId="u1" canRead load={vi.fn().mockResolvedValue(poisoned)} />);
    await screen.findByText("Fixture Payee");
    const text = document.body.textContent ?? "";
    for (const leaked of ["123456789012345", "ABCD0123456", "PROV-SECRET"]) expect(text).not.toContain(leaked);
  });

  it.each([
    ["no_provider_relationship", /no linked provider account/],
    ["not_found", /no beneficiaries for this user/],
    ["not_configured", /not configured/],
    ["unverified", /not yet connected to Transcorp/],
  ] as const)("shows an explicit empty state for %s (not an error, no rows)", async (state, message) => {
    render(<BeneficiariesSection userId="u1" canRead load={vi.fn().mockResolvedValue({ source: "transcorp", state, beneficiaries: [] })} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    ["PROVIDER_UNAVAILABLE", 502, "Beneficiary information is temporarily unavailable."],
    ["PROVIDER_ERROR", 502, "Beneficiary information is temporarily unavailable."],
    ["PROVIDER_TIMEOUT", 504, "Beneficiary lookup timed out. Try again."],
    ["PROVIDER_AUTH_FAILED", 502, "The beneficiary integration has a configuration problem. Please contact engineering."],
    ["PROVIDER_NOT_CONFIGURED", 503, "The beneficiary integration has a configuration problem. Please contact engineering."],
    ["PROVIDER_BAD_RESPONSE", 502, "The provider returned an unexpected response."],
    ["FORBIDDEN", 403, "You do not have permission to view beneficiary information."],
    ["SOMETHING_ELSE", 500, "Beneficiary information could not be loaded."],
  ])("maps %s to a safe message and never echoes server text", async (code, status, expected) => {
    const load = vi.fn().mockRejectedValue(new ApiError(code, "RAW SERVER TEXT with Bearer abc and http://internal/x", status));
    render(<BeneficiariesSection userId="u1" canRead load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(document.body.textContent).not.toMatch(/RAW SERVER TEXT|Bearer|internal/);
  });

  it("handles non-API failures generically and lets the admin retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(available);
    render(<BeneficiariesSection userId="u1" canRead load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Beneficiary information could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Fixture Payee")).toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("beneficiaryErrorMessage treats 401 like unauthorised", () => {
    expect(beneficiaryErrorMessage(new ApiError("UNAUTHENTICATED", "x", 401))).toMatch(/permission/);
  });
});
