/**
 * Defensive redaction for anything derived from provider traffic before it
 * reaches a log line. The client does not log request/response bodies at all;
 * this exists for the few provider-supplied strings we keep for investigation
 * (error codes/messages) and as a safety net for future code.
 */

const SENSITIVE_KEY =
  /authori[sz]ation|token|secret|password|passwd|\bpin\b|otp|cvv|cvc|\bpan\b|card.?(number|no)|account.?(number|no)|aadhaar|aadhar|ifsc|document|kyc|signature|api.?key|cookie|credential|dob|birth|phone|mobile|email|address/i;

export const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;
const MAX_STRING = 200;

export const redactString = (value: string, secrets: readonly string[] = []): string => {
  let out = value;
  for (const secret of secrets) {
    if (secret.length >= 4) out = out.split(secret).join(REDACTED);
  }
  return out
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED) // emails
    .replace(/\b\d[\d -]{7,}\d\b/g, REDACTED) // PAN / phone / account-like digit runs
    .slice(0, MAX_STRING);
};

export const redactForLog = (value: unknown, secrets: readonly string[] = [], depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, secrets);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForLog(v, secrets, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactForLog(v, secrets, depth + 1);
    }
    return out;
  }
  return "[UNSUPPORTED]";
};
