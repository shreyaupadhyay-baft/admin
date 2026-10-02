import { apiGet } from "./client.js";

export type KycStatus = "not_started" | "pending" | "verified" | "rejected" | "expired" | "unknown";

/** Admin-safe KYC DTO. Mirrors the API allow-list; the UI renders only these fields. */
export type KycDetails = {
  status: KycStatus;
  verifiedAt?: string;
  verificationMethod?: string;
  verificationReference?: string;
  declineReason?: string;
};

export type KycLookupState = "available" | "no_provider_relationship" | "not_found" | "not_configured" | "unverified";

export type KycLookup = {
  source: "transcorp";
  state: KycLookupState;
  kyc: KycDetails | null;
};

export const fetchKyc = async (userId: string): Promise<KycLookup> => {
  const res = await apiGet<KycLookup>(`/api/v1/kyc/${encodeURIComponent(userId)}`);
  return res.data;
};
