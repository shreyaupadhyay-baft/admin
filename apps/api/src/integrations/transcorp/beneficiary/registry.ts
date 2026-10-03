import type { BeneficiaryAdapter } from "./types.js";

let adapter: BeneficiaryAdapter | undefined;

/** No adapter is registered in production code until the Transcorp Beneficiary contract is verified. */
export const registerBeneficiaryAdapter = (next: BeneficiaryAdapter | undefined) => {
  adapter = next;
};

export const getBeneficiaryAdapter = (): BeneficiaryAdapter | undefined => adapter;
