import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser, setAdminUserActive } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("admin authentication", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;

  beforeEach(() => {
    resetStore();
    fixtures = seedRbacFixtures();
  });

  const createAdmin = async (opts: { active?: boolean; roleId?: string } = {}) => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email: "admin@baft.test", passwordHash, fullName: "Test Admin" });
    if (opts.roleId) await assignRoleToAdmin(admin.id, opts.roleId);
    if (opts.active === false) await setAdminUserActive(admin.id, false);
    return admin;
  };

  it("logs in with valid credentials and sets httpOnly session cookies, never echoing the password", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@baft.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.admin.email).toBe("admin@baft.test");
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("baft_admin_access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("baft_admin_refresh_token="))).toBe(true);
    expect(cookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it("rejects an invalid password with a generic error", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@baft.test", password: "totally-wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the same generic error for an unknown email (no account-existence leak)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@baft.test", password: "whatever-password-1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("refuses login for a disabled admin even with the correct password", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id, active: false });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@baft.test", password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("rejects /auth/me without a session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("logs out and revokes the session so it can no longer be used", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id });
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email: "admin@baft.test", password: PASSWORD });

    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);

    const logoutRes = await agent.post("/api/v1/auth/logout");
    expect(logoutRes.status).toBe(200);

    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("rotates tokens on refresh and keeps the session usable", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id });
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email: "admin@baft.test", password: PASSWORD });

    const refreshRes = await agent.post("/api/v1/auth/refresh");
    expect(refreshRes.status).toBe(200);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);
  });

  it("audits LOGIN_SUCCESS and LOGIN_FAILURE without ever recording the password", async () => {
    await createAdmin({ roleId: fixtures.superAdmin.id });
    await request(app).post("/api/v1/auth/login").send({ email: "admin@baft.test", password: "wrong" });
    await request(app).post("/api/v1/auth/login").send({ email: "admin@baft.test", password: PASSWORD });

    expect(db.auditLogs.some((l) => l.action === "LOGIN_FAILURE")).toBe(true);
    expect(db.auditLogs.some((l) => l.action === "LOGIN_SUCCESS")).toBe(true);
    expect(JSON.stringify(db.auditLogs)).not.toMatch(new RegExp(PASSWORD));
  });
});
