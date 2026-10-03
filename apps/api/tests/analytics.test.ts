import { readFileSync, readdirSync } from "node:fs";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The analytics SQL runs against a REAL Postgres engine (PGlite, in-process) with the project's real
 * migrations applied — not a fake — so aggregation, bucketing and boundary behaviour are verified.
 * Auth/RBAC use the usual in-memory fakes. All rows below are TEST FIXTURES.
 */
const h = vi.hoisted(() => ({ sql: [] as string[], pg: null as null | import("@electric-sql/pglite").PGlite }));

vi.mock("../src/infrastructure/database/pool.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  h.pg = pg;
  const dir = new URL("../src/infrastructure/database/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) {
    try {
      await pg.exec(readFileSync(new URL(f, dir), "utf8"));
    } catch {
      /* only the pgcrypto / pg_trgm extension files are unsupported by PGlite; neither is needed */
    }
  }
  return {
    checkDatabaseHealth: vi.fn().mockResolvedValue(true),
    pool: {
      on: vi.fn(),
      query: async (text: string, values?: unknown[]) => {
        h.sql.push(text);
        const r = await pg.query(text, values as unknown[]);
        return { rows: r.rows };
      },
    },
  };
});
vi.mock("../src/infrastructure/redis/client.js", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  redis: { on: vi.fn(), connect: vi.fn(), ping: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin, createRole, setRolePermissions } = await import("../src/repositories/rbac.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");
const { resolveRange } = await import("../src/utils/dateRange.js");

const PASSWORD = "correct-horse-battery-staple-1";
const NOW = new Date("2026-06-15T12:00:00.000Z");
const SECTIONS = ["overview", "onboarding", "features", "retention", "usage", "rewards", "financial"] as const;

const pg = () => h.pg!;
let adminRowId: string;
const insertUser = async (email: string, createdAt: string, status = "active", extra: { phone?: string; ext?: string } = {}) => {
  const r = await pg().query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, created_at, phone_number, external_ref) VALUES ($1,$1,$2,$3,$4,$5) RETURNING id`,
    [email, status, createdAt, extra.phone ?? null, extra.ext ?? null],
  );
  return r.rows[0]!.id;
};
let deviceSeq = 0;
const insertDevice = async (userId: string, firstSeen: string, platform = "ios", status = "active") => {
  await pg().query(
    `INSERT INTO devices (user_id, device_ref, platform, status, first_seen_at, last_seen_at) VALUES ($1,$2,$3,$4,$5,$5)`,
    [userId, `dev-${++deviceSeq}`, platform, status, firstSeen],
  );
};
const insertSupport = async (createdAt: string, status = "open") => {
  const u = await insertUser(`s${++deviceSeq}@x.test`, "2026-01-01T00:00:00Z");
  await pg().query(
    `INSERT INTO support_cases (user_id, category, subject, description, status, created_at)
     VALUES ($1,'other','s','d',$2,$3)`,
    [u, status, createdAt],
  );
};
const insertReward = (name: string, type: string, status: string, createdAt: string) =>
  pg().query(`INSERT INTO rewards (name, reward_type, status, created_at, created_by) VALUES ($1,$2,$3,$4,$5)`, [name, type, status, createdAt, adminRowId]);
const insertCampaign = (name: string, type: string, status: string, createdAt: string) =>
  pg().query(`INSERT INTO campaigns (name, campaign_type, status, created_at, created_by) VALUES ($1,$2,$3,$4,$5)`, [name, type, status, createdAt, adminRowId]);

describe("Analytics", () => {
  const app = createApp();
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
  const get = async (email: string, section: string, query = "") => (await login(email)).get(`/api/v1/analytics/${section}${query}`);
  const metric = (body: { metrics: Array<{ key: string; value: number | null }> }, key: string) => body.metrics.find((m) => m.key === key);

  beforeAll(async () => {
    adminRowId = (
      await pg().query<{ id: string }>(`INSERT INTO admin_users (email, password_hash, full_name) VALUES ('seed@x.test','x','Seed') RETURNING id`)
    ).rows[0]!.id;
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    resetStore();
    roles = seedRbacFixtures();
    h.sql.length = 0;
    await pg().exec(
      `TRUNCATE devices, support_cases, rewards, campaigns RESTART IDENTITY CASCADE; DELETE FROM users;`,
    );
    await addAdmin("super@baft.test", roles.superAdmin.id);
    await addAdmin("growth@baft.test", roles.productGrowthAdmin.id);
    await addAdmin("ops@baft.test", roles.operationsAdmin.id);
    await addAdmin("eng@baft.test", roles.engineeringAdmin.id);
  });
  afterEach(() => vi.useRealTimers());

  // The auth flow signs JWTs with real timers expectations; fake Date only, so login still works.

  describe("access control", () => {
    it("401 for every section when unauthenticated", async () => {
      for (const s of SECTIONS) expect((await request(app).get(`/api/v1/analytics/${s}`)).status, s).toBe(401);
    });

    it("role mapping: each role reaches exactly its sections", async () => {
      const expected: Record<string, string[]> = {
        "super@baft.test": [...SECTIONS],
        "growth@baft.test": ["overview", "onboarding", "features", "retention", "usage", "rewards"],
        "ops@baft.test": ["overview", "onboarding", "rewards"],
        "eng@baft.test": ["usage"],
      };
      for (const [email, allowed] of Object.entries(expected)) {
        for (const s of SECTIONS) {
          const res = await get(email, s);
          expect(res.status, `${email} ${s}`).toBe(allowed.includes(s) ? 200 : 403);
        }
      }
    });

    it("Support, Risk/Fraud, Security and Auditor have no analytics access", async () => {
      for (const [email, role] of [
        ["sup@baft.test", roles.supportAdmin],
        ["risk@baft.test", roles.riskFraudAdmin],
        ["sec@baft.test", roles.securityAdmin],
        ["aud@baft.test", roles.auditor],
      ] as const) {
        await addAdmin(email, role.id);
        for (const s of SECTIONS) expect((await get(email, s)).status, `${email} ${s}`).toBe(403);
      }
    });

    it("permissions are isolated: users.read does not grant analytics; one section does not grant another; financial is separate", async () => {
      const mk = async (name: string, keys: string[]) => {
        const role = await createRole({ name, description: "" });
        await setRolePermissions(role.id, keys.map((k) => db.permissions.find((p) => p.key === k)!.id));
        await addAdmin(`${name}@baft.test`, role.id);
        return `${name}@baft.test`;
      };
      const usersOnly = await mk("usersonly", ["users.read", "rewards.read", "campaigns.read"]);
      expect((await get(usersOnly, "overview")).status).toBe(403);
      expect((await get(usersOnly, "rewards")).status).toBe(403);
      const ovOnly = await mk("ovonly", ["analytics.overview.read"]);
      expect((await get(ovOnly, "overview")).status).toBe(200);
      for (const s of SECTIONS.filter((x) => x !== "overview")) expect((await get(ovOnly, s)).status, s).toBe(403);
      const everythingButFinancial = await mk("nofin", SECTIONS.filter((s) => s !== "financial").map((s) => `analytics.${s}.read`));
      expect((await get(everythingButFinancial, "financial")).status).toBe(403);
    });

    it("analytics permissions grant nothing outside analytics", async () => {
      const agent = await login("growth@baft.test");
      expect((await agent.get("/api/v1/administration/audit")).status).toBe(403);
      expect((await agent.get("/api/v1/security/cases")).status).toBe(403);
    });

    it("is read-only: no write verbs and no export route", async () => {
      const agent = await login("super@baft.test");
      for (const method of ["post", "put", "patch", "delete"] as const) expect((await agent[method]("/api/v1/analytics/overview")).status, method).toBe(404);
      for (const p of ["/api/v1/analytics/export", "/api/v1/analytics/overview/export", "/api/v1/analytics/overview.csv"]) {
        expect((await agent.get(p)).status, p).toBe(404);
      }
    });
  });

  describe("date range handling", () => {
    it.each([
      ["range=bogus", /expected one of/],
      ["range=custom", /requires both/],
      ["range=custom&from=2026-06-01", /requires both/],
      ["range=custom&from=2026-06-10&to=2026-06-01", /not be after/],
      ["range=custom&from=2026-06-01&to=2026-06-16", /future/],
      ["range=custom&from=2026-02-31&to=2026-03-02", /valid calendar date/],
      ["range=custom&from=06/01/2026&to=06/10/2026", /YYYY-MM-DD/],
      ["range=7d&from=2026-06-01&to=2026-06-10", /only allowed with range=custom/],
      ["range=custom&from=2025-06-14&to=2026-06-15", /exceed 366/],
    ])("rejects invalid input: %s", async (query, message) => {
      const res = await get("super@baft.test", "overview", `?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toMatch(message);
    });

    it("rejects unsupported dimensions / columns / unknown parameters instead of ignoring them", async () => {
      for (const q of ["groupBy=email", "dimension=status", "column=email", "table=users", "limit=1000000", "filter=status%3Dactive"]) {
        const res = await get("super@baft.test", "onboarding", `?${q}`);
        expect(res.status, q).toBe(400);
      }
      expect(h.sql).toHaveLength(0);
    });

    it("blocks SQL injection through parameters; tables are untouched", async () => {
      await insertUser("a@x.test", "2026-06-15T01:00:00Z");
      for (const q of [`range=30d'%3B DROP TABLE users%3B--`, `range=custom&from=2026-06-01'%3BDROP TABLE users%3B--&to=2026-06-10`]) {
        expect((await get("super@baft.test", "overview", `?${q}`)).status).toBe(400);
      }
      const r = await pg().query<{ n: number }>("SELECT COUNT(*)::int n FROM users");
      expect(r.rows[0]!.n).toBe(1);
    });

    it("resolves presets inclusive of today, in UTC, with a half-open end", async () => {
      const cases: Array<[string, string, string, number, string]> = [
        ["today", "2026-06-15", "2026-06-15", 1, "day"],
        ["7d", "2026-06-09", "2026-06-15", 7, "day"],
        ["30d", "2026-05-17", "2026-06-15", 30, "day"],
        ["90d", "2026-03-18", "2026-06-15", 90, "week"],
      ];
      for (const [preset, from, to, days, granularity] of cases) {
        const res = await get("super@baft.test", "overview", `?range=${preset}`);
        expect(res.status, preset).toBe(200);
        expect(res.body.data.range).toMatchObject({ preset, from, to, days, granularity, timezone: "UTC", endExclusive: "2026-06-16T00:00:00.000Z" });
      }
    });

    it("defaults to 30d and echoes the range on every section", async () => {
      for (const s of SECTIONS) {
        const res = await get("super@baft.test", s);
        expect(res.body.data.range.preset, s).toBe("30d");
        expect(res.body.data.range.from, s).toBe("2026-05-17");
      }
    });

    it("accepts a custom range, including exactly 366 days and a single day", async () => {
      expect((await get("super@baft.test", "overview", "?range=custom&from=2025-06-15&to=2026-06-15")).body.data.range).toMatchObject({ days: 366, granularity: "month" });
      expect((await get("super@baft.test", "overview", "?range=custom&from=2026-06-10&to=2026-06-10")).body.data.range.days).toBe(1);
    });

    it("resolveRange: leap day, month/year boundaries and UTC anchoring near midnight", () => {
      const r = resolveRange({ range: "custom", from: "2024-02-28", to: "2024-03-01" }, new Date("2026-06-15T00:00:00Z"));
      expect(r.days).toBe(3);
      expect(r.endExclusive.toISOString()).toBe("2024-03-02T00:00:00.000Z");
      // 23:59:59.999Z and 00:00:00.000Z fall on different UTC "today"s.
      expect(resolveRange({ range: "today" }, new Date("2026-06-15T23:59:59.999Z")).from).toBe("2026-06-15");
      expect(resolveRange({ range: "today" }, new Date("2026-06-16T00:00:00.000Z")).from).toBe("2026-06-16");
      expect(resolveRange({ range: "7d" }, new Date("2026-01-03T10:00:00Z")).from).toBe("2025-12-28");
    });
  });

  describe("timezone / boundary correctness (real SQL)", () => {
    it("counts a user at 23:59:59.999Z in that day and 00:00:00.000Z in the next; end is exclusive, start inclusive", async () => {
      await insertUser("before@x.test", "2026-06-14T23:59:59.999Z");
      await insertUser("start@x.test", "2026-06-15T00:00:00.000Z");
      await insertUser("late@x.test", "2026-06-15T23:59:59.999Z");
      await insertUser("next@x.test", "2026-06-16T00:00:00.000Z");
      const today = await get("super@baft.test", "overview", "?range=today");
      expect(metric(today.body.data, "users_new")!.value).toBe(2);
      const bucket = today.body.data.series.find((s: { key: string }) => s.key === "users_new").points;
      expect(bucket).toEqual([{ bucket: "2026-06-15", value: 2 }]);
      const custom = await get("super@baft.test", "overview", "?range=custom&from=2026-06-14&to=2026-06-14");
      expect(metric(custom.body.data, "users_new")!.value).toBe(1);
      // "total users" is cumulative as of the end of the range.
      expect(metric(custom.body.data, "users_total")!.value).toBe(1);
    });

    it("a timestamp with a non-UTC offset is bucketed by its UTC day", async () => {
      await insertUser("offset@x.test", "2026-06-15T01:30:00+05:30"); // = 2026-06-14T20:00:00Z
      const res = await get("super@baft.test", "overview", "?range=custom&from=2026-06-14&to=2026-06-14");
      expect(metric(res.body.data, "users_new")!.value).toBe(1);
    });
  });

  describe("overview aggregation", () => {
    it("computes each KPI from the seeded rows", async () => {
      const u1 = await insertUser("u1@x.test", "2026-06-10T10:00:00Z"); // in 7d
      const u2 = await insertUser("u2@x.test", "2026-06-12T10:00:00Z", "suspended"); // in 7d
      await insertUser("u3@x.test", "2026-01-10T10:00:00Z"); // old
      await insertDevice(u1, "2026-06-10T10:05:00Z");
      await insertDevice(u1, "2026-06-11T10:05:00Z", "android"); // same user: distinct counting
      await insertDevice(u2, "2026-06-12T10:05:00Z");
      await insertReward("r1", "points", "active", "2026-06-11T00:00:00Z");
      await insertReward("r2", "cashback", "paused", "2026-01-11T00:00:00Z");
      await insertCampaign("c1", "promotional", "active", "2026-06-11T00:00:00Z");

      const res = await get("super@baft.test", "overview", "?range=7d");
      const d = res.body.data;
      expect(metric(d, "users_total")!.value).toBe(3);
      expect(metric(d, "users_new")!.value).toBe(2);
      expect(metric(d, "users_active_status")!.value).toBe(2);
      expect(metric(d, "devices_registered")!.value).toBe(3);
      // 2 distinct users with a device / 3 users = 66.7%
      expect(metric(d, "device_adoption")!.value).toBe(66.7);
      expect(metric(d, "rewards_created")!.value).toBe(1);
      expect(metric(d, "rewards_active")!.value).toBe(1);
      expect(metric(d, "campaigns_created")!.value).toBe(1);
      expect(metric(d, "campaigns_active")!.value).toBe(1);
      // series sums match the metric and are ascending, zero-filled, 7 daily buckets
      const pts = d.series.find((s: { key: string }) => s.key === "users_new").points;
      expect(pts).toHaveLength(7);
      expect(pts.map((p: { bucket: string }) => p.bucket)).toEqual([...pts.map((p: { bucket: string }) => p.bucket)].sort());
      expect(pts.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(2);
      expect(pts.find((p: { bucket: string }) => p.bucket === "2026-06-11").value).toBe(0);
    });

    it("every metric declares a definition, scope and unit; ranged metrics follow the selected range", async () => {
      const res = await get("super@baft.test", "overview");
      for (const m of res.body.data.metrics) {
        expect(m.definition, m.key).toBeTruthy();
        expect(["range", "as_of_range_end", "snapshot"]).toContain(m.scope);
        expect(["count", "percent"]).toContain(m.unit);
      }
    });

    it("risk/security volume appears only for admins who also hold the module's read permission", async () => {
      const keys = async (email: string) => (await get(email, "overview")).body.data.metrics.map((m: { key: string }) => m.key);
      expect(await keys("growth@baft.test")).not.toContain("risk_cases_created");
      expect(await keys("growth@baft.test")).not.toContain("security_cases_open");
      const k = await keys("super@baft.test");
      expect(k).toEqual(expect.arrayContaining(["risk_cases_created", "risk_cases_open", "security_cases_created", "security_cases_open"]));
    });

    it("counts open (non-resolved) support cases as a snapshot and created cases by range", async () => {
      await insertSupport("2026-06-14T10:00:00Z", "open");
      await insertSupport("2026-06-14T11:00:00Z", "resolved");
      await insertSupport("2026-01-14T11:00:00Z", "in_progress");
      const d = (await get("super@baft.test", "overview", "?range=7d")).body.data;
      expect(metric(d, "support_cases_created")!.value).toBe(2);
      expect(metric(d, "support_cases_open")!.value).toBe(2);
    });
  });

  describe("empty dataset and division by zero", () => {
    it("returns real zero counts, zero-filled series, and null (not 0) for undefined percentages", async () => {
      const res = await get("super@baft.test", "overview", "?range=7d");
      const d = res.body.data;
      expect(metric(d, "users_total")!.value).toBe(0);
      expect(metric(d, "users_new")!.value).toBe(0);
      const adoption = d.metrics.find((m: { key: string }) => m.key === "device_adoption");
      expect(adoption.value).toBeNull();
      expect(adoption.nullReason).toBe("zero_denominator");
      expect(d.series[0].points).toHaveLength(7);
      expect(d.series[0].points.every((p: { value: number }) => p.value === 0)).toBe(true);
    });

    it("onboarding rate is null with no users created; breakdowns are empty arrays", async () => {
      const d = (await get("super@baft.test", "onboarding")).body.data;
      expect(d.metrics.find((m: { key: string }) => m.key === "device_registration_rate")).toMatchObject({ value: null, nullReason: "zero_denominator" });
      expect(d.breakdowns[0].items).toEqual([]);
    });
  });

  describe("onboarding", () => {
    it("computes created users, device registration rate (distinct users) and status breakdown", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push(await insertUser(`n${i}@x.test`, "2026-06-12T10:00:00Z"));
      await insertUser("sus@x.test", "2026-06-12T10:00:00Z", "suspended");
      await insertUser("old@x.test", "2026-02-01T10:00:00Z");
      await insertDevice(ids[0]!, "2026-06-12T10:01:00Z");
      await insertDevice(ids[0]!, "2026-06-13T10:01:00Z"); // second device, same user
      await insertDevice(ids[1]!, "2026-06-12T10:01:00Z");
      const d = (await get("super@baft.test", "onboarding", "?range=7d")).body.data;
      expect(metric(d, "users_created")!.value).toBe(7);
      expect(metric(d, "users_created_with_device")!.value).toBe(2);
      expect(metric(d, "device_registration_rate")!.value).toBe(28.6);
      // active=6 shown; suspended=1 is below the minimum group size → suppressed
      expect(d.breakdowns[0].items).toEqual([
        { key: "active", value: 6 },
        { key: "suspended", value: null, suppressed: true },
      ]);
      expect(d.breakdowns[0].suppressionThreshold).toBe(5);
    });

    it("never invents activation or funnel stages: they are listed as unavailable with reasons", async () => {
      const d = (await get("super@baft.test", "onboarding")).body.data;
      const keys = d.unavailable.map((u: { key: string }) => u.key);
      expect(keys).toEqual(expect.arrayContaining(["activation_rate", "onboarding_funnel", "users_inactive_by_activity"]));
      expect(d.metrics.map((m: { key: string }) => m.key)).not.toContain("activation_rate");
      for (const u of d.unavailable) {
        expect(u.reason).toBeTruthy();
        expect(u.requires).toBeTruthy();
      }
      expect(d.availability).toBe("partial");
    });
  });

  describe("granularity", () => {
    it("uses weekly buckets for 90 days and monthly buckets for 366 days; weeks start on Monday", async () => {
      const weekly = (await get("super@baft.test", "onboarding", "?range=90d")).body.data.series[0];
      expect(weekly.granularity).toBe("week");
      for (const p of weekly.points) expect(new Date(`${p.bucket}T00:00:00Z`).getUTCDay(), p.bucket).toBe(1);
      const monthly = (await get("super@baft.test", "onboarding", "?range=custom&from=2025-06-15&to=2026-06-15")).body.data.series[0];
      expect(monthly.granularity).toBe("month");
      expect(monthly.points[0].bucket).toBe("2025-06-01");
      expect(monthly.points).toHaveLength(13);
    });

    it("buckets a user into the right week and month", async () => {
      await insertUser("w@x.test", "2026-06-10T10:00:00Z"); // Wed → week of Mon 2026-06-08
      const weekly = (await get("super@baft.test", "onboarding", "?range=90d")).body.data.series[0].points;
      expect(weekly.find((p: { bucket: string }) => p.bucket === "2026-06-08").value).toBe(1);
      expect(weekly.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(1);
    });
  });

  describe("usage (device inventory only)", () => {
    it("shows device inventory by platform/status with small groups suppressed, in deterministic order", async () => {
      const u = await insertUser("d@x.test", "2026-01-01T00:00:00Z");
      for (let i = 0; i < 5; i++) await insertDevice(u, "2026-02-01T00:00:00Z", "ios");
      for (let i = 0; i < 5; i++) await insertDevice(u, "2026-02-01T00:00:00Z", "android");
      await insertDevice(u, "2026-02-01T00:00:00Z", "web");
      await insertDevice(u, "2026-07-01T00:00:00Z", "ios"); // after range end → excluded
      const d = (await get("eng@baft.test", "usage", "?range=7d")).body.data;
      expect(metric(d, "devices_total")!.value).toBe(11);
      const byPlatform = d.breakdowns.find((b: { key: string }) => b.key === "devices_by_platform");
      // ties broken by key ascending; web (1) suppressed
      expect(byPlatform.items).toEqual([
        { key: "android", value: 5 },
        { key: "ios", value: 5 },
        { key: "web", value: null, suppressed: true },
      ]);
    });

    it("reports activity metrics as unavailable and never as zero", async () => {
      const d = (await get("eng@baft.test", "usage")).body.data;
      expect(d.unavailable.map((u: { key: string }) => u.key)).toEqual(
        expect.arrayContaining(["active_users", "active_devices", "usage_frequency", "activity_trend"]),
      );
      const keys = d.metrics.map((m: { key: string }) => m.key);
      for (const k of ["active_users", "active_devices", "usage_frequency"]) expect(keys).not.toContain(k);
      expect(JSON.stringify(d.unavailable)).toMatch(/Admin portal requests are not customer usage/);
    });
  });

  describe("features and retention (no customer activity source)", () => {
    it("feature usage is explicitly unavailable, with no metrics, series or breakdowns", async () => {
      const d = (await get("growth@baft.test", "features")).body.data;
      expect(d.availability).toBe("unavailable");
      expect(d.summary).toBe("Feature usage data unavailable.");
      expect(d.metrics).toEqual([]);
      expect(d.series).toEqual([]);
      expect(d.breakdowns).toEqual([]);
      expect(d.unavailable.length).toBeGreaterThan(0);
    });

    it("retention is explicitly unavailable: no fabricated cohorts or percentages", async () => {
      await insertUser("a@x.test", "2026-06-10T00:00:00Z");
      const d = (await get("growth@baft.test", "retention")).body.data;
      expect(d.availability).toBe("unavailable");
      expect(d.metrics).toEqual([]);
      expect(d.breakdowns).toEqual([]);
      expect(JSON.stringify(d)).not.toMatch(/"value"/);
    });

    it("neither Admin API activity nor audit logs count as customer activity", async () => {
      const agent = await login("growth@baft.test");
      await agent.get("/api/v1/analytics/overview");
      await agent.get("/api/v1/analytics/features");
      const d = (await agent.get("/api/v1/analytics/features")).body.data;
      expect(d.metrics).toEqual([]);
      expect(h.sql.some((s) => /audit_logs|sessions/i.test(s))).toBe(false);
    });
  });

  describe("rewards", () => {
    it("aggregates reward and campaign definitions; ties ordered by key", async () => {
      await insertReward("a", "points", "active", "2026-06-10T00:00:00Z");
      await insertReward("b", "cashback", "active", "2026-06-11T00:00:00Z");
      await insertReward("c", "points", "paused", "2026-06-12T00:00:00Z");
      await insertReward("old", "voucher", "expired", "2025-12-01T00:00:00Z");
      await insertCampaign("x", "referral", "completed", "2026-06-10T00:00:00Z");
      const d = (await get("ops@baft.test", "rewards", "?range=7d")).body.data;
      expect(metric(d, "rewards_created")!.value).toBe(3);
      expect(metric(d, "rewards_active")!.value).toBe(2);
      expect(metric(d, "rewards_paused")!.value).toBe(1);
      expect(metric(d, "rewards_expired")!.value).toBe(1); // snapshot: includes items outside the range, labelled as such
      expect(d.metrics.find((m: { key: string }) => m.key === "rewards_expired").scope).toBe("snapshot");
      expect(metric(d, "campaigns_completed")!.value).toBe(1);
      const byType = d.breakdowns.find((b: { key: string }) => b.key === "rewards_by_type");
      expect(byType.items).toEqual([
        { key: "points", value: 2 },
        { key: "cashback", value: 1 },
      ]);
    });

    it("lists redemption, payout, entitlement and history metrics as unavailable and returns none of them", async () => {
      const d = (await get("ops@baft.test", "rewards")).body.data;
      const keys = d.unavailable.map((u: { key: string }) => u.key);
      expect(keys).toEqual(expect.arrayContaining(["entitlement_evaluations", "rewards_redeemed", "redemption_rate", "reward_payouts", "user_reward_history"]));
      expect(JSON.stringify(d.metrics)).not.toMatch(/redeem|payout|redemption/i);
    });

    it("empty rewards data gives true zeros (these are real counts of BAFT rows)", async () => {
      const d = (await get("ops@baft.test", "rewards")).body.data;
      expect(metric(d, "rewards_created")!.value).toBe(0);
      expect(d.breakdowns.every((b: { items: unknown[] }) => b.items.length === 0)).toBe(true);
    });
  });

  describe("financial analytics", () => {
    it("is unavailable, returns no numbers, and says why", async () => {
      const d = (await get("super@baft.test", "financial")).body.data;
      expect(d.availability).toBe("unavailable");
      expect(d.summary).toMatch(/provider-owned transaction data is not connected/);
      expect(d.metrics).toEqual([]);
      expect(d.series).toEqual([]);
      expect(d.breakdowns).toEqual([]);
      expect(d.unavailable.map((u: { key: string }) => u.key)).toEqual(
        expect.arrayContaining(["transaction_volume", "transaction_value", "card_spend", "merchant_spend", "balances", "settlement", "transaction_revenue"]),
      );
    });

    it("never queries the database, never calls a provider, and never contains provider data or identifiers", async () => {
      await insertUser("p@x.test", "2026-06-10T00:00:00Z", "active", { ext: "PROV-REF-9" });
      h.sql.length = 0;
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const res = await get("super@baft.test", "financial");
      expect(h.sql).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
      expect(JSON.stringify(res.body)).not.toMatch(/PROV-REF-9|accountNumber|cardNumber|beneficiar|kyc/i);
    });
  });

  describe("privacy and data boundary", () => {
    it("no section returns emails, phone numbers, names, provider references, KYC or beneficiary data", async () => {
      const u = await insertUser("leak.person@customer.test", "2026-06-12T10:00:00Z", "active", { phone: "+15550001234", ext: "PROV-REF-0042" });
      await insertDevice(u, "2026-06-12T10:00:00Z");
      for (const s of SECTIONS) {
        const dump = JSON.stringify((await get("super@baft.test", s, "?range=7d")).body);
        for (const leaked of ["leak.person", "customer.test", "+15550001234", "5550001234", "PROV-REF-0042", "dev-", "external_ref", "full_name"]) {
          expect(dump, `${s}: ${leaked}`).not.toContain(leaked);
        }
        expect(dump, s).not.toMatch(/beneficiar|aadhaar|cardNumber|accountNumber|"kyc"/i);
      }
    });

    it("never returns an id-bearing or row-shaped payload: only counts/labels", async () => {
      await insertUser("a@x.test", "2026-06-12T10:00:00Z");
      const dump = JSON.stringify((await get("super@baft.test", "overview", "?range=7d")).body.data);
      expect(dump).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    });

    it("sets Cache-Control: no-store", async () => {
      expect((await get("super@baft.test", "overview")).headers["cache-control"]).toBe("no-store");
    });
  });

  describe("persistence and query safety", () => {
    it("runs only parameterised read-only SELECTs — no writes, DDL or new analytics tables", async () => {
      await insertUser("a@x.test", "2026-06-12T10:00:00Z");
      h.sql.length = 0;
      for (const s of SECTIONS) await get("super@baft.test", s, "?range=90d");
      expect(h.sql.length).toBeGreaterThan(0);
      for (const q of h.sql) {
        expect(q.trim(), q).toMatch(/^SELECT/i);
        expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i);
      }
      const t = await pg().query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~ 'analytic|snapshot|metric|warehouse'`,
      );
      expect(t.rows).toEqual([]);
    });

    it("the migration adds only permissions/grants (no tables, indexes or views)", () => {
      const sql = readFileSync(new URL("../src/infrastructure/database/migrations/027_seed_analytics_permissions.sql", import.meta.url), "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      expect(sql).not.toMatch(/CREATE\s+(TABLE|INDEX|VIEW|MATERIALIZED)/i);
      expect(sql).toMatch(/INSERT INTO permissions/);
    });

    it("analytics source never imports or calls the Transcorp integration", () => {
      for (const f of ["services/analytics.service.ts", "repositories/analytics.repository.ts", "controllers/analytics.controller.ts", "routes/analytics.routes.ts"]) {
        const text = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
        expect(text, f).not.toMatch(/from\s+"[^"]*(integrations|kyc|beneficiar)[^"]*"|fetch\(/i);
      }
    });
  });
});
