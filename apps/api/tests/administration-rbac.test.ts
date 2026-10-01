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
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Administration RBAC matrix", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;

  const loginAsRole = async (email: string, roleId: string) => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email, passwordHash, fullName: "Test" });
    await assignRoleToAdmin(admin.id, roleId);
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return agent;
  };

  beforeEach(() => {
    resetStore();
    fixtures = seedRbacFixtures();
  });

  it("Super Admin: full Administration access, including role/permission management", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    expect((await agent.get("/api/v1/administration/admins")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/roles")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/permissions")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/audit")).status).toBe(200);
    expect(
      (await agent.post("/api/v1/administration/roles").send({ name: "Matrix Role", permissionIds: [] })).status,
    ).toBe(201);
  });

  it("Security Admin: scoped to admin/session management + audit, explicitly no role/permission management", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);

    expect((await agent.get("/api/v1/administration/admins")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/audit")).status).toBe(200);

    const createRes = await agent
      .post("/api/v1/administration/admins")
      .send({ email: "sec-created@baft.test", password: "another-long-password-123", fullName: "Sec Created" });
    // Security Admin has no administration.admins.create in this module's mapping.
    expect(createRes.status).toBe(403);

    expect((await agent.get("/api/v1/administration/roles")).status).toBe(403);
    expect((await agent.get("/api/v1/administration/permissions")).status).toBe(403);
  });

  it("Security Admin can disable/enable an admin and revoke/read their sessions", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const superAgent = request.agent(app);
    const root = await createAdminUser({ email: "root2@baft.test", passwordHash, fullName: "Root" });
    await assignRoleToAdmin(root.id, fixtures.superAdmin.id);
    await superAgent.post("/api/v1/auth/login").send({ email: "root2@baft.test", password: PASSWORD });

    const targetRes = await superAgent
      .post("/api/v1/administration/admins")
      .send({ email: "sec-target@baft.test", password: "another-long-password-123", fullName: "Sec Target" });
    const targetId = targetRes.body.data.admin.id;

    const agent = await loginAsRole("security2@baft.test", fixtures.securityAdmin.id);
    expect((await agent.post(`/api/v1/administration/admins/${targetId}/disable`)).status).toBe(200);
    expect((await agent.post(`/api/v1/administration/admins/${targetId}/enable`)).status).toBe(200);
    expect((await agent.get(`/api/v1/administration/admins/${targetId}/sessions`)).status).toBe(200);
    expect((await agent.post(`/api/v1/administration/admins/${targetId}/revoke-sessions`)).status).toBe(200);
  });

  it("Auditor: read-only across admins, roles, permissions, and audit — no mutation", async () => {
    const agent = await loginAsRole("auditor@baft.test", fixtures.auditor.id);

    expect((await agent.get("/api/v1/administration/admins")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/roles")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/permissions")).status).toBe(200);
    expect((await agent.get("/api/v1/administration/audit")).status).toBe(200);

    expect(
      (
        await agent
          .post("/api/v1/administration/admins")
          .send({ email: "x@baft.test", password: "another-long-password-123", fullName: "X" })
      ).status,
    ).toBe(403);
    expect((await agent.post("/api/v1/administration/roles").send({ name: "X", permissionIds: [] })).status).toBe(403);
  });

  it("Operations, Support, Risk/Fraud, Product/Growth, Engineering Admin: no Administration access at all", async () => {
    for (const [email, roleId] of [
      ["ops@baft.test", fixtures.operationsAdmin.id],
      ["support@baft.test", fixtures.supportAdmin.id],
      ["risk@baft.test", fixtures.riskFraudAdmin.id],
      ["growth@baft.test", fixtures.productGrowthAdmin.id],
      ["eng@baft.test", fixtures.engineeringAdmin.id],
    ] as const) {
      const agent = await loginAsRole(email, roleId);
      expect((await agent.get("/api/v1/administration/admins")).status).toBe(403);
      expect((await agent.get("/api/v1/administration/roles")).status).toBe(403);
      expect((await agent.get("/api/v1/administration/permissions")).status).toBe(403);
      expect((await agent.get("/api/v1/administration/audit")).status).toBe(403);
    }
  });

  it("rejects unauthenticated requests with 401 on every Administration route", async () => {
    expect((await request(app).get("/api/v1/administration/admins")).status).toBe(401);
    expect((await request(app).get("/api/v1/administration/roles")).status).toBe(401);
    expect((await request(app).get("/api/v1/administration/permissions")).status).toBe(401);
    expect((await request(app).get("/api/v1/administration/audit")).status).toBe(401);
  });

  it("preserves original Phase 1 /api/v1/admins,/roles,/permissions behavior unchanged", async () => {
    const agent = await loginAsRole("super2@baft.test", fixtures.superAdmin.id);
    expect((await agent.get("/api/v1/admins")).status).toBe(200);
    expect((await agent.get("/api/v1/roles")).status).toBe(200);
    expect((await agent.get("/api/v1/permissions")).status).toBe(200);
  });
});
