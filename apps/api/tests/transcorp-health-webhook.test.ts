import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");
const { resetTranscorpConfigCache, loadTranscorpConfig } = await import("../src/integrations/transcorp/config.js");
const { resetTranscorpClient, TranscorpClient } = await import("../src/integrations/transcorp/client.js");
const { getTranscorpHealth, resetTranscorpHealthCache } = await import("../src/integrations/transcorp/health.service.js");
const { setReplayStoreForTesting } = await import("../src/controllers/transcorpIntegration.controller.js");
const { InMemoryReplayStore, registerWebhookHandler, clearWebhookHandlers } = await import(
  "../src/integrations/transcorp/webhook/gateway.js"
);
const { buildConfig, json, startMockServer, TEST_TOKEN } = await import("./helpers/transcorp.js");
type MockServer = Awaited<ReturnType<typeof startMockServer>>;

const PASSWORD = "correct-horse-battery-staple-1";
const WEBHOOK_TOKEN = "whk-SECRET-token-123";
const ENV_KEYS = [
  "TRANSCORP_ENABLED", "TRANSCORP_AUTH_MODE", "TRANSCORP_BASE_URL", "TRANSCORP_AUTH_TOKEN", "TRANSCORP_HEALTH_PATH",
  "TRANSCORP_WEBHOOK_TOKEN", "TRANSCORP_WEBHOOK_AUTH_HEADER", "TRANSCORP_WEBHOOK_EVENT_ID_HEADER",
  "TRANSCORP_WEBHOOK_EVENT_TYPE_FIELD", "TRANSCORP_TIMEOUT_MS", "TRANSCORP_TOTAL_TIMEOUT_MS",
];

const setEnv = (values: Record<string, string>) => {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
  resetTranscorpConfigCache();
  resetTranscorpClient();
  resetTranscorpHealthCache();
};

describe("Transcorp provider health", () => {
  let server: MockServer;
  beforeAll(async () => {
    server = await startMockServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(() => {
    server.requests.length = 0;
    server.setHandler((_r, res) => json(res, 200, { status: "UP" }));
    resetTranscorpHealthCache();
  });

  const configResult = (overrides: Record<string, string | undefined> = {}) => ({
    status: "ready" as const,
    config: buildConfig(server.url, { TRANSCORP_HEALTH_PATH: "/ping", ...overrides }),
  });
  const run = (result: ReturnType<typeof configResult> | ReturnType<typeof loadTranscorpConfig>) => {
    const client = result.status === "ready" ? new TranscorpClient({ config: result.config, sleep: async () => undefined }) : undefined;
    return getTranscorpHealth({ requestId: "r", correlationId: "c" }, { getConfigResult: () => result, getClient: () => client! }, { force: true });
  };

  it("healthy when the provider answers 2xx with a well-formed body", async () => {
    const report = await run(configResult());
    expect(report.status).toBe("healthy");
    expect(report.latencyMs).toBeTypeOf("number");
    expect(server.requests[0]!.url).toBe("/ping");
    expect(server.requests[0]!.headers["x-correlation-id"]).toBe("c");
  });

  it("unhealthy (timeout) when the provider hangs", async () => {
    server.setHandler(() => undefined);
    const report = await run(configResult({ TRANSCORP_TIMEOUT_MS: "100" }));
    expect(report.status).toBe("unhealthy");
    expect(report.failureCategory).toBe("timeout");
    expect(server.requests).toHaveLength(1); // probes never retry
  });

  it("unhealthy (provider_5xx) when the provider is down", async () => {
    server.setHandler((_r, res) => json(res, 503, {}));
    expect((await run(configResult())).failureCategory).toBe("provider_5xx");
  });

  it("unhealthy (authentication) when credentials are rejected", async () => {
    server.setHandler((_r, res) => json(res, 401, {}));
    expect((await run(configResult())).failureCategory).toBe("authentication");
  });

  it("unhealthy (network) when the host is unreachable", async () => {
    const dead = await startMockServer();
    const url = dead.url;
    await dead.close();
    const result = { status: "ready" as const, config: buildConfig(url, { TRANSCORP_HEALTH_PATH: "/ping" }) };
    expect((await run(result)).failureCategory).toBe("network");
  });

  it("unhealthy (malformed_response) on a corrupt JSON body", async () => {
    server.setHandler((_r, res) => res.writeHead(200, { "content-type": "application/json" }).end("{oops"));
    expect((await run(configResult())).failureCategory).toBe("malformed_response");
  });

  it("misconfigured when config is invalid — reports names, never secret values", async () => {
    const result = loadTranscorpConfig(
      { TRANSCORP_ENABLED: "true", TRANSCORP_AUTH_MODE: "bearer", TRANSCORP_BASE_URL: "https://x.example", TRANSCORP_AUTH_TOKEN: "" },
      "test",
    );
    const report = await run(result);
    expect(report.status).toBe("misconfigured");
    expect(report.configErrors).toContain("TRANSCORP_AUTH_TOKEN is required for TRANSCORP_AUTH_MODE=bearer");
  });

  it("disabled when the integration is off", async () => {
    expect((await run(loadTranscorpConfig({}, "test"))).status).toBe("disabled");
  });

  it("unverified when valid but no probe endpoint is configured (TBD with Transcorp)", async () => {
    const report = await run({ status: "ready", config: buildConfig(server.url) });
    expect(report.status).toBe("unverified");
    expect(server.requests).toHaveLength(0);
  });

  it("caches results briefly and shares concurrent probes (cannot be used to hammer the provider)", async () => {
    const result = configResult();
    const client = new TranscorpClient({ config: result.config });
    const deps = { getConfigResult: () => result, getClient: () => client };
    await Promise.all([getTranscorpHealth({}, deps), getTranscorpHealth({}, deps), getTranscorpHealth({}, deps)]);
    await getTranscorpHealth({}, deps);
    expect(server.requests).toHaveLength(1);
  });

  it("never contains credential values", async () => {
    const dump = JSON.stringify(await run(configResult()));
    expect(dump).not.toContain(TEST_TOKEN);
  });
});

describe("Transcorp routes (health endpoint, webhook boundary, RBAC)", () => {
  const app = createApp();
  let server: MockServer;

  const login = async (email: string) => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return agent;
  };
  const addAdmin = async (email: string, roleId: string) => {
    const a = await createAdminUser({ email, passwordHash: await hashPassword(PASSWORD), fullName: email });
    await assignRoleToAdmin(a.id, roleId);
  };

  const enableTranscorp = (extra: Record<string, string> = {}) =>
    setEnv({
      TRANSCORP_ENABLED: "true",
      TRANSCORP_AUTH_MODE: "bearer",
      TRANSCORP_BASE_URL: server.url,
      TRANSCORP_AUTH_TOKEN: TEST_TOKEN,
      TRANSCORP_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
      TRANSCORP_WEBHOOK_AUTH_HEADER: "X-Hook-Token",
      TRANSCORP_WEBHOOK_EVENT_ID_HEADER: "X-Event-Id",
      TRANSCORP_WEBHOOK_EVENT_TYPE_FIELD: "event.type",
      TRANSCORP_TIMEOUT_MS: "200",
      TRANSCORP_TOTAL_TIMEOUT_MS: "1000",
      ...extra,
    });

  beforeAll(async () => {
    server = await startMockServer();
  });
  afterAll(async () => {
    await server.close();
    setEnv({});
  });

  let roles: ReturnType<typeof seedRbacFixtures>;
  beforeEach(async () => {
    resetStore();
    roles = seedRbacFixtures();
    logCalls.length = 0;
    server.requests.length = 0;
    server.setHandler((_r, res) => json(res, 200, { ok: true }));
    setReplayStoreForTesting(new InMemoryReplayStore());
    clearWebhookHandlers();
    enableTranscorp({ TRANSCORP_HEALTH_PATH: "/ping" });
  });

  describe("GET /system/integrations/transcorp/health", () => {
    it("requires authentication", async () => {
      expect((await request(app).get("/api/v1/system/integrations/transcorp/health")).status).toBe(401);
    });

    it("is forbidden without system.integrations.read — having other admin permissions is not enough", async () => {
      await addAdmin("support@baft.test", roles.supportAdmin.id);
      await addAdmin("security@baft.test", roles.securityAdmin.id);
      for (const email of ["support@baft.test", "security@baft.test"]) {
        const res = await (await login(email)).get("/api/v1/system/integrations/transcorp/health");
        expect(res.status, email).toBe(403);
      }
      expect(server.requests).toHaveLength(0);
    });

    it("is available to Super Admin and Engineering Admin, and returns provider status without credentials", async () => {
      await addAdmin("super@baft.test", roles.superAdmin.id);
      await addAdmin("eng@baft.test", roles.engineeringAdmin.id);
      for (const email of ["super@baft.test", "eng@baft.test"]) {
        resetTranscorpHealthCache();
        const res = await (await login(email)).get("/api/v1/system/integrations/transcorp/health");
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("healthy");
        expect(res.body.data.settings.hosts.main).toBe(server.url);
        const dump = JSON.stringify(res.body);
        expect(dump).not.toContain(TEST_TOKEN);
        expect(dump).not.toContain(WEBHOOK_TOKEN);
      }
    });

    it("returns 200 with status 'unhealthy' during a provider outage (BAFT itself is fine)", async () => {
      await addAdmin("super@baft.test", roles.superAdmin.id);
      server.setHandler((_r, res) => json(res, 503, {}));
      const res = await (await login("super@baft.test")).get("/api/v1/system/integrations/transcorp/health");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("unhealthy");
      expect(res.body.data.failureCategory).toBe("provider_5xx");
    });
  });

  describe("provider outage / misconfiguration isolation", () => {
    it("liveness and readiness stay green with Transcorp down or misconfigured", async () => {
      server.setHandler((_r, res) => json(res, 503, {}));
      expect((await request(app).get("/api/v1/health/ready")).status).toBe(200);
      setEnv({ TRANSCORP_ENABLED: "true", TRANSCORP_AUTH_MODE: "bearer" }); // invalid
      expect((await request(app).get("/api/v1/health/ready")).status).toBe(200);
      expect((await request(app).get("/api/v1/health/live")).status).toBe(200);
      expect(server.requests).toHaveLength(0);
    });

    it("unrelated authenticated endpoints keep working while Transcorp is misconfigured", async () => {
      await addAdmin("super@baft.test", roles.superAdmin.id);
      setEnv({ TRANSCORP_ENABLED: "true" });
      const res = await (await login("super@baft.test")).get("/api/v1/roles");
      expect(res.status).toBe(200);
    });
  });

  describe("webhook boundary", () => {
    const post = (headers: Record<string, string> = {}, body: unknown = { event: { type: "x.y" }, amount: 1 }) =>
      request(app)
        .post("/api/v1/integrations/transcorp/webhooks")
        .set({ "content-type": "application/json", ...headers })
        .send(typeof body === "string" ? body : JSON.stringify(body));
    const authed = (extra: Record<string, string> = {}) => ({ "x-hook-token": WEBHOOK_TOKEN, ...extra });

    it("503 WEBHOOK_NOT_CONFIGURED when the integration or token is not configured (fail closed)", async () => {
      setEnv({});
      const res = await post(authed());
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("WEBHOOK_NOT_CONFIGURED");

      enableTranscorp();
      delete process.env.TRANSCORP_WEBHOOK_TOKEN;
      delete process.env.TRANSCORP_WEBHOOK_AUTH_HEADER;
      resetTranscorpConfigCache();
      expect((await post(authed())).status).toBe(503);
    });

    it("401 when the token is missing, wrong, or sent in the wrong header — payload is never inspected", async () => {
      for (const headers of [{}, { "x-hook-token": "nope" }, { "x-other": WEBHOOK_TOKEN }, { "x-hook-token": WEBHOOK_TOKEN + "x" }]) {
        const res = await post(headers);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("WEBHOOK_UNAUTHORIZED");
      }
    });

    it("400 on malformed JSON or non-object bodies (after authentication)", async () => {
      expect((await post(authed(), "{not json")).status).toBe(400);
      expect((await post(authed(), [1, 2])).status).toBe(400);
      expect((await post(authed(), "")).status).toBe(400);
      expect((await post(authed({ "x-event-id": "bad id with spaces!" }))).status).toBe(400);
    });

    it("202 acknowledges a valid event without echoing the payload or persisting it", async () => {
      const res = await post(authed({ "x-event-id": "evt-1" }), { event: { type: "unknown.type" }, pan: "4111111111111111" });
      expect(res.status).toBe(202);
      expect(res.body.data).toEqual({ status: "accepted" });
      expect(JSON.stringify(res.body)).not.toContain("4111");
      expect(JSON.stringify(logCalls)).not.toMatch(/4111|WEBHOOK_TOKEN|whk-SECRET/);
    });

    it("replay: the same event id is acknowledged but not re-dispatched", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerWebhookHandler("a.b", handler);
      const body = { event: { type: "a.b" } };
      expect((await post(authed({ "x-event-id": "evt-9" }), body)).status).toBe(202);
      const dup = await post(authed({ "x-event-id": "evt-9" }), body);
      expect(dup.status).toBe(200);
      expect(dup.body.data.status).toBe("duplicate_ignored");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("replay without an event-id header falls back to a canonical body hash (key order irrelevant)", async () => {
      expect((await post(authed(), { a: 1, b: 2 })).status).toBe(202);
      expect((await post(authed(), { b: 2, a: 1 })).body.data.status).toBe("duplicate_ignored");
      expect((await post(authed(), { a: 1, b: 3 })).status).toBe(202);
    });

    it("a failing handler releases the claim so the provider's retry is processed, and returns 503", async () => {
      const handler = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
      registerWebhookHandler("a.b", handler);
      const body = { event: { type: "a.b" } };
      const first = await post(authed({ "x-event-id": "evt-2" }), body);
      expect(first.status).toBe(503);
      expect(first.body.error.message).not.toMatch(/boom/);
      expect((await post(authed({ "x-event-id": "evt-2" }), body)).status).toBe(202);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("fails closed (503, no processing) when the replay store is unavailable", async () => {
      const handler = vi.fn();
      registerWebhookHandler("a.b", handler);
      setReplayStoreForTesting({
        claim: async () => {
          throw new Error("redis down");
        },
        release: async () => undefined,
      });
      const res = await post(authed({ "x-event-id": "evt-3" }), { event: { type: "a.b" } });
      expect(res.status).toBe(503);
      expect(handler).not.toHaveBeenCalled();
    });

    it("propagates correlation ids into webhook logs", async () => {
      await post(authed({ "x-correlation-id": "hook-corr-1" }));
      const line = logCalls.find((l) => l.message === "transcorp_webhook");
      expect(line?.context.correlationId).toBe("hook-corr-1");
    });
  });
});
