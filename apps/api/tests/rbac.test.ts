import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser, setAdminUserActive } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin, findRoleByName } = await import("../src/repositories/rbac.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("RBAC authorization", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;

  beforeEach(() => {
    resetStore();
    fixtures = seedRbacFixtures();
  });

  const makeAdmin = async (email: string, roleId?: string, active = true) => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email, passwordHash, fullName: "Test" });
    if (roleId) await assignRoleToAdmin(admin.id, roleId);
    if (!active) await setAdminUserActive(admin.id, false);
    return admin;
  };

  const loginAs = async (email: string) => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
    return agent;
  };

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/v1/admins");
    expect(res.status).toBe(401);
  });

  it("allows a Super Admin to access authorized administrative functions", async () => {
    await makeAdmin("super@baft.test", fixtures.superAdmin.id);
    const agent = await loginAs("super@baft.test");

    const res = await agent.get("/api/v1/admins");
    expect(res.status).toBe(200);
  });

  it("returns 403 when the admin's roles don't grant the required permission", async () => {
    const opsRole = await findRoleByName("Operations Admin");
    await makeAdmin("ops@baft.test", opsRole?.id);
    const agent = await loginAs("ops@baft.test");

    const res = await agent.get("/api/v1/admins");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("lets the Auditor read but never mutate", async () => {
    await makeAdmin("auditor@baft.test", fixtures.auditor.id);
    const agent = await loginAs("auditor@baft.test");

    expect((await agent.get("/api/v1/admins")).status).toBe(200);
    expect((await agent.get("/api/v1/roles")).status).toBe(200);

    const mutateRes = await agent.post("/api/v1/admins").send({
      email: "blocked@baft.test",
      password: "another-long-password-123",
      fullName: "Blocked",
    });
    expect(mutateRes.status).toBe(403);
  });

  it("blocks a disabled admin from protected APIs even with a previously valid session", async () => {
    const admin = await makeAdmin("todisable@baft.test", fixtures.superAdmin.id);
    const agent = await loginAs("todisable@baft.test");

    expect((await agent.get("/api/v1/admins")).status).toBe(200);

    await setAdminUserActive(admin.id, false);

    expect((await agent.get("/api/v1/admins")).status).toBe(401);
  });

  it("records an AUTHORIZATION_DENIED audit entry on a 403", async () => {
    const opsRole = await findRoleByName("Operations Admin");
    await makeAdmin("ops2@baft.test", opsRole?.id);
    const agent = await loginAs("ops2@baft.test");

    await agent.get("/api/v1/admins");

    expect(db.auditLogs.some((l) => l.action === "AUTHORIZATION_DENIED")).toBe(true);
  });
});
