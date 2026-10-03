import { apiGet } from "./client.js";

export type BeneficiaryStatus = "active" | "inactive" | "pending" | "blocked" | "unknown";

/** Admin-safe beneficiary DTO. Mirrors the API allow-list; the UI renders only these fields. */
export type Beneficiary = {
  status: BeneficiaryStatus;
  displayName?: string;
  beneficiaryType?: string;
  maskedReference?: string;
  addedAt?: string;
};

export type BeneficiaryLookupState = "available" | "no_provider_relationship" | "not_found" | "not_configured" | "unverified";

export type BeneficiaryLookup = {
  source: "transcorp";
  state: BeneficiaryLookupState;
  beneficiaries: Beneficiary[];
};

export const fetchBeneficiaries = async (userId: string): Promise<BeneficiaryLookup> => {
  const res = await apiGet<BeneficiaryLookup>(`/api/v1/users/${encodeURIComponent(userId)}/beneficiaries`);
  return res.data;
};
