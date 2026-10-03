import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { fetchBeneficiaries, type BeneficiaryLookup } from "../api/beneficiaries.js";

/** Maps normalized API error codes to admin-facing text. Never shows raw server/provider messages. */
export const beneficiaryErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "You do not have permission to view beneficiary information.";
    switch (err.code) {
      case "PROVIDER_UNAVAILABLE":
      case "PROVIDER_ERROR":
        return "Beneficiary information is temporarily unavailable.";
      case "PROVIDER_TIMEOUT":
        return "Beneficiary lookup timed out. Try again.";
      case "PROVIDER_RATE_LIMITED":
        return "The provider is rate limiting requests. Try again shortly.";
      case "PROVIDER_AUTH_FAILED":
      case "PROVIDER_NOT_CONFIGURED":
        return "The beneficiary integration has a configuration problem. Please contact engineering.";
      case "PROVIDER_BAD_RESPONSE":
        return "The provider returned an unexpected response.";
    }
  }
  return "Beneficiary information could not be loaded.";
};

const EMPTY_MESSAGES = {
  no_provider_relationship: "This user has no linked provider account, so there are no beneficiaries to show.",
  not_found: "The provider has no beneficiaries for this user.",
  not_configured: "The provider integration is not configured in this environment.",
  unverified: "Beneficiary information is not yet connected to Transcorp.",
} as const;

const STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  blocked: "Blocked",
  unknown: "Unknown",
} as const;

type Props = {
  userId: string;
  /** UX only — the API enforces beneficiaries.read independently. */
  canRead: boolean;
  load?: typeof fetchBeneficiaries;
};

export const BeneficiariesSection = ({ userId, canRead, load = fetchBeneficiaries }: Props) => {
  const [result, setResult] = useState<BeneficiaryLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await load(userId));
    } catch (err) {
      setError(beneficiaryErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId, load]);

  useEffect(() => {
    if (canRead) void run();
  }, [canRead, run]);

  if (!canRead) return null;

  return (
    <section aria-label="Beneficiaries">
      <h2>Beneficiaries</h2>
      <p>
        <small>Source: Transcorp (provider-sourced, read-only, not stored in BAFT)</small>
      </p>
      {loading && <p>Loading beneficiaries from provider…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void run()}>
            Retry
          </button>
        </div>
      )}
      {result && result.state !== "available" && <p>{EMPTY_MESSAGES[result.state]}</p>}
      {result?.state === "available" && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {result.beneficiaries.map((b, i) => (
              <tr key={i}>
                <td>{b.displayName ?? "—"}</td>
                <td>{b.beneficiaryType ?? "—"}</td>
                <td>{b.maskedReference ?? "—"}</td>
                <td>{STATUS_LABELS[b.status]}</td>
                <td>{b.addedAt ? new Date(b.addedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
