import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("../src/infrastructure/database/pool.js", () => ({
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), on: vi.fn() },
}));
vi.mock("../src/infrastructure/redis/client.js", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  redis: { on: vi.fn(), connect: vi.fn(), ping: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));
vi.mock("../src/repositories/user.repository.js", () => import("./fakes/user.repository.fake.js"));

const logCalls: Array<{ level: string; message: string; context: Record<string, unknown> }> = [];
vi.mock("../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logWithContext: (level: string, message: string, context: Record<string, unknown> = {}) => {
    logCalls.push({ level, message, context });
  },
}));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");
const { resetTranscorpConfigCache } = await import("../src/integrations/transcorp/config.js");
const { TranscorpClient } = await import("../src/integrations/transcorp/client.js");
const { defineOperation, pathSegment } = await import("../src/integrations/transcorp/operations/types.js");
const { registerKycAdapter } = await import("../src/integrations/transcorp/kyc/registry.js");
const { buildConfig, json, startMockServer, TEST_TOKEN } = await import("./helpers/transcorp.js");
type MockServer = Awaited<ReturnType<typeof startMockServer>>;

const PASSWORD = "correct-horse-battery-staple-1";
const PROVIDER_REF = "PROV-REF-0001";

/**
 * ───────────────────────── TEST FIXTURES ONLY ─────────────────────────
 * The real Transcorp KYC contract is unverified. The operation, response
 * shape and adapter below are invented purely to exercise the BAFT module
 * end to end through the real TranscorpClient against a local mock server.
 * They are NOT Transcorp's API and must never be registered in production.
 */
const FIXTURE_ENV_KEYS = ["TRANSCORP_ENABLED", "TRANSCORP_AUTH_MODE", "TRANSCORP_BASE_URL", "TRANSCORP_AUTH_TOKEN", "TRANSCORP_TIMEOUT_MS", "TRANSCORP_TOTAL_TIMEOUT_MS", "TRANSCORP_RETRY_BASE_DELAY_MS", "TRANSCORP_RETRY_MAX_DELAY_MS"];
const fixtureOperation = defineOperation({
  name: "fixture.kycLookup",
  host: "main",
  method: "GET",
  kind: "read",
  idempotency: "none",
  path: (p: { ref: string }) => `/fixture-kyc/${pathSegment(p.ref)}`,
  responseSchema: z.object({
    state: z.string(),
    at: z.string().optional(),
    maskedRef: z.string().optional(),
  }),
});

describe("KYC lookup (read-only, provider-backed)", () => {
  const app = createApp();
  let server: MockServer;
  let roles: ReturnType<typeof seedRbacFixtures>;

  const login = async (email: string) => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return agent;
  };
  const addAdmin = async (email: string, roleId: string) => {
    const a = await createAdminUser({ email, passwordHash: await hashPassword(PASSWORD), fullName: email });
    await assignRoleToAdmin(a.id, roleId);
    return a;
  };
  const wireFixtureAdapter = (extraEnv: Record<string, string> = {}) => {
    for (const k of FIXTURE_ENV_KEYS) delete process.env[k];
    Object.assign(process.env, {
      TRANSCORP_ENABLED: "true",
      TRANSCORP_AUTH_MODE: "bearer",
      TRANSCORP_BASE_URL: server.url,
      TRANSCORP_AUTH_TOKEN: TEST_TOKEN,
      TRANSCORP_TIMEOUT_MS: "200",
      TRANSCORP_TOTAL_TIMEOUT_MS: "1000",
      TRANSCORP_RETRY_BASE_DELAY_MS: "1",
      TRANSCORP_RETRY_MAX_DELAY_MS: "5",
      ...extraEnv,
    });
    resetTranscorpConfigCache();
    const client = new TranscorpClient({ config: buildConfig(server.url, extraEnv), sleep: async () => undefined });
    registerKycAdapter({
      lookup: async (providerRef, ctx) => {
        const r = await client.execute(fixtureOperation, { params: { ref: providerRef } }, ctx);
        return {
          status: r.state === "OK" ? "verified" : "unknown",
          verifiedAt: r.at,
          verificationReference: r.maskedRef,
        };
      },
    });
  };

  let linkedUserId: string;
  let unlinkedUserId: string;

  beforeAll(async () => {
    server = await startMockServer();
  });
  afterAll(async () => {
    await server.close();
    for (const k of FIXTURE_ENV_KEYS) delete process.env[k];
    resetTranscorpConfigCache();
    registerKycAdapter(undefined);
  });
  beforeEach(async () => {
    resetStore();
    roles = seedRbacFixtures();
    logCalls.length = 0;
    server.requests.length = 0;
    server.setHandler((_r, res) =>
      json(res, 200, {
        state: "OK",
        at: "2026-01-05T10:00:00.000Z",
        maskedRef: "XXXX1234",
        // Sensitive extras the provider might send — must never reach the DTO.
        aadhaar: "123456789012",
        pan: "ABCDE1234F",
        documentImage: "BASE64-IMAGE-DATA",
        otp: "998877",
      }),
    );
    wireFixtureAdapter();
    linkedUserId = (await createUser({ email: "linked@customer.test", fullName: "Linked", externalRef: PROVIDER_REF })).id;
    unlinkedUserId = (await createUser({ email: "unlinked@customer.test", fullName: "Unlinked" })).id;
    await addAdmin("support@baft.test", roles.supportAdmin.id);
    await addAdmin("risk@baft.test", roles.riskFraudAdmin.id);
    await addAdmin("super@baft.test", roles.superAdmin.id);
  });

  const get = async (email: string, userId: string, query = "") => (await login(email)).get(`/api/v1/kyc/${userId}${query}`);

  describe("access control", () => {
    it("401 when unauthenticated", async () => {
      expect((await request(app).get(`/api/v1/kyc/${linkedUserId}`)).status).toBe(401);
      expect(server.requests).toHaveLength(0);
    });

    it("403 for roles without kyc.read — including those holding users.read / audit / system permissions", async () => {
      for (const [email, role] of [
        ["ops@baft.test", roles.operationsAdmin],
        ["sec@baft.test", roles.securityAdmin],
        ["aud@baft.test", roles.auditor],
        ["pg@baft.test", roles.productGrowthAdmin],
        ["eng@baft.test", roles.engineeringAdmin],
      ] as const) {
        await addAdmin(email, role.id);
        const res = await get(email, linkedUserId);
        expect(res.status, email).toBe(403);
        expect(res.body.data).toBeUndefined();
      }
      expect(server.requests).toHaveLength(0);
    });

    it("kyc.read is independent: users.read alone does not grant it, kyc.read alone does not grant users.read", async () => {
      const { createRole, setRolePermissions } = await import("../src/repositories/rbac.repository.js");
      const kycOnly = await createRole({ name: "KYC only", description: "" });
      const perm = db.permissions.find((p) => p.key === "kyc.read")!;
      await setRolePermissions(kycOnly.id, [perm.id]);
      await addAdmin("kyconly@baft.test", kycOnly.id);
      const agent = await login("kyconly@baft.test");
      expect((await agent.get(`/api/v1/kyc/${linkedUserId}`)).status).toBe(200);
      expect((await agent.get(`/api/v1/users/${linkedUserId}`)).status).toBe(403);
    });

    it("seeded mapping: Super Admin, Support Admin and Risk/Fraud Admin only", () => {
      const kyc = db.permissions.find((p) => p.key === "kyc.read")!;
      const holders = db.roles.filter((r) => db.rolePermissions.some((rp) => rp.role_id === r.id && rp.permission_id === kyc.id)).map((r) => r.name).sort();
      expect(holders).toEqual(["Risk/Fraud Admin", "Super Admin", "Support Admin"]);
    });
  });

  describe("lookup", () => {
    it("returns an admin-safe DTO for a linked user, resolving the provider ref server-side", async () => {
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.data).toEqual({
        source: "transcorp",
        state: "available",
        kyc: { status: "verified", verifiedAt: "2026-01-05T10:00:00.000Z", verificationReference: "XXXX1234" },
      });
      expect(server.requests[0]!.url).toBe(`/fixture-kyc/${PROVIDER_REF}`);
    });

    it("never returns raw provider payload, sensitive identity fields, or the provider reference", async () => {
      const res = await get("support@baft.test", linkedUserId);
      const dump = JSON.stringify(res.body);
      for (const leaked of ["123456789012", "ABCDE1234F", "BASE64-IMAGE-DATA", "998877", "aadhaar", "documentImage", PROVIDER_REF, TEST_TOKEN]) {
        expect(dump, leaked).not.toContain(leaked);
      }
    });

    it("drops fields outside the DTO allow-list even if an adapter returns them", async () => {
      registerKycAdapter({
        lookup: async () =>
          ({ status: "verified", panNumber: "ABCDE1234F", documentImage: "IMG", verificationReference: "X1" }) as never,
      });
      const res = await get("support@baft.test", linkedUserId);
      expect(res.body.data.kyc).toEqual({ status: "verified", verificationReference: "X1" });
    });

    it("an adapter result outside the schema (bad status / oversized strings) becomes a controlled 502", async () => {
      registerKycAdapter({ lookup: async () => ({ status: "weird" }) as never });
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("PROVIDER_BAD_RESPONSE");
    });

    it("404 USER_NOT_FOUND for an unknown BAFT user; 400 for a non-uuid", async () => {
      const res = await get("support@baft.test", "00000000-0000-4000-8000-000000000000");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
      expect((await get("support@baft.test", "not-a-uuid")).status).toBe(400);
      expect(server.requests).toHaveLength(0);
    });

    it("empty state (200, not an error) when the user has no provider relationship — provider is not called", async () => {
      const res = await get("support@baft.test", unlinkedUserId);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ source: "transcorp", state: "no_provider_relationship", kyc: null });
      expect(server.requests).toHaveLength(0);
    });

    it("empty state when the provider has no record (404 from provider)", async () => {
      server.setHandler((_r, res) => json(res, 404, { message: "no such customer 9876543210" }));
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ source: "transcorp", state: "not_found", kyc: null });
    });

    it("'not_configured' state when the integration is disabled; 'unverified' when no KYC adapter is wired", async () => {
      process.env.TRANSCORP_ENABLED = "false";
      resetTranscorpConfigCache();
      expect((await get("support@baft.test", linkedUserId)).body.data.state).toBe("not_configured");

      wireFixtureAdapter();
      registerKycAdapter(undefined);
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ source: "transcorp", state: "unverified", kyc: null });
    });
  });

  describe("provider failures map to safe errors", () => {
    const cases: Array<[string, (res: Parameters<typeof json>[0]) => void, number, string]> = [
      ["5xx", (res) => json(res, 500, { stack: "TypeError at /srv/provider.js", secret: "S" }), 502, "PROVIDER_ERROR"],
      ["503", (res) => json(res, 503, {}), 502, "PROVIDER_ERROR"],
      ["auth failure", (res) => json(res, 401, { error: "bad token" }), 502, "PROVIDER_AUTH_FAILED"],
      ["rate limit", (res) => json(res, 429, {}, { "retry-after": "999" }), 429, "PROVIDER_RATE_LIMITED"],
      ["malformed JSON", (res) => res.writeHead(200, { "content-type": "application/json" }).end("{nope"), 502, "PROVIDER_BAD_RESPONSE"],
      ["schema mismatch", (res) => json(res, 200, { unexpected: true }), 502, "PROVIDER_BAD_RESPONSE"],
    ];
    it.each(cases)("%s", async (_name, handler, status, code) => {
      server.setHandler((_r, res) => handler(res));
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      const dump = JSON.stringify(res.body);
      expect(dump).not.toMatch(/stack|TypeError|provider\.js|bad token|Bearer|127\.0\.0\.1|fixture-kyc/);
    });

    it("timeout → 504 PROVIDER_TIMEOUT", async () => {
      server.setHandler(() => undefined);
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(504);
      expect(res.body.error.code).toBe("PROVIDER_TIMEOUT");
    });

    it("unreachable → 502 PROVIDER_UNAVAILABLE", async () => {
      const dead = await startMockServer();
      const url = dead.url;
      await dead.close();
      const client = new TranscorpClient({ config: buildConfig(url, { TRANSCORP_MAX_ATTEMPTS: "1" }), sleep: async () => undefined });
      registerKycAdapter({
        lookup: async (ref, ctx) => {
          await client.execute(fixtureOperation, { params: { ref } }, ctx);
          return { status: "verified" };
        },
      });
      const res = await get("support@baft.test", linkedUserId);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("PROVIDER_UNAVAILABLE");
    });
  });

  describe("IDOR / arbitrary provider lookup", () => {
    it("ignores any caller-supplied provider reference (query, header)", async () => {
      const agent = await login("support@baft.test");
      await agent.get(`/api/v1/kyc/${linkedUserId}?providerRef=EVIL&ref=EVIL&externalRef=EVIL`).set("x-provider-ref", "EVIL");
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]!.url).toBe(`/fixture-kyc/${PROVIDER_REF}`);
    });

    it("the provider reference is not an accepted lookup key — only a BAFT user uuid resolves", async () => {
      expect((await get("support@baft.test", PROVIDER_REF)).status).toBe(400);
      expect(server.requests).toHaveLength(0);
    });

    it("each user resolves to its own provider ref (no cross-user bleed)", async () => {
      const other = await createUser({ email: "other@customer.test", fullName: "Other", externalRef: "PROV-REF-0002" });
      await get("support@baft.test", linkedUserId);
      await get("support@baft.test", other.id);
      expect(server.requests.map((r) => r.url)).toEqual(["/fixture-kyc/PROV-REF-0001", "/fixture-kyc/PROV-REF-0002"]);
    });

    it("only GET exists — no KYC mutation routes", async () => {
      const agent = await login("super@baft.test");
      for (const method of ["post", "put", "patch", "delete"] as const) {
        const res = await agent[method](`/api/v1/kyc/${linkedUserId}`).send({ status: "verified" });
        expect(res.status, method).toBe(404);
      }
    });
  });

  describe("audit", () => {
    const kycAudits = () => db.auditLogs.filter((l) => l.action === "KYC_VIEWED");

    it("records KYC_VIEWED with minimal metadata for each outcome", async () => {
      await get("support@baft.test", linkedUserId);
      await get("support@baft.test", unlinkedUserId);
      server.setHandler((_r, res) => json(res, 500, {}));
      await get("support@baft.test", linkedUserId);

      expect(kycAudits().map((l) => (l.metadata as { outcome: string }).outcome)).toEqual(["available", "no_provider_relationship", "provider_5xx"]);
      const first = kycAudits()[0]!;
      expect(first.target_type).toBe("user");
      expect(first.target_id).toBe(linkedUserId);
      expect(first.metadata).toEqual({ operation: "kyc.lookup", provider: "transcorp", outcome: "available" });
      expect(first.request_id).toBeTruthy();
      expect(first.correlation_id).toBeTruthy();
    });

    it("audit rows never contain KYC data, identity numbers, the provider ref or credentials", async () => {
      await get("support@baft.test", linkedUserId);
      const dump = JSON.stringify(db.auditLogs);
      for (const leaked of ["verified\"", "XXXX1234", "123456789012", "ABCDE1234F", "998877", PROVIDER_REF, TEST_TOKEN, "2026-01-05"]) {
        expect(dump, leaked).not.toContain(leaked);
      }
    });

    it("denied and unknown-user requests do not create KYC_VIEWED rows", async () => {
      await addAdmin("ops@baft.test", roles.operationsAdmin.id);
      await get("ops@baft.test", linkedUserId);
      await get("support@baft.test", "00000000-0000-4000-8000-000000000000");
      expect(kycAudits()).toHaveLength(0);
    });
  });

  describe("logging and persistence", () => {
    it("never logs KYC payloads, identity values, provider ref contents or credentials", async () => {
      await get("support@baft.test", linkedUserId);
      server.setHandler((_r, res) => json(res, 400, { code: "BAD", message: "aadhaar 123456789012 otp 998877" }));
      await get("support@baft.test", linkedUserId);
      const dump = JSON.stringify(logCalls);
      for (const leaked of ["123456789012", "ABCDE1234F", "BASE64-IMAGE-DATA", "998877", TEST_TOKEN, "Bearer", "XXXX1234"]) {
        expect(dump, leaked).not.toContain(leaked);
      }
    });

    it("persists no KYC data: users rows are untouched and no KYC-shaped store exists", async () => {
      const before = JSON.stringify(db.users);
      await get("support@baft.test", linkedUserId);
      expect(JSON.stringify(db.users)).toBe(before);
      expect(Object.keys(db).filter((k) => /kyc|document|identity/i.test(k))).toEqual([]);
    });
  });
});
