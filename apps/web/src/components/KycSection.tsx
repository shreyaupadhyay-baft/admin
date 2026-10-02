import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { fetchKyc, type KycLookup } from "../api/kyc.js";

/** Maps normalized API error codes to admin-facing text. Never shows raw server/provider messages. */
export const kycErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "You do not have permission to view KYC information.";
    switch (err.code) {
      case "PROVIDER_UNAVAILABLE":
      case "PROVIDER_ERROR":
        return "KYC information is temporarily unavailable.";
      case "PROVIDER_TIMEOUT":
        return "KYC lookup timed out. Try again.";
      case "PROVIDER_RATE_LIMITED":
        return "The KYC provider is rate limiting requests. Try again shortly.";
      case "PROVIDER_AUTH_FAILED":
      case "PROVIDER_NOT_CONFIGURED":
        return "The KYC integration has a configuration problem. Please contact engineering.";
      case "PROVIDER_BAD_RESPONSE":
        return "The KYC provider returned an unexpected response.";
    }
  }
  return "KYC information could not be loaded.";
};

const EMPTY_MESSAGES = {
  no_provider_relationship: "This user has no linked provider account, so there is no KYC information to show.",
  not_found: "The provider has no KYC record for this user.",
  not_configured: "The KYC provider integration is not configured in this environment.",
  unverified: "KYC lookup is not yet enabled: the provider KYC integration has not been verified.",
} as const;

const STATUS_LABELS = {
  not_started: "Not started",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
  unknown: "Unknown",
} as const;

type Props = {
  userId: string;
  /** UX only — the API enforces kyc.read independently. */
  canRead: boolean;
  load?: typeof fetchKyc;
};

export const KycSection = ({ userId, canRead, load = fetchKyc }: Props) => {
  const [result, setResult] = useState<KycLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await load(userId));
    } catch (err) {
      setError(kycErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId, load]);

  useEffect(() => {
    if (canRead) void run();
  }, [canRead, run]);

  if (!canRead) return null;

  return (
    <section aria-label="KYC">
      <h2>KYC</h2>
      <p>
        <small>Source: Transcorp (provider-sourced, read-only, not stored in BAFT)</small>
      </p>
      {loading && <p>Loading KYC from provider…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void run()}>
            Retry
          </button>
        </div>
      )}
      {result && result.state !== "available" && <p>{EMPTY_MESSAGES[result.state]}</p>}
      {result?.state === "available" && result.kyc && (
        <dl>
          <dt>Status</dt>
          <dd>{STATUS_LABELS[result.kyc.status]}</dd>
          {result.kyc.verifiedAt && (
            <>
              <dt>Verified at</dt>
              <dd>{new Date(result.kyc.verifiedAt).toLocaleString()}</dd>
            </>
          )}
          {result.kyc.verificationMethod && (
            <>
              <dt>Method</dt>
              <dd>{result.kyc.verificationMethod}</dd>
            </>
          )}
          {result.kyc.verificationReference && (
            <>
              <dt>Reference</dt>
              <dd>{result.kyc.verificationReference}</dd>
            </>
          )}
          {result.kyc.declineReason && (
            <>
              <dt>Decline reason</dt>
              <dd>{result.kyc.declineReason}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
};
