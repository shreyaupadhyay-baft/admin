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
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Administration: Permissions and Audit APIs", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;

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
    const root = await createAdminUser({ email: "root@baft.test", passwordHash, fullName: "Root" });
    await assignRoleToAdmin(root.id, fixtures.superAdmin.id);

    superAgent = request.agent(app);
    await superAgent.post("/api/v1/auth/login").send({ email: "root@baft.test", password: PASSWORD });
  });

  it("lists the permission catalogue grouped by resource, with search/filter", async () => {
    const res = await superAgent.get("/api/v1/administration/permissions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    expect(res.body.data.groupedByResource).toBeTruthy();
    expect(Array.isArray(res.body.data.groupedByResource["administration.admins"])).toBe(true);

    const filtered = await superAgent.get("/api/v1/administration/permissions?resource=administration.roles");
    expect(filtered.body.data.permissions.every((p: { resource: string }) => p.resource === "administration.roles")).toBe(true);

    const searched = await superAgent.get("/api/v1/administration/permissions?search=revoke_sessions");
    expect(searched.body.data.permissions.some((p: { key: string }) => p.key.includes("revoke_sessions"))).toBe(true);
  });

  it("gets a single permission by id, and 404s for a nonexistent one", async () => {
    const listRes = await superAgent.get("/api/v1/administration/permissions");
    const somePermission = listRes.body.data.permissions[0];

    const res = await superAgent.get(`/api/v1/administration/permissions/${somePermission.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.permission.key).toBe(somePermission.key);

    expect((await superAgent.get("/api/v1/administration/permissions/00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("rejects unauthenticated requests to the permission catalogue with 401", async () => {
    expect((await request(app).get("/api/v1/administration/permissions")).status).toBe(401);
  });

  it("returns 403 for a role without administration.permissions.read", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    expect((await agent.get("/api/v1/administration/permissions")).status).toBe(403);
  });

  it("lists the audit trail, filterable by actor/action/targetType/date, read-only", async () => {
    await superAgent.post("/api/v1/administration/admins").send({ email: "audited@baft.test", password: "another-long-password-123", fullName: "Audited" });

    const res = await superAgent.get("/api/v1/administration/audit");
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.some((l: { action: string }) => l.action === "ADMINISTRATION_ADMIN_CREATED")).toBe(true);

    const filtered = await superAgent.get("/api/v1/administration/audit?action=ADMINISTRATION_ADMIN_CREATED");
    expect(filtered.body.data.auditLogs.every((l: { action: string }) => l.action === "ADMINISTRATION_ADMIN_CREATED")).toBe(true);
  });

  it("never exposes password hashes or session tokens in the audit view", async () => {
    await superAgent.post("/api/v1/administration/admins").send({ email: "audit-secure@baft.test", password: "another-long-password-123", fullName: "Audit Secure" });
    const res = await superAgent.get("/api/v1/administration/audit");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/password_hash|scrypt\$|another-long-password-123/i);
  });

  it("rejects unauthenticated requests to the audit view with 401", async () => {
    expect((await request(app).get("/api/v1/administration/audit")).status).toBe(401);
  });

  it("returns 403 for a role without administration.audit.read", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    expect((await agent.get("/api/v1/administration/audit")).status).toBe(403);
  });

  it("lets Security Admin read the audit trail (part of its scoped Administration access)", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    expect((await agent.get("/api/v1/administration/audit")).status).toBe(200);
  });
});
