import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));
vi.mock("../src/repositories/user.repository.js", () => import("./fakes/user.repository.fake.js"));
vi.mock("../src/repositories/device.repository.js", () => import("./fakes/device.repository.fake.js"));
vi.mock("../src/repositories/supportCase.repository.js", () => import("./fakes/supportCase.repository.fake.js"));
vi.mock("../src/repositories/supportCaseEvent.repository.js", () => import("./fakes/supportCaseEvent.repository.fake.js"));
vi.mock("../src/repositories/appIssue.repository.js", () => import("./fakes/appIssue.repository.fake.js"));
vi.mock("../src/repositories/campaign.repository.js", () => import("./fakes/campaign.repository.fake.js"));
vi.mock("../src/repositories/reward.repository.js", () => import("./fakes/reward.repository.fake.js"));
vi.mock("../src/repositories/riskSignal.repository.js", () => import("./fakes/riskSignal.repository.fake.js"));
vi.mock("../src/repositories/riskCase.repository.js", () => import("./fakes/riskCase.repository.fake.js"));
vi.mock("../src/repositories/riskCaseEvent.repository.js", () => import("./fakes/riskCaseEvent.repository.fake.js"));
vi.mock("../src/repositories/riskCaseEvidence.repository.js", () => import("./fakes/riskCaseEvidence.repository.fake.js"));
vi.mock("../src/repositories/riskCaseDecision.repository.js", () => import("./fakes/riskCaseDecision.repository.fake.js"));
vi.mock("../src/repositories/userSession.repository.js", () => import("./fakes/userSession.repository.fake.js"));
vi.mock("../src/repositories/securityEvent.repository.js", () => import("./fakes/securityEvent.repository.fake.js"));
vi.mock("../src/repositories/securityCase.repository.js", () => import("./fakes/securityCase.repository.fake.js"));
vi.mock("../src/repositories/securityCaseEvent.repository.js", () => import("./fakes/securityCaseEvent.repository.fake.js"));
vi.mock("../src/repositories/securityCaseEvidence.repository.js", () => import("./fakes/securityCaseEvidence.repository.fake.js"));
vi.mock("../src/repositories/securityAction.repository.js", () => import("./fakes/securityAction.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Administration Audit UI refinement", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let superAdminId: string;

  const loginAsRole = async (email: string, roleId: string) => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email, passwordHash, fullName: "Test" });
    await assignRoleToAdmin(admin.id, roleId);
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return agent;
  };

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const root = await createAdminUser({ email: "root@baft.test", passwordHash, fullName: "Root Admin" });
    await assignRoleToAdmin(root.id, fixtures.superAdmin.id);
    superAdminId = root.id;

    superAgent = request.agent(app);
    await superAgent.post("/api/v1/auth/login").send({ email: "root@baft.test", password: PASSWORD });
  });

  describe("List: pagination, ordering, actor enrichment", () => {
    it("returns total and hasNext pagination metadata", async () => {
      for (let i = 0; i < 3; i++) {
        await superAgent.post("/api/v1/administration/admins").send({
          email: `page-${i}@baft.test`, password: "another-long-password-123", fullName: `Page ${i}`,
        });
      }

      const page1 = await superAgent.get("/api/v1/administration/audit?limit=2&offset=0");
      expect(page1.status).toBe(200);
      expect(page1.body.meta.total).toBeGreaterThanOrEqual(3);
      expect(page1.body.meta.hasNext).toBe(true);
      expect(page1.body.data.auditLogs).toHaveLength(2);
    });

    it("orders newest first, deterministically, even when timestamps tie", async () => {
      const now = new Date();
      db.auditLogs.push(
        { id: "11111111-1111-1111-1111-111111111111", actor_admin_id: superAdminId, action: "TIE_TEST", target_type: null, target_id: null, request_id: null, correlation_id: null, metadata: {}, created_at: now },
        { id: "22222222-2222-2222-2222-222222222222", actor_admin_id: superAdminId, action: "TIE_TEST", target_type: null, target_id: null, request_id: null, correlation_id: null, metadata: {}, created_at: now },
      );

      const res1 = await superAgent.get("/api/v1/administration/audit?action=TIE_TEST");
      const res2 = await superAgent.get("/api/v1/administration/audit?action=TIE_TEST");
      const ids1 = res1.body.data.auditLogs.map((l: { id: string }) => l.id);
      const ids2 = res2.body.data.auditLogs.map((l: { id: string }) => l.id);
      expect(ids1).toEqual(ids2);
      expect(ids1).toEqual(["22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111"]);
    });

    it("resolves the actor's current email/full name instead of a bare admin id", async () => {
      await superAgent.post("/api/v1/administration/admins").send({
        email: "enriched@baft.test", password: "another-long-password-123", fullName: "Enriched Target",
      });

      const res = await superAgent.get("/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_CREATED");
      const entry = res.body.data.auditLogs[0];
      expect(entry.actorEmail).toBe("root@baft.test");
      expect(entry.actorFullName).toBe("Root Admin");
    });
  });

  describe("Filters", () => {
    it("filters by actor admin id", async () => {
      const otherAgent = await loginAsRole("other-actor@baft.test", fixtures.superAdmin.id);
      const otherAdminRes = await otherAgent.get("/api/v1/administration/admins?search=other-actor");
      const otherAdminId = otherAdminRes.body.data.admins.find((a: { email: string }) => a.email === "other-actor@baft.test").id;

      await superAgent.post("/api/v1/administration/admins").send({ email: "by-root@baft.test", password: "another-long-password-123", fullName: "By Root" });
      await otherAgent.post("/api/v1/administration/admins").send({ email: "by-other@baft.test", password: "another-long-password-123", fullName: "By Other" });

      const res = await superAgent.get(`/api/v1/administration/audit?actorAdminId=${otherAdminId}&action=ADMINISTRATION_ADMIN_CREATED`);
      expect(res.body.data.auditLogs.every((l: { actorAdminId: string }) => l.actorAdminId === otherAdminId)).toBe(true);
      expect(res.body.data.auditLogs.length).toBeGreaterThan(0);
    });

    it("filters by resource (targetType) and target id", async () => {
      const createRes = await superAgent.post("/api/v1/administration/admins").send({
        email: "target-test@baft.test", password: "another-long-password-123", fullName: "Target Test",
      });
      const targetId = createRes.body.data.admin.id;

      const byResource = await superAgent.get("/api/v1/administration/audit?targetType=admin_user");
      expect(byResource.body.data.auditLogs.every((l: { targetType: string }) => l.targetType === "admin_user")).toBe(true);

      const byTarget = await superAgent.get(`/api/v1/administration/audit?targetId=${targetId}`);
      expect(byTarget.body.data.auditLogs.every((l: { targetId: string }) => l.targetId === targetId)).toBe(true);
      expect(byTarget.body.data.auditLogs.length).toBeGreaterThan(0);
    });

    it("filters by an inclusive date range", async () => {
      const before = new Date(Date.now() - 60_000);
      await superAgent.post("/api/v1/administration/admins").send({
        email: "date-range@baft.test", password: "another-long-password-123", fullName: "Date Range",
      });
      const after = new Date(Date.now() + 60_000);

      const res = await superAgent.get(
        `/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_CREATED&dateFrom=${before.toISOString()}&dateTo=${after.toISOString()}`,
      );
      expect(res.body.data.auditLogs.some((l: { action: string }) => l.action === "ADMINISTRATION_ADMIN_CREATED")).toBe(true);

      const tooLate = new Date(Date.now() + 120_000);
      const farFuture = new Date(Date.now() + 180_000);
      const emptyRes = await superAgent.get(
        `/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_CREATED&dateFrom=${tooLate.toISOString()}&dateTo=${farFuture.toISOString()}`,
      );
      expect(emptyRes.body.data.auditLogs).toEqual([]);
    });

    it("combines actor + resource + action + date filters, returning only matching records", async () => {
      const createRes = await superAgent.post("/api/v1/administration/admins").send({
        email: "combined@baft.test", password: "another-long-password-123", fullName: "Combined",
      });
      const since = new Date(Date.now() - 60_000);

      const res = await superAgent.get(
        `/api/v1/administration/audit?actorAdminId=${superAdminId}&targetType=admin_user&action=ADMINISTRATION_ADMIN_CREATED&dateFrom=${since.toISOString()}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs.some((l: { targetId: string }) => l.targetId === createRes.body.data.admin.id)).toBe(true);
      expect(
        res.body.data.auditLogs.every(
          (l: { actorAdminId: string; targetType: string; action: string }) =>
            l.actorAdminId === superAdminId && l.targetType === "admin_user" && l.action === "ADMINISTRATION_ADMIN_CREATED",
        ),
      ).toBe(true);
    });

    it("empty results behave correctly: 200 with an empty array and total 0", async () => {
      const res = await superAgent.get("/api/v1/administration/audit?action=THIS_ACTION_DOES_NOT_EXIST");
      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs).toEqual([]);
      expect(res.body.meta.total).toBe(0);
      expect(res.body.meta.hasNext).toBe(false);
    });

    it("rejects invalid filters safely with 400, never a 500", async () => {
      expect((await superAgent.get("/api/v1/administration/audit?actorAdminId=not-a-uuid")).status).toBe(400);
      expect((await superAgent.get("/api/v1/administration/audit?dateFrom=not-a-date")).status).toBe(400);
      expect((await superAgent.get("/api/v1/administration/audit?limit=0")).status).toBe(400);
      expect((await superAgent.get("/api/v1/administration/audit?limit=99999")).status).toBe(400);
    });
  });

  describe("Search", () => {
    it("finds records by action, target type/id, or actor identity, case-insensitively", async () => {
      const createRes = await superAgent.post("/api/v1/administration/admins").send({
        email: "searchable-target@baft.test", password: "another-long-password-123", fullName: "Searchable Target",
      });
      const targetId = createRes.body.data.admin.id;

      const byAction = await superAgent.get("/api/v1/administration/audit?search=administration_admin_created");
      expect(byAction.body.data.auditLogs.length).toBeGreaterThan(0);

      const byActorEmail = await superAgent.get("/api/v1/administration/audit?search=ROOT@baft.test");
      expect(byActorEmail.body.data.auditLogs.length).toBeGreaterThan(0);

      const byTargetId = await superAgent.get(`/api/v1/administration/audit?search=${targetId}`);
      expect(byTargetId.body.data.auditLogs.some((l: { targetId: string }) => l.targetId === targetId)).toBe(true);
    });

    it("safely handles LIKE special characters in the search term without error", async () => {
      const res = await superAgent.get(`/api/v1/administration/audit?search=${encodeURIComponent("100%_weird\\term")}`);
      expect(res.status).toBe(200);
    });

    it("rejects an empty search term", async () => {
      expect((await superAgent.get("/api/v1/administration/audit?search=")).status).toBe(400);
    });
  });

  describe("Detail endpoint", () => {
    it("an authorized admin can retrieve full, non-sensitive audit detail", async () => {
      const createRes = await superAgent.post("/api/v1/administration/admins").send({
        email: "detail-test@baft.test", password: "another-long-password-123", fullName: "Detail Test",
      });
      const listRes = await superAgent.get("/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_CREATED");
      const auditId = listRes.body.data.auditLogs.find(
        (l: { targetId: string }) => l.targetId === createRes.body.data.admin.id,
      ).id;

      const res = await superAgent.get(`/api/v1/administration/audit/${auditId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.auditLog.id).toBe(auditId);
      expect(res.body.data.auditLog.actorEmail).toBe("root@baft.test");
      expect(res.body.data.auditLog.action).toBe("ADMINISTRATION_ADMIN_CREATED");
    });

    it("returns 404 for a nonexistent audit id", async () => {
      expect((await superAgent.get("/api/v1/administration/audit/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    });

    it("returns 400 for a malformed audit id", async () => {
      expect((await superAgent.get("/api/v1/administration/audit/not-a-uuid")).status).toBe(400);
    });

    it("rejects detail access for an unauthorized role with 403, same as the list endpoint", async () => {
      const agent = await loginAsRole("growth-detail@baft.test", fixtures.productGrowthAdmin.id);
      const someId = db.auditLogs[0]!.id;
      expect((await agent.get(`/api/v1/administration/audit/${someId}`)).status).toBe(403);
    });

    it("rejects unauthenticated detail requests with 401", async () => {
      const someId = db.auditLogs[0]?.id ?? "00000000-0000-0000-0000-000000000000";
      expect((await request(app).get(`/api/v1/administration/audit/${someId}`)).status).toBe(401);
    });
  });

  describe("Security / data boundaries", () => {
    it("redacts a secret-shaped metadata key even though no producer currently writes one (defense in depth)", async () => {
      const secretLogId = randomUUID();
      db.auditLogs.push({
        id: secretLogId,
        actor_admin_id: superAdminId,
        action: "TEST_WITH_SECRET",
        target_type: null,
        target_id: null,
        request_id: null,
        correlation_id: null,
        metadata: { reason: "normal value", apiKey: "sk-super-secret", nested: { password: "hunter2" } },
        created_at: new Date(),
      });

      const listRes = await superAgent.get("/api/v1/administration/audit?action=TEST_WITH_SECRET");
      const entry = listRes.body.data.auditLogs[0];
      expect(entry.metadata.reason).toBe("normal value");
      expect(entry.metadata.apiKey).toBe("[REDACTED]");
      expect(entry.metadata.nested.password).toBe("[REDACTED]");

      const detailRes = await superAgent.get(`/api/v1/administration/audit/${secretLogId}`);
      expect(detailRes.body.data.auditLog.metadata.apiKey).toBe("[REDACTED]");
    });

    it("never exposes password hashes or session tokens anywhere in list or detail responses", async () => {
      await superAgent.post("/api/v1/administration/admins").send({
        email: "no-leak@baft.test", password: "another-long-password-123", fullName: "No Leak",
      });
      const listRes = await superAgent.get("/api/v1/administration/audit");
      const someId = listRes.body.data.auditLogs[0].id;
      const detailRes = await superAgent.get(`/api/v1/administration/audit/${someId}`);

      const combined = JSON.stringify({ listRes: listRes.body, detailRes: detailRes.body });
      expect(combined).not.toMatch(/password_hash|scrypt\$|another-long-password-123/i);
      expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
    });

    it("does not expose a provider-owned data key anywhere in the response", async () => {
      const res = await superAgent.get("/api/v1/administration/audit");
      const combined = JSON.stringify(res.body);
      for (const forbidden of ["kycDocument", "cardNumber", "transactionId", "beneficiaryAccount"]) {
        expect(combined).not.toContain(forbidden);
      }
    });

    it("reading the audit trail (list and detail) never mutates the stored records", async () => {
      await superAgent.post("/api/v1/administration/admins").send({
        email: "immutable-check@baft.test", password: "another-long-password-123", fullName: "Immutable Check",
      });
      const before = JSON.parse(JSON.stringify(db.auditLogs));

      const listRes = await superAgent.get("/api/v1/administration/audit");
      await superAgent.get(`/api/v1/administration/audit/${listRes.body.data.auditLogs[0].id}`);

      const after = db.auditLogs;
      expect(after).toHaveLength(before.length);
      expect(after.map((l) => l.action)).toEqual(before.map((l: { action: string }) => l.action));
    });
  });

  describe("RBAC", () => {
    it("rejects unauthenticated list requests with 401", async () => {
      expect((await request(app).get("/api/v1/administration/audit")).status).toBe(401);
    });

    it("returns 403 for a role without administration.audit.read", async () => {
      const agent = await loginAsRole("no-audit@baft.test", fixtures.productGrowthAdmin.id);
      expect((await agent.get("/api/v1/administration/audit")).status).toBe(403);
      expect((await agent.get("/api/v1/administration/audit?search=anything")).status).toBe(403);
    });
  });

  describe("Regression: existing module audit logging continues to work unchanged", () => {
    it("disabling an admin still writes ADMINISTRATION_ADMIN_DISABLED with the expected fields", async () => {
      const createRes = await superAgent.post("/api/v1/administration/admins").send({
        email: "disable-me@baft.test", password: "another-long-password-123", fullName: "Disable Me",
      });
      const targetId = createRes.body.data.admin.id;
      await superAgent.post(`/api/v1/administration/admins/${targetId}/disable`);

      const res = await superAgent.get(`/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_DISABLED&targetId=${targetId}`);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].targetType).toBe("admin_user");
      expect(res.body.data.auditLogs[0].actorEmail).toBe("root@baft.test");
    });
  });
});
