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
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Users API", () => {
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

  it("creates a user", async () => {
    const res = await superAgent
      .post("/api/v1/users")
      .send({ email: "jane@customer.test", fullName: "Jane Doe", phoneNumber: "+15551234567" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("jane@customer.test");
    expect(res.body.data.user.status).toBe("active");
  });

  it("rejects invalid input with 400", async () => {
    const res = await superAgent.post("/api/v1/users").send({ email: "not-an-email", fullName: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email with 409", async () => {
    await superAgent.post("/api/v1/users").send({ email: "dup@customer.test", fullName: "Dup" });
    const res = await superAgent.post("/api/v1/users").send({ email: "dup@customer.test", fullName: "Dup 2" });
    expect(res.status).toBe(409);
  });

  it("lists users with pagination", async () => {
    await createUser({ email: "list-a@customer.test", fullName: "A" });
    await createUser({ email: "list-b@customer.test", fullName: "B" });

    const res = await superAgent.get("/api/v1/users?limit=1&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it("filters the list by search term", async () => {
    await createUser({ email: "findme@customer.test", fullName: "Findable Person" });
    await createUser({ email: "other@customer.test", fullName: "Someone Else" });

    const res = await superAgent.get("/api/v1/users?search=Findable");
    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0].email).toBe("findme@customer.test");
  });

  it("gets a single user", async () => {
    const user = await createUser({ email: "single@customer.test", fullName: "Single" });
    const res = await superAgent.get(`/api/v1/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  it("returns 404 for a nonexistent user", async () => {
    const res = await superAgent.get("/api/v1/users/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed user id (object-level authorization guard)", async () => {
    const res = await superAgent.get("/api/v1/users/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("updates a user's profile via users.update", async () => {
    const user = await createUser({ email: "profile@customer.test", fullName: "Old Name" });
    const res = await superAgent.patch(`/api/v1/users/${user.id}`).send({ fullName: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.fullName).toBe("New Name");
  });

  it("changes status only via the dedicated status endpoint, never through the profile PATCH", async () => {
    const user = await createUser({ email: "status@customer.test", fullName: "Status Case" });

    const statusRes = await superAgent
      .patch(`/api/v1/users/${user.id}/status`)
      .send({ status: "suspended", reason: "fraud review" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.user.status).toBe("suspended");

    const profileAttempt = await superAgent.patch(`/api/v1/users/${user.id}`).send({ status: "disabled" });
    expect(profileAttempt.status).toBe(400);

    const stillSuspended = await superAgent.get(`/api/v1/users/${user.id}`);
    expect(stillSuspended.body.data.user.status).toBe("suspended");
  });

  it("hides the status field for a role that lacks users.status.read", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const user = await createUser({ email: "hidden-status@customer.test", fullName: "Hidden" });

    const res = await agent.get(`/api/v1/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBeUndefined();
  });

  it("returns a user overview with profile, status, devices, and an explicit external-reference boundary", async () => {
    const user = await createUser({ email: "overview@customer.test", fullName: "Overview User" });
    await createDevice({ userId: user.id, deviceRef: "device-123", platform: "ios" });

    const res = await superAgent.get(`/api/v1/users/${user.id}/overview`);
    expect(res.status).toBe(200);
    expect(res.body.data.overview.profile.email).toBe("overview@customer.test");
    expect(res.body.data.overview.status).toBe("active");
    expect(res.body.data.overview.devices).toHaveLength(1);
    expect(res.body.data.overview.externalReference).toHaveProperty("note");
    // The boundary note is allowed to *name* KYC/transactions/etc. to explain
    // what's excluded — what must never appear is actual data under those keys.
    const overviewKeys = Object.keys(res.body.data.overview);
    expect(overviewKeys).not.toEqual(
      expect.arrayContaining(["kycDocuments", "transactions", "cards", "beneficiaries"]),
    );
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without any users permission", async () => {
    const agent = await loginAsRole("secadmin@baft.test", fixtures.securityAdmin.id);
    const res = await agent.get("/api/v1/users");
    expect(res.status).toBe(403);
  });

  it("never leaks a session cookie value or a raw database error in a response", async () => {
    const res = await superAgent.get("/api/v1/users/not-a-uuid");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/baft_admin_(access|refresh)_token/);
    expect(JSON.stringify(res.body)).not.toMatch(/relation .* does not exist|syntax error/i);
  });
});
