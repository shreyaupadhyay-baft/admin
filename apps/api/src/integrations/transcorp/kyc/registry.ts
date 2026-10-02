import type { KycAdapter } from "./types.js";

let adapter: KycAdapter | undefined;

/** No adapter is registered in production code until the Transcorp KYC contract is verified. */
export const registerKycAdapter = (next: KycAdapter | undefined) => {
  adapter = next;
};

export const getKycAdapter = (): KycAdapter | undefined => adapter;
