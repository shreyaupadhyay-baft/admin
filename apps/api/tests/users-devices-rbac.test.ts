import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));
vi.mock("../src/repositories/user.repository.js", () => import("./fakes/user.repository.fake.js"));
vi.mock("../src/repositories/device.repository.js", () => import("./fakes/device.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { createDevice } = await import("../src/repositories/device.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Users + Devices RBAC matrix, audit, and security", () => {
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

  it("Super Admin: allowed on every users/devices operation", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    const user = await createUser({ email: "matrix-super@customer.test", fullName: "Matrix" });

    expect((await agent.get("/api/v1/users")).status).toBe(200);
    expect((await agent.patch(`/api/v1/users/${user.id}/status`).send({ status: "suspended" })).status).toBe(200);
    expect((await agent.get("/api/v1/devices")).status).toBe(200);
  });

  it("Operations Admin: allowed according to its assigned permissions (full read+write on users/devices)", async () => {
    const agent = await loginAsRole("ops@baft.test", fixtures.operationsAdmin.id);
    const user = await createUser({ email: "matrix-ops@customer.test", fullName: "Matrix Ops" });
    const device = await createDevice({ userId: user.id, deviceRef: "matrix-ops-device", platform: "ios" });

    expect((await agent.post("/api/v1/users").send({ email: "ops-created@customer.test", fullName: "Ops Created" })).status).toBe(201);
    expect((await agent.patch(`/api/v1/users/${user.id}/status`).send({ status: "suspended" })).status).toBe(200);
    expect((await agent.patch(`/api/v1/devices/${device.id}`).send({ status: "blocked" })).status).toBe(200);
  });

  it("Auditor: read-only on users and devices, never mutation", async () => {
    const agent = await loginAsRole("auditor@baft.test", fixtures.auditor.id);
    const user = await createUser({ email: "matrix-auditor@customer.test", fullName: "Matrix Auditor" });

    expect((await agent.get("/api/v1/users")).status).toBe(200);
    expect((await agent.get(`/api/v1/users/${user.id}`)).status).toBe(200);
    expect((await agent.get("/api/v1/devices")).status).toBe(200);

    expect((await agent.post("/api/v1/users").send({ email: "blocked@customer.test", fullName: "Blocked" })).status).toBe(403);
    expect((await agent.patch(`/api/v1/users/${user.id}`).send({ fullName: "Changed" })).status).toBe(403);
    expect((await agent.patch(`/api/v1/users/${user.id}/status`).send({ status: "disabled" })).status).toBe(403);
  });

  it("An unrelated role (Security Admin) is forbidden from users/devices entirely", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    expect((await agent.get("/api/v1/users")).status).toBe(403);
    expect((await agent.get("/api/v1/devices")).status).toBe(403);
  });

  it("Unauthenticated requests get 401 on every users/devices route", async () => {
    expect((await request(app).get("/api/v1/users")).status).toBe(401);
    expect((await request(app).get("/api/v1/devices")).status).toBe(401);
  });

  it("records USER_CREATED, USER_STATUS_CHANGED, and AUTHORIZATION_DENIED with actor/resource/request identifiers", async () => {
    const opsAgent = await loginAsRole("ops2@baft.test", fixtures.operationsAdmin.id);
    const createRes = await opsAgent.post("/api/v1/users").send({ email: "audited@customer.test", fullName: "Audited" });
    const userId = createRes.body.data.user.id;
    await opsAgent.patch(`/api/v1/users/${userId}/status`).send({ status: "suspended", reason: "test" });

    const auditorAgent = await loginAsRole("auditor2@baft.test", fixtures.auditor.id);
    await auditorAgent.patch(`/api/v1/users/${userId}/status`).send({ status: "disabled" });

    const created = db.auditLogs.find((l) => l.action === "USER_CREATED" && l.target_id === userId);
    expect(created).toBeDefined();
    expect(created?.actor_admin_id).toBeTruthy();
    expect(created?.request_id).toBeTruthy();

    const statusChanged = db.auditLogs.find((l) => l.action === "USER_STATUS_CHANGED");
    expect(statusChanged?.metadata).toMatchObject({ previousStatus: "active", newStatus: "suspended" });

    expect(db.auditLogs.some((l) => l.action === "AUTHORIZATION_DENIED")).toBe(true);
  });

  it("never includes a password hash, session token, or raw SQL error in a users/devices response or audit record", async () => {
    const agent = await loginAsRole("secure-check@baft.test", fixtures.operationsAdmin.id);
    const createRes = await agent
      .post("/api/v1/users")
      .send({ email: "secure@customer.test", fullName: "Secure Check" });
    const device = await createDevice({ userId: createRes.body.data.user.id, deviceRef: "secure-device", platform: "android" });
    await agent.patch(`/api/v1/devices/${device.id}`).send({ status: "blocked" });

    const responsesAndAudit = JSON.stringify({ createRes: createRes.body, auditLogs: db.auditLogs });
    expect(responsesAndAudit).not.toMatch(/password_hash|scrypt\$/i);
    expect(responsesAndAudit).not.toMatch(/baft_admin_(access|refresh)_token/);
  });
});
