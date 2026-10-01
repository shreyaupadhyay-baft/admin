import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/adminUser.repository.js", () => import("./fakes/adminUser.repository.fake.js"));
vi.mock("../src/repositories/rbac.repository.js", () => import("./fakes/rbac.repository.fake.js"));
vi.mock("../src/repositories/session.repository.js", () => import("./fakes/session.repository.fake.js"));
vi.mock("../src/repositories/auditLog.repository.js", () => import("./fakes/auditLog.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";
const NEW_ADMIN_PASSWORD = "another-long-password-123";

describe("admin management APIs", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const rootAdmin = await createAdminUser({ email: "root@baft.test", passwordHash, fullName: "Root" });
    await assignRoleToAdmin(rootAdmin.id, fixtures.superAdmin.id);

    superAgent = request.agent(app);
    await superAgent.post("/api/v1/auth/login").send({ email: "root@baft.test", password: PASSWORD });
  });

  it("creates a new admin without leaking the password anywhere in the response", async () => {
    const res = await superAgent
      .post("/api/v1/admins")
      .send({ email: "new-admin@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "New Admin" });

    expect(res.status).toBe(201);
    expect(res.body.data.admin.email).toBe("new-admin@baft.test");
    expect(res.body.data.admin.password).toBeUndefined();
    expect(res.body.data.admin.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(NEW_ADMIN_PASSWORD));
  });

  it("rejects a duplicate email with 409", async () => {
    await superAgent
      .post("/api/v1/admins")
      .send({ email: "dup@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Dup" });

    const res = await superAgent
      .post("/api/v1/admins")
      .send({ email: "dup@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Dup 2" });

    expect(res.status).toBe(409);
  });

  it("updates an admin's profile fields", async () => {
    const createRes = await superAgent
      .post("/api/v1/admins")
      .send({ email: "update-me@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Old Name" });
    const id = createRes.body.data.admin.id;

    const res = await superAgent.patch(`/api/v1/admins/${id}`).send({ fullName: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.admin.fullName).toBe("New Name");
  });

  it("disabling an admin revokes their active session immediately; re-enabling restores access on a fresh login", async () => {
    const createRes = await superAgent
      .post("/api/v1/admins")
      .send({ email: "disable-me@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Disable Me" });
    const id = createRes.body.data.admin.id;

    const targetAgent = request.agent(app);
    await targetAgent.post("/api/v1/auth/login").send({ email: "disable-me@baft.test", password: NEW_ADMIN_PASSWORD });
    expect((await targetAgent.get("/api/v1/auth/me")).status).toBe(200);

    const disableRes = await superAgent.post(`/api/v1/admins/${id}/disable`);
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.admin.isActive).toBe(false);

    expect((await targetAgent.get("/api/v1/auth/me")).status).toBe(401);

    const enableRes = await superAgent.post(`/api/v1/admins/${id}/enable`);
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.admin.isActive).toBe(true);
  });

  it("assigns and removes a role from an admin", async () => {
    const createRes = await superAgent
      .post("/api/v1/admins")
      .send({ email: "role-target@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Role Target" });
    const id = createRes.body.data.admin.id;

    const assignRes = await superAgent.post(`/api/v1/admins/${id}/roles`).send({ roleId: fixtures.auditor.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.admin.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(true);

    const removeRes = await superAgent.delete(`/api/v1/admins/${id}/roles/${fixtures.auditor.id}`);
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.admin.roles.some((r: { name: string }) => r.name === "Auditor")).toBe(false);
  });

  it("returns 404 for a well-formed but non-existent admin id", async () => {
    const res = await superAgent.get("/api/v1/admins/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("rejects a malformed id with 400 instead of a raw query error", async () => {
    const res = await superAgent.get("/api/v1/admins/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("never records a password or session token inside an audit log entry", async () => {
    await superAgent
      .post("/api/v1/admins")
      .send({ email: "audit-check@baft.test", password: NEW_ADMIN_PASSWORD, fullName: "Audit Check" });

    const serialized = JSON.stringify(db.auditLogs);
    expect(serialized).not.toMatch(new RegExp(NEW_ADMIN_PASSWORD));
    expect(serialized).not.toMatch(/baft_admin_(access|refresh)_token/);
  });
});
