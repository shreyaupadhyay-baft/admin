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
const { createAdminUser, setAdminUserActive } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createSession } = await import("../src/repositories/session.repository.js");
const { hashToken } = await import("../src/services/token.service.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Administration: Admins API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;

  const loginAsRole = async (email: string, roleId: string) => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email, passwordHash, fullName: "Test" });
    await assignRoleToAdmin(admin.id, roleId);
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return { agent, admin };
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

  it("creates an admin without leaking the password, and assigns an initial role", async () => {
    const res = await superAgent.post("/api/v1/administration/admins").send({
      email: "new-admin@baft.test",
      password: "another-long-password-123",
      fullName: "New Admin",
      roleIds: [fixtures.auditor.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.admin.email).toBe("new-admin@baft.test");
    expect(res.body.data.admin.password).toBeUndefined();
    expect(res.body.data.admin.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/another-long-password-123/);
  });

  it("rejects a duplicate email with 409", async () => {
    await superAgent.post("/api/v1/administration/admins").send({ email: "dup@baft.test", password: "another-long-password-123", fullName: "Dup" });
    const res = await superAgent.post("/api/v1/administration/admins").send({ email: "dup@baft.test", password: "another-long-password-123", fullName: "Dup2" });
    expect(res.status).toBe(409);
  });

  it("lists admins with search, status filter, role filter, pagination, and safe sorting", async () => {
    await superAgent.post("/api/v1/administration/admins").send({ email: "alice@baft.test", password: "another-long-password-123", fullName: "Alice Alpha" });
    const bobRes = await superAgent.post("/api/v1/administration/admins").send({ email: "bob@baft.test", password: "another-long-password-123", fullName: "Bob Beta" });
    await superAgent.post(`/api/v1/administration/admins/${bobRes.body.data.admin.id}/disable`);

    const searchRes = await superAgent.get("/api/v1/administration/admins?search=Alice");
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.admins).toHaveLength(1);
    expect(searchRes.body.data.admins[0].email).toBe("alice@baft.test");

    const activeRes = await superAgent.get("/api/v1/administration/admins?isActive=false");
    expect(activeRes.body.data.admins.some((a: { email: string }) => a.email === "bob@baft.test")).toBe(true);

    const sortedRes = await superAgent.get("/api/v1/administration/admins?sort=full_name_asc&limit=100");
    const names = sortedRes.body.data.admins.map((a: { fullName: string }) => a.fullName);
    expect(names).toEqual([...names].sort());

    const roleFilterRes = await superAgent.get(`/api/v1/administration/admins?roleId=${fixtures.superAdmin.id}`);
    expect(roleFilterRes.body.data.admins.some((a: { email: string }) => a.email === "root@baft.test")).toBe(true);
    expect(roleFilterRes.body.data.admins.some((a: { email: string }) => a.email === "alice@baft.test")).toBe(false);
  });

  it("rejects an unsafe sort value with 400 (safe sorting)", async () => {
    const res = await superAgent.get("/api/v1/administration/admins?sort=email; DROP TABLE admin_users");
    expect(res.status).toBe(400);
  });

  it("gets an admin's detail with roles, status, timestamps, last login, and session summary", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "detail@baft.test", password: "another-long-password-123", fullName: "Detail" });
    const adminId = createRes.body.data.admin.id;

    await createSession({
      adminUserId: adminId,
      accessTokenHash: hashToken("access-token-1"),
      refreshTokenHash: hashToken("refresh-token-1"),
      accessExpiresAt: new Date(Date.now() + 900_000),
      refreshExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      userAgent: "test-agent",
      ipAddress: "127.0.0.1",
    });

    const res = await superAgent.get(`/api/v1/administration/admins/${adminId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.admin.lastLoginAt).toBeTruthy();
    expect(res.body.data.admin.activeSessionCount).toBe(1);
    expect(res.body.data.admin.password).toBeUndefined();
  });

  it("returns 404 for a nonexistent admin and 400 for a malformed id", async () => {
    expect((await superAgent.get("/api/v1/administration/admins/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await superAgent.get("/api/v1/administration/admins/not-a-uuid")).status).toBe(400);
  });

  it("updates an admin's profile fields", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "update-me@baft.test", password: "another-long-password-123", fullName: "Old Name" });
    const res = await superAgent.patch(`/api/v1/administration/admins/${createRes.body.data.admin.id}`).send({ fullName: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.data.admin.fullName).toBe("New Name");
  });

  it("enables and disables an admin, revoking sessions on disable", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "toggle@baft.test", password: "another-long-password-123", fullName: "Toggle" });
    const adminId = createRes.body.data.admin.id;

    const disableRes = await superAgent.post(`/api/v1/administration/admins/${adminId}/disable`);
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.admin.isActive).toBe(false);

    const enableRes = await superAgent.post(`/api/v1/administration/admins/${adminId}/enable`);
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.admin.isActive).toBe(true);
  });

  it("assigns and removes a role from a different admin", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "role-target@baft.test", password: "another-long-password-123", fullName: "Role Target" });
    const adminId = createRes.body.data.admin.id;

    const assignRes = await superAgent.post(`/api/v1/administration/admins/${adminId}/roles`).send({ roleId: fixtures.auditor.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.admin.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(true);

    const removeRes = await superAgent.delete(`/api/v1/administration/admins/${adminId}/roles/${fixtures.auditor.id}`);
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.admin.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(false);
  });

  it("lists an admin's sessions with safe metadata only, and revokes them", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "sessions@baft.test", password: "another-long-password-123", fullName: "Sessions" });
    const adminId = createRes.body.data.admin.id;

    await createSession({
      adminUserId: adminId,
      accessTokenHash: hashToken("a2"),
      refreshTokenHash: hashToken("r2"),
      accessExpiresAt: new Date(Date.now() + 900_000),
      refreshExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      userAgent: "agent-2",
      ipAddress: "10.0.0.1",
    });

    const listRes = await superAgent.get(`/api/v1/administration/admins/${adminId}/sessions`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.sessions).toHaveLength(1);
    expect(listRes.body.data.sessions[0]).not.toHaveProperty("accessTokenHash");
    expect(listRes.body.data.sessions[0]).not.toHaveProperty("refreshTokenHash");
    expect(JSON.stringify(listRes.body)).not.toMatch(/access_token_hash|refresh_token_hash/i);

    const revokeRes = await superAgent.post(`/api/v1/administration/admins/${adminId}/revoke-sessions`);
    expect(revokeRes.status).toBe(200);

    const afterRevoke = await superAgent.get(`/api/v1/administration/admins/${adminId}/sessions`);
    expect(afterRevoke.body.data.sessions[0].isActive).toBe(false);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/administration/admins");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without administration.admins permissions", async () => {
    const { agent } = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/administration/admins");
    expect(res.status).toBe(403);
  });

  it("never leaks a password hash or session token in any admin response or audit record", async () => {
    const createRes = await superAgent.post("/api/v1/administration/admins").send({ email: "secure-check@baft.test", password: "another-long-password-123", fullName: "Secure Check" });
    const combined = JSON.stringify({ createRes: createRes.body, auditLogs: db.auditLogs });
    expect(combined).not.toMatch(/password_hash|scrypt\$/i);
    expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
  });
});
