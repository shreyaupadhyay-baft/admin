import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const logCalls: Array<{ level: string; message: string; context: Record<string, unknown> }> = [];
vi.mock("../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logWithContext: (level: string, message: string, context: Record<string, unknown> = {}) => {
    logCalls.push({ level, message, context });
  },
}));

const { TranscorpClient } = await import("../src/integrations/transcorp/client.js");
const { defineOperation, pathSegment } = await import("../src/integrations/transcorp/operations/types.js");
const { isTranscorpProviderError } = await import("../src/integrations/transcorp/errors.js");
const { buildConfig, json, startMockServer, TEST_TOKEN } = await import("./helpers/transcorp.js");
type MockServer = Awaited<ReturnType<typeof startMockServer>>;

const itemSchema = z.object({ id: z.string(), status: z.string() });

const getItem = defineOperation({
  name: "test.getItem",
  host: "main",
  method: "GET",
  kind: "read",
  idempotency: "none",
  path: (p: { id: string }) => `/items/${pathSegment(p.id)}`,
  query: (p: { id: string }) => ({ expand: p.id.length > 0 ? "yes" : undefined }),
  responseSchema: itemSchema,
});

const createItem = (idempotency: "none" | "natural" | "key") =>
  defineOperation({
    name: "test.createItem",
    host: "main",
    method: "POST",
    kind: "write",
    idempotency,
    path: () => "/items",
    requestSchema: z.object({ name: z.string() }),
    responseSchema: itemSchema,
  });

const noSleep = async () => undefined;
const ctx = { requestId: "req-1", correlationId: "corr-1" };

const catchErr = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
};

describe("TranscorpClient", () => {
  let server: MockServer;

  beforeAll(async () => {
    server = await startMockServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(() => {
    server.requests.length = 0;
    logCalls.length = 0;
    server.setHandler((_r, res) => json(res, 200, { id: "1", status: "ok" }));
  });
  afterEach(() => vi.useRealTimers());

  const client = (overrides: Record<string, string | undefined> = {}, deps: Record<string, unknown> = {}) =>
    new TranscorpClient({ config: buildConfig(server.url, overrides), sleep: noSleep, random: () => 0.5, ...deps });

  describe("success path", () => {
    it("returns schema-validated data and sends bearer auth + correlation headers", async () => {
      const result = await client().execute(getItem, { params: { id: "abc" } }, ctx);
      expect(result).toEqual({ id: "1", status: "ok" });

      const sent = server.requests[0]!;
      expect(sent.method).toBe("GET");
      expect(sent.url).toBe("/items/abc?expand=yes");
      expect(sent.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
      expect(sent.headers["x-correlation-id"]).toBe("corr-1");
      expect(sent.headers["x-baft-request-id"]).toBe("req-1");
      expect(sent.headers.accept).toBe("application/json");
    });

    it("strips unknown provider fields via the response schema (no excess passthrough)", async () => {
      server.setHandler((_r, res) => json(res, 200, { id: "1", status: "ok", pan: "4111111111111111", extra: { a: 1 } }));
      const result = await client().execute(getItem, { params: { id: "1" } }, ctx);
      expect(result).toEqual({ id: "1", status: "ok" });
    });

    it("supports api_key_header, partner_headers and tenant header auth shapes", async () => {
      await client({ TRANSCORP_AUTH_MODE: "api_key_header", TRANSCORP_AUTH_HEADER_NAME: "X-Api-Key" }).execute(getItem, { params: { id: "1" } }, ctx);
      expect(server.requests[0]!.headers["x-api-key"]).toBe(TEST_TOKEN);
      expect(server.requests[0]!.headers.authorization).toBeUndefined();

      await client({
        TRANSCORP_AUTH_MODE: "partner_headers",
        TRANSCORP_PARTNER_ID: "pid-1",
        TRANSCORP_PARTNER_TOKEN: "ptok-1",
        TRANSCORP_PARTNER_ID_HEADER: "X-Partner-Id",
        TRANSCORP_PARTNER_TOKEN_HEADER: "X-Partner-Token",
        TRANSCORP_TENANT: "tenant-a",
        TRANSCORP_TENANT_HEADER: "X-Tenant",
      }).execute(getItem, { params: { id: "1" } }, ctx);
      const h = server.requests[1]!.headers;
      expect(h["x-partner-id"]).toBe("pid-1");
      expect(h["x-partner-token"]).toBe("ptok-1");
      expect(h["x-tenant"]).toBe("tenant-a");
    });

    it("sends a validated JSON body for writes", async () => {
      const result = await client().execute(createItem("none"), { body: { name: "n" } }, ctx);
      expect(result.id).toBe("1");
      expect(server.requests[0]!.body).toBe('{"name":"n"}');
      expect(server.requests[0]!.headers["content-type"]).toBe("application/json");
    });

    it("rejects an invalid request body before anything is sent", async () => {
      const err = await catchErr(client().execute(createItem("none"), { body: { name: 5 } as never }, ctx));
      expect((err as { category: string }).category).toBe("invalid_request");
      expect(server.requests).toHaveLength(0);
    });
  });

  describe("error normalisation", () => {
    const cases: Array<[number, string, number, string]> = [
      [401, "authentication", 502, "PROVIDER_AUTH_FAILED"],
      [403, "authentication", 502, "PROVIDER_AUTH_FAILED"],
      [400, "validation", 422, "PROVIDER_REJECTED_REQUEST"],
      [422, "validation", 422, "PROVIDER_REJECTED_REQUEST"],
      [409, "validation", 422, "PROVIDER_REJECTED_REQUEST"],
      [404, "not_found", 404, "PROVIDER_RESOURCE_NOT_FOUND"],
      [500, "provider_5xx", 502, "PROVIDER_ERROR"],
      [503, "provider_5xx", 502, "PROVIDER_ERROR"],
      [302, "malformed_response", 502, "PROVIDER_BAD_RESPONSE"],
    ];

    it.each(cases)("maps HTTP %i → %s (BAFT %i %s)", async (status, category, bafStatus, code) => {
      server.setHandler((_r, res) => json(res, status, { code: "E123", message: "secret provider text 4111111111111111" }));
      const err = await catchErr(client({ TRANSCORP_MAX_ATTEMPTS: "1" }).execute(getItem, { params: { id: "1" } }, ctx));
      expect(isTranscorpProviderError(err)).toBe(true);
      const e = err as InstanceType<typeof import("../src/integrations/transcorp/errors.js").TranscorpProviderError>;
      expect(e.category).toBe(category);
      expect(e.status).toBe(bafStatus);
      expect(e.code).toBe(code);
    });

    it("never exposes raw provider payload text in the client-facing message", async () => {
      server.setHandler((_r, res) => json(res, 400, { code: "E1", message: "Customer jane@example.com card 4111 1111 1111 1111 invalid" }));
      const e = (await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as Error;
      expect(e.message).not.toMatch(/jane|4111|Customer/);
    });

    it("keeps a token-shaped provider error code internally but drops provider free text entirely", async () => {
      server.setHandler((_r, res) => json(res, 400, { code: "INVALID_ACCOUNT", message: "bad card 4111111111111111 for jane@example.com" }));
      const e = (await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as InstanceType<
        typeof import("../src/integrations/transcorp/errors.js").TranscorpProviderError
      >;
      expect(e.internal.providerErrorCode).toBe("INVALID_ACCOUNT");
      expect(e.internal.detail).toBeUndefined();
    });

    it("429 → rate_limited; Retry-After beyond the cap is surfaced, not waited out", async () => {
      server.setHandler((_r, res) => json(res, 429, {}, { "retry-after": "120" }));
      const e = (await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as { category: string; status: number };
      expect(e.category).toBe("rate_limited");
      expect(e.status).toBe(429);
      expect(server.requests).toHaveLength(1);
    });
  });

  describe("malformed responses", () => {
    it("schema mismatch → malformed_response, with field paths but no values", async () => {
      server.setHandler((_r, res) => json(res, 200, { id: 42, status: "ok", secretish: "VALUE-SHOULD-NOT-LEAK" }));
      const e = (await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as InstanceType<
        typeof import("../src/integrations/transcorp/errors.js").TranscorpProviderError
      >;
      expect(e.category).toBe("malformed_response");
      expect(e.internal.detail).toContain("id");
      expect(JSON.stringify(e.toLogFields())).not.toContain("VALUE-SHOULD-NOT-LEAK");
      expect(server.requests).toHaveLength(1); // malformed is not retried
    });

    it("invalid JSON / non-JSON content type / empty body when data required", async () => {
      server.setHandler((_r, res) => res.writeHead(200, { "content-type": "application/json" }).end("{not json"));
      expect(((await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as { category: string }).category).toBe("malformed_response");

      server.setHandler((_r, res) => res.writeHead(200, { "content-type": "text/html" }).end("<html>"));
      expect(((await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as { category: string }).category).toBe("malformed_response");

      server.setHandler((_r, res) => res.writeHead(204).end());
      expect(((await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as { category: string }).category).toBe("malformed_response");
    });

    it("oversized responses are rejected without buffering them", async () => {
      server.setHandler((_r, res) => json(res, 200, { id: "1", status: "x".repeat(5000) }));
      const e = (await catchErr(client({ TRANSCORP_MAX_RESPONSE_BYTES: "1024" }).execute(getItem, { params: { id: "1" } }, ctx))) as {
        category: string;
      };
      expect(e.category).toBe("malformed_response");
    });

    it("does not follow redirects (no off-host hop)", async () => {
      server.setHandler((_r, res) => res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }).end());
      const e = (await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx))) as { category: string };
      expect(e.category).toBe("malformed_response");
      expect(server.requests).toHaveLength(1);
    });
  });

  describe("timeouts and network failures", () => {
    it("times out a hung provider and normalises to timeout (read retries are bounded)", async () => {
      server.setHandler(() => {
        /* never respond */
      });
      const started = Date.now();
      const e = (await catchErr(
        client({ TRANSCORP_TIMEOUT_MS: "100", TRANSCORP_MAX_ATTEMPTS: "2" }).execute(getItem, { params: { id: "1" } }, ctx),
      )) as { category: string; status: number; internal: { attempts: number } };
      expect(e.category).toBe("timeout");
      expect(e.status).toBe(504);
      expect(e.internal.attempts).toBe(2);
      expect(server.requests).toHaveLength(2);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it("total time budget caps retries even if attempts remain", async () => {
      server.setHandler(() => undefined);
      const e = (await catchErr(
        client({ TRANSCORP_TIMEOUT_MS: "100", TRANSCORP_TOTAL_TIMEOUT_MS: "150", TRANSCORP_MAX_ATTEMPTS: "5" }).execute(
          getItem,
          { params: { id: "1" } },
          ctx,
        ),
      )) as { category: string };
      expect(e.category).toBe("timeout");
      expect(server.requests.length).toBeLessThan(5);
    });

    it("connection refused → network", async () => {
      const dead = await startMockServer();
      const url = dead.url;
      await dead.close();
      const c = new TranscorpClient({ config: buildConfig(url, { TRANSCORP_MAX_ATTEMPTS: "2" }), sleep: noSleep });
      const e = (await catchErr(c.execute(getItem, { params: { id: "1" } }, ctx))) as {
        category: string;
        status: number;
        internal: { attempts: number; detail: string };
      };
      expect(e.category).toBe("network");
      expect(e.status).toBe(502);
      expect(e.internal.attempts).toBe(2);
      expect(e.internal.detail).toMatch(/ECONNREFUSED/);
    });

    it("connection dropped mid-response → network", async () => {
      server.setHandler((_r, res) => res.socket?.destroy());
      const e = (await catchErr(client({ TRANSCORP_MAX_ATTEMPTS: "1" }).execute(getItem, { params: { id: "1" } }, ctx))) as { category: string };
      expect(e.category).toBe("network");
    });
  });

  describe("retry policy", () => {
    it("retries reads on 5xx and succeeds when the provider recovers", async () => {
      server.setHandler((_r, res, n) => (n < 3 ? json(res, 503, {}) : json(res, 200, { id: "1", status: "ok" })));
      const result = await client().execute(getItem, { params: { id: "1" } }, ctx);
      expect(result.status).toBe("ok");
      expect(server.requests).toHaveLength(3);
      expect(logCalls.filter((l) => l.message === "transcorp_request_retry")).toHaveLength(2);
    });

    it("gives up after maxAttempts (bounded)", async () => {
      server.setHandler((_r, res) => json(res, 500, {}));
      const e = (await catchErr(client({ TRANSCORP_MAX_ATTEMPTS: "3" }).execute(getItem, { params: { id: "1" } }, ctx))) as {
        internal: { attempts: number };
      };
      expect(server.requests).toHaveLength(3);
      expect(e.internal.attempts).toBe(3);
    });

    it("honours a short Retry-After on 429 then retries", async () => {
      server.setHandler((_r, res, n) => (n === 1 ? json(res, 429, {}, { "retry-after": "0" }) : json(res, 200, { id: "1", status: "ok" })));
      await client().execute(getItem, { params: { id: "1" } }, ctx);
      expect(server.requests).toHaveLength(2);
    });

    it.each([400, 401, 403, 404, 422])("does not retry non-retryable HTTP %i", async (status) => {
      server.setHandler((_r, res) => json(res, status, {}));
      await catchErr(client().execute(getItem, { params: { id: "1" } }, ctx));
      expect(server.requests).toHaveLength(1);
    });

    it("never retries a write with idempotency 'none' (even on 503 / timeout)", async () => {
      server.setHandler((_r, res) => json(res, 503, {}));
      await catchErr(client().execute(createItem("none"), { body: { name: "n" } }, ctx));
      expect(server.requests).toHaveLength(1);

      server.requests.length = 0;
      server.setHandler(() => undefined);
      const e = (await catchErr(client({ TRANSCORP_TIMEOUT_MS: "100" }).execute(createItem("none"), { body: { name: "n" } }, ctx))) as {
        internal: { detail: string };
      };
      expect(server.requests).toHaveLength(1);
      expect(e.internal.detail).toMatch(/may have been processed/);
    });

    it("retries a write declared naturally idempotent", async () => {
      server.setHandler((_r, res, n) => (n < 2 ? json(res, 503, {}) : json(res, 200, { id: "1", status: "ok" })));
      await client().execute(createItem("natural"), { body: { name: "n" } }, ctx);
      expect(server.requests).toHaveLength(2);
    });

    it("'key' writes retry only with a configured header AND a caller-supplied key, and send the key", async () => {
      server.setHandler((_r, res) => json(res, 503, {}));
      await catchErr(client().execute(createItem("key"), { body: { name: "n" }, idempotencyKey: "k1" }, ctx));
      expect(server.requests).toHaveLength(1); // header not configured → no retry

      server.requests.length = 0;
      await catchErr(client({ TRANSCORP_IDEMPOTENCY_HEADER: "Idempotency-Key" }).execute(createItem("key"), { body: { name: "n" } }, ctx));
      expect(server.requests).toHaveLength(1); // no key supplied → no retry

      server.requests.length = 0;
      await catchErr(
        client({ TRANSCORP_IDEMPOTENCY_HEADER: "Idempotency-Key" }).execute(createItem("key"), { body: { name: "n" }, idempotencyKey: "k1" }, ctx),
      );
      expect(server.requests).toHaveLength(3);
      expect(server.requests.every((r) => r.headers["idempotency-key"] === "k1")).toBe(true);
    });

    it("uses full-jitter backoff bounded by the configured max delay", async () => {
      const delays: number[] = [];
      server.setHandler((_r, res) => json(res, 500, {}));
      const c = new TranscorpClient({
        config: buildConfig(server.url, { TRANSCORP_MAX_ATTEMPTS: "4", TRANSCORP_RETRY_BASE_DELAY_MS: "100", TRANSCORP_RETRY_MAX_DELAY_MS: "250" }),
        sleep: async (ms) => void delays.push(ms),
        random: () => 0.999999,
      });
      await catchErr(c.execute(getItem, { params: { id: "1" } }, ctx));
      expect(delays).toHaveLength(3);
      expect(Math.max(...delays)).toBeLessThanOrEqual(250);
    });
  });

  describe("retry-storm protection", () => {
    it("opens the circuit after repeated provider failures and fails fast without calling out", async () => {
      server.setHandler((_r, res) => json(res, 500, {}));
      let now = 1_000_000;
      const c = new TranscorpClient({
        config: buildConfig(server.url, { TRANSCORP_MAX_ATTEMPTS: "1", TRANSCORP_CIRCUIT_FAILURE_THRESHOLD: "3", TRANSCORP_CIRCUIT_COOLDOWN_MS: "30000" }),
        sleep: noSleep,
        now: () => now,
      });
      for (let i = 0; i < 3; i++) await catchErr(c.execute(getItem, { params: { id: "1" } }, ctx));
      expect(server.requests).toHaveLength(3);
      expect(c.circuit.state).toBe("open");

      const e = (await catchErr(c.execute(getItem, { params: { id: "1" } }, ctx))) as { category: string; status: number };
      expect(e.category).toBe("circuit_open");
      expect(e.status).toBe(503);
      expect(server.requests).toHaveLength(3);

      // After the cooldown a single trial goes through; success closes the circuit.
      now += 31_000;
      server.setHandler((_r, res) => json(res, 200, { id: "1", status: "ok" }));
      await c.execute(getItem, { params: { id: "1" } }, ctx);
      expect(c.circuit.state).toBe("closed");
    });

    it("4xx responses do not trip the circuit", async () => {
      server.setHandler((_r, res) => json(res, 404, {}));
      const c = client({ TRANSCORP_CIRCUIT_FAILURE_THRESHOLD: "2" });
      for (let i = 0; i < 5; i++) await catchErr(c.execute(getItem, { params: { id: "1" } }, ctx));
      expect(c.circuit.state).toBe("closed");
    });

    it("caps concurrent in-flight requests", async () => {
      server.setHandler(() => undefined); // hang
      const c = client({ TRANSCORP_MAX_CONCURRENT_REQUESTS: "1", TRANSCORP_TIMEOUT_MS: "200", TRANSCORP_MAX_ATTEMPTS: "1" });
      const first = catchErr(c.execute(getItem, { params: { id: "1" } }, ctx));
      await new Promise((r) => setTimeout(r, 30));
      const second = (await catchErr(c.execute(getItem, { params: { id: "2" } }, ctx))) as { category: string };
      expect(second.category).toBe("circuit_open");
      await first;
    });
  });

  describe("configuration state", () => {
    it("fails closed with not_configured when a KYC-host operation is used without a KYC host", async () => {
      const kycOp = defineOperation({
        name: "test.kycThing",
        host: "kyc",
        method: "GET",
        kind: "read",
        idempotency: "none",
        path: () => "/x",
        responseSchema: z.unknown(),
      });
      const e = (await catchErr(client().execute(kycOp, {}, ctx))) as { category: string; status: number };
      expect(e.category).toBe("not_configured");
      expect(e.status).toBe(503);
      expect(server.requests).toHaveLength(0);
    });
  });

  describe("observability", () => {
    it("emits exactly one completion log per call with safe metadata and correlation ids", async () => {
      await client().execute(getItem, { params: { id: "1" } }, ctx);
      const lines = logCalls.filter((l) => l.message === "transcorp_request");
      expect(lines).toHaveLength(1);
      expect(lines[0]!.context).toMatchObject({
        provider: "transcorp",
        operation: "test.getItem",
        requestId: "req-1",
        correlationId: "corr-1",
        outcome: "success",
        httpStatus: 200,
        attempts: 1,
      });
      expect(typeof lines[0]!.context.latencyMs).toBe("number");
    });

    it("logs failures with category/status, one line per call (retries logged separately)", async () => {
      server.setHandler((_r, res) => json(res, 500, { code: "E9" }));
      await catchErr(client({ TRANSCORP_MAX_ATTEMPTS: "2" }).execute(getItem, { params: { id: "1" } }, ctx));
      const final = logCalls.filter((l) => l.message === "transcorp_request");
      expect(final).toHaveLength(1);
      expect(final[0]!.context).toMatchObject({ outcome: "failure", category: "provider_5xx", httpStatus: 500, attempts: 2, providerErrorCode: "E9" });
      expect(logCalls.filter((l) => l.message === "transcorp_request_retry")).toHaveLength(1);
    });

    it("never logs credentials, auth headers, request bodies or provider payloads", async () => {
      server.setHandler((_r, res) =>
        json(res, 400, { code: "E1", message: `echo ${TEST_TOKEN} PAN 4111111111111111 otp 123456 jane@example.com`, card: { pan: "4111111111111111" } }),
      );
      await catchErr(client().execute(createItem("none"), { body: { name: "CUSTOMER-NAME-SENSITIVE" } }, ctx));
      server.setHandler((_r, res) => json(res, 200, { id: "1", status: "ok", pan: "5500000000000004", kycDoc: "DOC-CONTENT" }));
      await client().execute(getItem, { params: { id: "1" } }, ctx);

      const dump = JSON.stringify(logCalls);
      for (const needle of [TEST_TOKEN, "Bearer", "authorization", "4111111111111111", "5500000000000004", "123456", "jane@example.com", "CUSTOMER-NAME-SENSITIVE", "DOC-CONTENT"]) {
        expect(dump, needle).not.toContain(needle);
      }
    });
  });

  describe("request construction (SSRF)", () => {
    it("encodes path parameters as single segments — no query/fragment/host injection", async () => {
      await client().execute(getItem, { params: { id: "a b?x=1#frag&y" } }, ctx);
      expect(server.requests[0]!.url).toBe("/items/a%20b%3Fx%3D1%23frag%26y?expand=yes");
    });

    it("rejects traversal smuggled through a path parameter (even percent-encoded)", async () => {
      const e = (await catchErr(client().execute(getItem, { params: { id: "../../admin" } }, ctx))) as { category: string };
      expect(e.category).toBe("invalid_request");
      expect(server.requests).toHaveLength(0);
    });

    it("pathSegment rejects empty and dot segments", () => {
      expect(() => pathSegment("")).toThrow();
      expect(() => pathSegment("..")).toThrow();
      expect(() => pathSegment(".")).toThrow();
    });

    it("refuses an operation whose path builder returns an absolute URL or protocol-relative path", async () => {
      for (const bad of ["http://evil.example/x", "//evil.example/x", "/ok/../x", "/a?b=1"]) {
        const op = defineOperation({
          name: "test.evil",
          host: "main",
          method: "GET",
          kind: "read",
          idempotency: "none",
          path: () => bad,
          responseSchema: z.unknown(),
        });
        const e = (await catchErr(client().execute(op, {}, ctx))) as { category: string };
        expect(e.category, bad).toBe("invalid_request");
      }
      expect(server.requests).toHaveLength(0);
    });

    it("defineOperation rejects inconsistent definitions", () => {
      const base = { host: "main", path: () => "/x", responseSchema: z.unknown() } as const;
      expect(() => defineOperation({ ...base, name: "bad", method: "GET", kind: "read", idempotency: "none" })).toThrow();
      expect(() => defineOperation({ ...base, name: "a.b", method: "GET", kind: "read", idempotency: "natural" })).toThrow();
      expect(() => defineOperation({ ...base, name: "a.b", method: "DELETE", kind: "read", idempotency: "none" })).toThrow();
      expect(() => defineOperation({ ...base, name: "a.b", method: "GET", kind: "write", idempotency: "none" })).toThrow();
    });
  });
});
