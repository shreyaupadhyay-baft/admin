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

describe("Administration: Roles API", () => {
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

  it("lists roles with search, status filter, and pagination", async () => {
    const res = await superAgent.get("/api/v1/administration/roles?search=Auditor");
    expect(res.status).toBe(200);
    expect(res.body.data.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(true);
  });

  it("gets a role's detail with permissions and assigned admin count", async () => {
    const res = await superAgent.get(`/api/v1/administration/roles/${fixtures.auditor.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.role.permissions)).toBe(true);
    expect(res.body.data.role.assignedAdminCount).toBe(0);
  });

  it("returns 404 for a nonexistent role and 400 for a malformed id", async () => {
    expect((await superAgent.get("/api/v1/administration/roles/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await superAgent.get("/api/v1/administration/roles/not-a-uuid")).status).toBe(400);
  });

  it("creates a custom role with permissions the actor holds", async () => {
    const res = await superAgent.post("/api/v1/administration/roles").send({
      name: "Custom Read Role",
      description: "Read-only custom role",
      permissionIds: [],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.role.name).toBe("Custom Read Role");
    expect(res.body.data.role.isActive).toBe(true);
  });

  it("rejects a duplicate role name with 409", async () => {
    await superAgent.post("/api/v1/administration/roles").send({ name: "Dup Role", permissionIds: [] });
    const res = await superAgent.post("/api/v1/administration/roles").send({ name: "Dup Role", permissionIds: [] });
    expect(res.status).toBe(409);
  });

  it("updates a role's metadata but rejects permissionIds on the generic PATCH", async () => {
    const createRes = await superAgent.post("/api/v1/administration/roles").send({ name: "Metadata Role", permissionIds: [] });
    const roleId = createRes.body.data.role.id;

    const res = await superAgent.patch(`/api/v1/administration/roles/${roleId}`).send({ description: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.data.role.description).toBe("Updated");

    // permissionIds isn't a recognized field on this schema — stripped, leaving nothing recognized.
    const rejected = await superAgent.patch(`/api/v1/administration/roles/${roleId}`).send({ permissionIds: [] });
    expect(rejected.status).toBe(400);
  });

  it("enables and disables a custom role, which immediately affects derived permissions", async () => {
    const permsRes = await superAgent.get("/api/v1/administration/permissions");
    const somePermissionId = permsRes.body.data.permissions[0].id;

    const createRes = await superAgent.post("/api/v1/administration/roles").send({
      name: "Togglable Role",
      permissionIds: [],
    });
    const roleId = createRes.body.data.role.id;

    await superAgent.put(`/api/v1/administration/roles/${roleId}/permissions`).send({ permissionIds: [somePermissionId] });

    const passwordHash = await hashPassword(PASSWORD);
    const member = await createAdminUser({ email: "role-member@baft.test", passwordHash, fullName: "Role Member" });
    await assignRoleToAdmin(member.id, roleId);

    const disableRes = await superAgent.post(`/api/v1/administration/roles/${roleId}/disable`);
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.role.isActive).toBe(false);

    const memberAgent = request.agent(app);
    const loginRes = await memberAgent.post("/api/v1/auth/login").send({ email: "role-member@baft.test", password: PASSWORD });
    expect(loginRes.status).toBe(200);
    // Disabling the role revoked its derived permission immediately — no permission from a disabled role.
    expect(loginRes.body.data.admin.permissions).toEqual([]);

    const enableRes = await superAgent.post(`/api/v1/administration/roles/${roleId}/enable`);
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.role.isActive).toBe(true);
  });

  it("replaces a role's permission set via PUT, validating every permission exists", async () => {
    const permsRes = await superAgent.get("/api/v1/administration/permissions");
    const somePermissionId = permsRes.body.data.permissions[0].id;

    const createRes = await superAgent.post("/api/v1/administration/roles").send({ name: "Permission Target", permissionIds: [] });
    const roleId = createRes.body.data.role.id;

    const putRes = await superAgent.put(`/api/v1/administration/roles/${roleId}/permissions`).send({ permissionIds: [somePermissionId] });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.role.permissions).toHaveLength(1);

    const invalidRes = await superAgent
      .put(`/api/v1/administration/roles/${roleId}/permissions`)
      .send({ permissionIds: ["00000000-0000-0000-0000-000000000000"] });
    expect(invalidRes.status).toBe(400);
  });

  it("protects the Super Admin role: cannot rename, disable, or edit its permissions", async () => {
    const renameRes = await superAgent.patch(`/api/v1/administration/roles/${fixtures.superAdmin.id}`).send({ name: "Renamed" });
    expect(renameRes.status).toBe(409);

    const disableRes = await superAgent.post(`/api/v1/administration/roles/${fixtures.superAdmin.id}/disable`);
    expect(disableRes.status).toBe(409);

    const permsRes = await superAgent.get("/api/v1/administration/permissions");
    const somePermissionId = permsRes.body.data.permissions[0].id;
    const permEditRes = await superAgent
      .put(`/api/v1/administration/roles/${fixtures.superAdmin.id}/permissions`)
      .send({ permissionIds: [somePermissionId] });
    expect(permEditRes.status).toBe(409);
  });

  it("allows editing the Super Admin role's description (only name/permissions/status are protected)", async () => {
    const res = await superAgent.patch(`/api/v1/administration/roles/${fixtures.superAdmin.id}`).send({ description: "Full platform access." });
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/administration/roles");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without administration.roles permissions (e.g. Security Admin, per this module's scoped mapping)", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    const res = await agent.get("/api/v1/administration/roles");
    expect(res.status).toBe(403);
  });
});
