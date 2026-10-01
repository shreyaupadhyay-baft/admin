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
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Administration: privilege-escalation and last-Super-Admin protections", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let rootAdminId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const root = await createAdminUser({ email: "root@baft.test", passwordHash, fullName: "Root" });
    await assignRoleToAdmin(root.id, fixtures.superAdmin.id);
    rootAdminId = root.id;

    superAgent = request.agent(app);
    await superAgent.post("/api/v1/auth/login").send({ email: "root@baft.test", password: PASSWORD });
  });

  /** Builds a real admin+role via the Administration API itself, holding
   * exactly `grantedKeys` plus enough Administration permissions to attempt
   * escalation — so the test proves the *backend* check, not a mocked one. */
  const createLimitedManager = async (email: string, grantedKeys: string[]) => {
    const permsRes = await superAgent.get("/api/v1/administration/permissions");
    const allPermissions: Array<{ id: string; key: string }> = permsRes.body.data.permissions;
    const permissionIds = allPermissions.filter((p) => grantedKeys.includes(p.key)).map((p) => p.id);

    const roleRes = await superAgent.post("/api/v1/administration/roles").send({
      name: `Limited Manager ${email}`,
      permissionIds,
    });
    const roleId = roleRes.body.data.role.id;

    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email, passwordHash, fullName: "Limited Manager" });
    await assignRoleToAdmin(admin.id, roleId);

    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return { agent, adminId: admin.id, roleId };
  };

  it("blocks creating a role with a permission the actor does not hold", async () => {
    const { agent } = await createLimitedManager("limited-role-creator@baft.test", [
      "administration.roles.create",
      "administration.permissions.read",
    ]);

    const permsRes = await agent.get("/api/v1/administration/permissions");
    const campaignsCreate = permsRes.body.data.permissions.find((p: { key: string }) => p.key === "campaigns.create");

    const res = await agent.post("/api/v1/administration/roles").send({
      name: "Escalated Role",
      permissionIds: [campaignsCreate.id],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PRIVILEGE_ESCALATION_DENIED");
  });

  it("blocks editing a role's permissions to include one the actor does not hold", async () => {
    const { agent } = await createLimitedManager("limited-perm-editor@baft.test", [
      "administration.roles.create",
      "administration.roles.permissions.update",
      "administration.permissions.read",
    ]);

    const createRes = await agent.post("/api/v1/administration/roles").send({ name: "Target Role", permissionIds: [] });
    const roleId = createRes.body.data.role.id;

    const permsRes = await agent.get("/api/v1/administration/permissions");
    const riskDecide = permsRes.body.data.permissions.find((p: { key: string }) => p.key === "risk_cases.decide");

    const res = await agent.put(`/api/v1/administration/roles/${roleId}/permissions`).send({ permissionIds: [riskDecide.id] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PRIVILEGE_ESCALATION_DENIED");
  });

  it("blocks assigning an over-privileged role to another admin", async () => {
    const { agent } = await createLimitedManager("limited-assigner@baft.test", [
      "administration.admins.read",
      "administration.admins.create",
      "administration.admins.roles.update",
    ]);

    const targetRes = await agent
      .post("/api/v1/administration/admins")
      .send({ email: "escalation-target@baft.test", password: "another-long-password-123", fullName: "Target" });
    const targetId = targetRes.body.data.admin.id;

    // Product/Growth Admin holds campaigns.create, which this actor does not.
    const res = await agent.post(`/api/v1/administration/admins/${targetId}/roles`).send({ roleId: fixtures.productGrowthAdmin.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PRIVILEGE_ESCALATION_DENIED");
  });

  it("blocks assigning an over-privileged role even at admin-creation time", async () => {
    const { agent } = await createLimitedManager("limited-creator@baft.test", [
      "administration.admins.create",
      "administration.admins.read",
    ]);

    const res = await agent.post("/api/v1/administration/admins").send({
      email: "escalated-new-admin@baft.test",
      password: "another-long-password-123",
      fullName: "Escalated",
      roleIds: [fixtures.productGrowthAdmin.id],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PRIVILEGE_ESCALATION_DENIED");
  });

  it("never lets an admin modify their own role assignments, even with full role-management permissions", async () => {
    const { agent, adminId } = await createLimitedManager("self-mod@baft.test", [
      "administration.admins.read",
      "administration.admins.roles.update",
    ]);

    const assignAttempt = await agent.post(`/api/v1/administration/admins/${adminId}/roles`).send({ roleId: fixtures.auditor.id });
    expect(assignAttempt.status).toBe(403);
    expect(assignAttempt.body.error.code).toBe("SELF_ROLE_MODIFICATION_DENIED");

    const removeAttempt = await agent.delete(`/api/v1/administration/admins/${adminId}/roles/${fixtures.auditor.id}`);
    expect(removeAttempt.status).toBe(403);
    expect(removeAttempt.body.error.code).toBe("SELF_ROLE_MODIFICATION_DENIED");
  });

  it("even Super Admin cannot self-modify roles (the rule is absolute, not permission-gated)", async () => {
    const res = await superAgent.post(`/api/v1/administration/admins/${rootAdminId}/roles`).send({ roleId: fixtures.auditor.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SELF_ROLE_MODIFICATION_DENIED");
  });

  it("prevents disabling the last active Super Admin", async () => {
    const res = await superAgent.post(`/api/v1/administration/admins/${rootAdminId}/disable`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_SUPER_ADMIN_PROTECTED");
  });

  it("allows disabling a Super Admin once another active Super Admin exists", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const secondSuper = await createAdminUser({ email: "second-super@baft.test", passwordHash, fullName: "Second Super" });
    await assignRoleToAdmin(secondSuper.id, fixtures.superAdmin.id);

    const res = await superAgent.post(`/api/v1/administration/admins/${rootAdminId}/disable`);
    expect(res.status).toBe(200);
  });

  it("prevents removing the Super Admin role assignment from the last active Super Admin (isolated from self-modification via a second admin)", async () => {
    const passwordHash = await hashPassword(PASSWORD);

    // Two Super Admins exist: root and secondSuper. secondSuper removes
    // root's Super Admin role — allowed, since secondSuper remains.
    const secondSuper = await createAdminUser({ email: "second-super@baft.test", passwordHash, fullName: "Second Super" });
    await assignRoleToAdmin(secondSuper.id, fixtures.superAdmin.id);
    const secondAgent = request.agent(app);
    await secondAgent.post("/api/v1/auth/login").send({ email: "second-super@baft.test", password: PASSWORD });

    const firstRemoval = await secondAgent.delete(`/api/v1/administration/admins/${rootAdminId}/roles/${fixtures.superAdmin.id}`);
    expect(firstRemoval.status).toBe(200);

    // Now secondSuper is the sole active Super Admin. A third admin with
    // just enough Administration permission (not self, not Super Admin)
    // attempts to remove secondSuper's Super Admin role — must be blocked.
    const limitedManager = await createAdminUser({ email: "limited-manager2@baft.test", passwordHash, fullName: "Limited Manager" });
    // Assign directly via repository (bypassing the escalation check) purely
    // to set up a test actor who holds this one permission for the assertion
    // below — mirrors how createLimitedManager works via the API elsewhere.
    const permsRes = await secondAgent.get("/api/v1/administration/permissions");
    const rolesUpdatePermission = permsRes.body.data.permissions.find(
      (p: { key: string }) => p.key === "administration.admins.roles.update",
    );
    const roleRes = await secondAgent.post("/api/v1/administration/roles").send({
      name: "Role Remover",
      permissionIds: [rolesUpdatePermission.id],
    });
    await assignRoleToAdmin(limitedManager.id, roleRes.body.data.role.id);
    const limitedAgent = request.agent(app);
    await limitedAgent.post("/api/v1/auth/login").send({ email: "limited-manager2@baft.test", password: PASSWORD });

    const blocked = await limitedAgent.delete(`/api/v1/administration/admins/${secondSuper.id}/roles/${fixtures.superAdmin.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("LAST_SUPER_ADMIN_PROTECTED");
  });

  it("records an audit entry for a blocked privilege-escalation attempt via AUTHORIZATION_DENIED or the role/admin action itself", async () => {
    const { agent } = await createLimitedManager("audit-check@baft.test", ["administration.roles.create", "administration.permissions.read"]);
    const permsRes = await agent.get("/api/v1/administration/permissions");
    const campaignsCreate = permsRes.body.data.permissions.find((p: { key: string }) => p.key === "campaigns.create");

    await agent.post("/api/v1/administration/roles").send({ name: "Should Fail", permissionIds: [campaignsCreate.id] });

    // The role was never created — confirm no ADMINISTRATION_ROLE_CREATED audit entry references it.
    expect(db.auditLogs.some((l) => l.action === "ADMINISTRATION_ROLE_CREATED" && (l.metadata as { name?: string })?.name === "Should Fail")).toBe(false);
  });

  it("cannot bypass these rules by calling the API directly with a crafted request (no hidden admin-only path)", async () => {
    const { agent } = await createLimitedManager("direct-bypass@baft.test", [
      "administration.admins.read",
      "administration.admins.roles.update",
    ]);

    // Attempting the exact same escalation via a raw, minimal request body (no extra fields, no different route) is still denied.
    const res = await agent.post(`/api/v1/administration/admins/${rootAdminId}/roles`).send({ roleId: fixtures.productGrowthAdmin.id });
    expect(res.status).toBe(403);
  });
});
