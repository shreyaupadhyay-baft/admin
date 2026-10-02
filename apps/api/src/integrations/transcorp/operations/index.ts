/**
 * Transcorp operation registry.
 *
 * Future provider modules add their operations here, one file per domain,
 * e.g. `operations/transactions.ts`:
 *
 *   export const lookupTransaction = defineOperation({
 *     name: "transactions.lookup",
 *     host: "main", method: "GET", kind: "read", idempotency: "none",
 *     path: (p: { id: string }) => `/transactions/${pathSegment(p.id)}`,
 *     responseSchema: transactionSchema,
 *   });
 *
 * and expose a typed function for BAFT services:
 *
 *   export const transactionsApi = {
 *     lookup: (id: string, ctx: RequestContext) =>
 *       getTranscorpClient().execute(lookupTransaction, { params: { id } }, ctx),
 *   };
 *
 * Controllers call BAFT services; services call these typed functions. Paths,
 * hosts, methods and schemas live only in operation definitions.
 *
 * NO provider business operations are defined yet (KYC, beneficiaries,
 * transactions, cards, payment issues, disputes are out of scope for the
 * foundation slice, and their Transcorp contracts are unconfirmed).
 * Each domain slice must also be gated by its own BAFT permission
 * (kyc.read, transactions.read, ...) — never by a generic "Transcorp" one.
 */
export { createHealthProbeOperation } from "./health.js";
export { defineOperation, pathSegment } from "./types.js";
export type { TranscorpOperation } from "./types.js";
