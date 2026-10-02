import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import type { KycLookup } from "../api/kyc.js";
import { KycSection, kycErrorMessage } from "./KycSection.js";

afterEach(cleanup);

// TEST FIXTURE ONLY — not Transcorp data.
const available: KycLookup = {
  source: "transcorp",
  state: "available",
  kyc: { status: "verified", verifiedAt: "2026-01-05T10:00:00.000Z", verificationReference: "XXXX1234", verificationMethod: "fixture-method" },
};

describe("KycSection", () => {
  it("renders nothing and makes no request without kyc.read", () => {
    const load = vi.fn();
    const { container } = render(<KycSection userId="u1" canRead={false} load={load} />);
    expect(container).toBeEmptyDOMElement();
    expect(load).not.toHaveBeenCalled();
  });

  it("shows a loading state, then provider-sourced details with a Source: Transcorp label", async () => {
    const load = vi.fn().mockResolvedValue(available);
    render(<KycSection userId="u1" canRead load={load} />);
    expect(screen.getByText(/Loading KYC/)).toBeInTheDocument();
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.getByText(/Source: Transcorp/)).toBeInTheDocument();
    expect(screen.getByText("XXXX1234")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("u1");
  });

  it("renders only allow-listed fields — extra/sensitive fields in the payload are never shown", async () => {
    const poisoned = {
      ...available,
      kyc: { ...available.kyc, aadhaar: "123456789012", pan: "ABCDE1234F", documentImage: "BASE64-IMG" },
    } as unknown as KycLookup;
    render(<KycSection userId="u1" canRead load={vi.fn().mockResolvedValue(poisoned)} />);
    await screen.findByText("Verified");
    const text = document.body.textContent ?? "";
    for (const leaked of ["123456789012", "ABCDE1234F", "BASE64-IMG"]) expect(text).not.toContain(leaked);
  });

  it.each([
    ["no_provider_relationship", /no linked provider account/],
    ["not_found", /no KYC record/],
    ["not_configured", /not configured/],
    ["unverified", /not been verified/],
  ] as const)("shows an explicit empty state for %s (not an error)", async (state, message) => {
    render(<KycSection userId="u1" canRead load={vi.fn().mockResolvedValue({ source: "transcorp", state, kyc: null })} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["PROVIDER_UNAVAILABLE", 502, "KYC information is temporarily unavailable."],
    ["PROVIDER_ERROR", 502, "KYC information is temporarily unavailable."],
    ["PROVIDER_TIMEOUT", 504, "KYC lookup timed out. Try again."],
    ["PROVIDER_AUTH_FAILED", 502, "The KYC integration has a configuration problem. Please contact engineering."],
    ["PROVIDER_NOT_CONFIGURED", 503, "The KYC integration has a configuration problem. Please contact engineering."],
    ["PROVIDER_BAD_RESPONSE", 502, "The KYC provider returned an unexpected response."],
    ["FORBIDDEN", 403, "You do not have permission to view KYC information."],
    ["SOMETHING_ELSE", 500, "KYC information could not be loaded."],
  ])("maps %s to a safe message and never echoes server text", async (code, status, expected) => {
    const load = vi.fn().mockRejectedValue(new ApiError(code, "RAW SERVER TEXT with Bearer abc and http://internal/x", status));
    render(<KycSection userId="u1" canRead load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(document.body.textContent).not.toMatch(/RAW SERVER TEXT|Bearer|internal/);
  });

  it("handles non-API failures generically and lets the admin retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(available);
    render(<KycSection userId="u1" canRead load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("KYC information could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Verified")).toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("kycErrorMessage treats 401 like unauthorised", () => {
    expect(kycErrorMessage(new ApiError("UNAUTHENTICATED", "x", 401))).toMatch(/permission/);
  });
});
