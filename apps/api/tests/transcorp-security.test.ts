import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { redactForLog, redactString } from "../src/integrations/transcorp/redact.js";
import { SecretValue } from "../src/integrations/transcorp/secret.js";
import { CATEGORY_POLICY, TranscorpProviderError } from "../src/integrations/transcorp/errors.js";
import { InMemoryReplayStore, SharedHeaderTokenVerifier } from "../src/integrations/transcorp/webhook/gateway.js";

const SRC = join(__dirname, "..", "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("Transcorp security", () => {
  describe("SecretValue", () => {
    const secret = new SecretValue("super-secret-value");
    it("does not leak through JSON, string conversion, template literals or util.inspect", () => {
      expect(JSON.stringify({ secret })).not.toContain("super-secret-value");
      expect(String(secret)).not.toContain("super-secret-value");
      expect(`${secret}`).not.toContain("super-secret-value");
      expect(inspect({ secret }, { depth: 5 })).not.toContain("super-secret-value");
      expect(Object.values(secret as unknown as Record<string, unknown>)).toEqual([]);
    });
    it("reveals only through the explicit accessor", () => {
      expect(secret.reveal()).toBe("super-secret-value");
    });
  });

  describe("redaction", () => {
    it("masks sensitive keys at any depth and truncates deep/large structures", () => {
      const out = redactForLog({
        ok: "fine",
        Authorization: "Bearer abc",
        nested: { password: "pw", pan: "4111111111111111", otp: "1234", kycDocument: "base64..." , list: [{ accessToken: "t" }] },
      }) as Record<string, unknown>;
      const dump = JSON.stringify(out);
      for (const leaked of ["Bearer abc", "pw", "4111111111111111", "1234", "base64", '"t"']) expect(dump).not.toContain(leaked);
      expect(out.ok).toBe("fine");
    });

    it("scrubs known secret values, bearer tokens, emails and PAN/phone-like digit runs from strings", () => {
      const s = redactString("tok=abcd1234secret Bearer xyz.123 jane@x.com 4111 1111 1111 1111 9876543210", ["abcd1234secret"]);
      expect(s).not.toMatch(/abcd1234secret|xyz\.123|jane@|4111|9876543210/);
    });
  });

  describe("error model", () => {
    it("maps every category to a fixed client-safe message and a BAFT status", () => {
      for (const [category, policy] of Object.entries(CATEGORY_POLICY)) {
        expect(policy.message, category).not.toMatch(/transcorp|m2p|yappay/i);
        expect([404, 422, 429, 500, 502, 503, 504]).toContain(policy.httpStatus);
      }
    });

    it("never maps provider auth failures to 401/403 (would log the admin out)", () => {
      expect(CATEGORY_POLICY.authentication.httpStatus).toBe(502);
    });

    it("keeps internal detail off the client-facing message", () => {
      const e = new TranscorpProviderError("provider_5xx", { operation: "x.y", detail: "internal-only", httpStatus: 500 });
      expect(e.message).not.toContain("internal-only");
      expect(e.toLogFields()).toMatchObject({ category: "provider_5xx", detail: "internal-only" });
    });
  });

  describe("webhook primitives", () => {
    it("verifier accepts only the exact token in the configured header (case-insensitive header name)", () => {
      const v = new SharedHeaderTokenVerifier("X-Hook", "tok");
      expect(v.verify({ "x-hook": "tok" })).toBe(true);
      expect(v.verify({ "x-hook": "tok2" })).toBe(false);
      expect(v.verify({ "x-hook": "" })).toBe(false);
      expect(v.verify({ "x-hook": ["tok"] })).toBe(false);
      expect(v.verify({})).toBe(false);
    });

    it("replay store claims once per TTL window and can be released", async () => {
      let now = 0;
      const store = new InMemoryReplayStore(() => now);
      expect(await store.claim("k", 10)).toBe("new");
      expect(await store.claim("k", 10)).toBe("duplicate");
      now = 11_000;
      expect(await store.claim("k", 10)).toBe("new");
      await store.release("k");
      expect(await store.claim("k", 10)).toBe("new");
    });
  });

  describe("architecture guards (static)", () => {
    const files = walk(SRC).map((f) => ({ path: relative(SRC, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

    it("only the Transcorp client performs outbound HTTP", () => {
      const offenders = files.filter((f) => /\bfetch\(|from "node:https?"|from "https?"|axios|undici|got\(/.test(f.text) && f.path !== "integrations/transcorp/client.ts");
      expect(offenders.map((f) => f.path)).toEqual([]);
    });

    it("controllers and routes never import the raw client or build provider URLs", () => {
      const offenders = files.filter(
        (f) => /^(controllers|routes)\//.test(f.path) && /integrations\/transcorp\/client\.js/.test(f.text),
      );
      expect(offenders.map((f) => f.path)).toEqual([]);
    });

    it("no module accepts a base URL or target URL from request input", () => {
      const offenders = files.filter((f) => /req\.(body|query|params)\.\w*(url|baseUrl|endpoint|host)\b/i.test(f.text) && f.path.includes("transcorp"));
      expect(offenders.map((f) => f.path)).toEqual([]);
    });

    it("client strips redirects and never logs headers or bodies", () => {
      const client = files.find((f) => f.path === "integrations/transcorp/client.ts")!.text;
      expect(client).toContain('redirect: "manual"');
      expect(client).not.toMatch(/logWithContext\([^)]*headers/);
    });

    it("no hardcoded credentials or provider hostnames in the integration source", () => {
      const integration = files.filter((f) => f.path.startsWith("integrations/transcorp/"));
      for (const f of integration) {
        expect(f.text, f.path).not.toMatch(/https?:\/\/[a-z0-9.-]*(transcorp|m2p|yappay)/i);
        expect(f.text, f.path).not.toMatch(/(token|secret|password)\s*[:=]\s*["'][A-Za-z0-9]{12,}["']/i);
      }
    });

    it("introduces no provider-owned tables or provider-data routes", () => {
      const migrations = files.filter((f) => f.path.startsWith("infrastructure/database/migrations/"));
      const providerTables = migrations.filter((f) =>
        /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?(transactions?|cards?|kyc\w*|beneficiar\w+|payments?|disputes?|ledger\w*|settlements?|provider_customers?)\b/i.test(f.text),
      );
      expect(providerTables.map((f) => f.path)).toEqual([]);
      const routes = readFileSync(join(SRC, "routes/index.ts"), "utf8");
      expect(routes).not.toMatch(/"\/(transactions|cards|beneficiaries|disputes|payments)/);
    });

    it("no KYC adapter is registered in production code until the Transcorp KYC contract is verified", () => {
      const registrations = files.filter((f) => /^\s*registerKycAdapter\(/m.test(f.text));
      expect(registrations.map((f) => f.path)).toEqual([]);
    });

    it("KYC controllers/services never build provider URLs or accept provider ids from the request", () => {
      for (const path of ["controllers/kyc.controller.ts", "services/kyc.service.ts", "routes/kyc.routes.ts"]) {
        const text = files.find((f) => f.path === path)!.text;
        expect(text, path).not.toMatch(/https?:\/\/|fetch\(|req\.(query|body)/);
      }
    });

    it("no Beneficiary adapter is registered in production code until the Transcorp Beneficiary contract is verified", () => {
      const registrations = files.filter((f) => /^\s*registerBeneficiaryAdapter\(/m.test(f.text));
      expect(registrations.map((f) => f.path)).toEqual([]);
    });

    it("Beneficiary controller/service never build provider URLs or read provider ids from the request", () => {
      for (const path of ["controllers/beneficiary.controller.ts", "services/beneficiary.service.ts"]) {
        const text = files.find((f) => f.path === path)!.text;
        expect(text, path).not.toMatch(/https?:\/\/|fetch\(|req\.(query|body)/);
      }
    });

    it("introduces no broad Transcorp permission", () => {
      const perms = files.find((f) => f.path === "constants/permissions.ts")!.text;
      expect(perms).not.toMatch(/transcorp\.(admin|\*|all|manage)/i);
      expect(perms).not.toMatch(/TRANSCORP_/);
    });
  });
});
