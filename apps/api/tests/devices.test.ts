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

describe("Devices API", () => {
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

  it("lists devices", async () => {
    const user = await createUser({ email: "owner@customer.test", fullName: "Owner" });
    await createDevice({ userId: user.id, deviceRef: "dev-1", platform: "ios" });
    await createDevice({ userId: user.id, deviceRef: "dev-2", platform: "android" });

    const res = await superAgent.get("/api/v1/devices");
    expect(res.status).toBe(200);
    expect(res.body.data.devices).toHaveLength(2);
  });

  it("gets a single device", async () => {
    const user = await createUser({ email: "owner2@customer.test", fullName: "Owner 2" });
    const device = await createDevice({ userId: user.id, deviceRef: "dev-solo", platform: "web" });

    const res = await superAgent.get(`/api/v1/devices/${device.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.device.deviceRef).toBe("dev-solo");
    expect(res.body.data.device.userId).toBe(user.id);
  });

  it("returns 404 for a nonexistent device", async () => {
    const res = await superAgent.get("/api/v1/devices/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("lists a user's devices via the nested route, reflecting the user/device relationship", async () => {
    const userA = await createUser({ email: "a@customer.test", fullName: "A" });
    const userB = await createUser({ email: "b@customer.test", fullName: "B" });
    await createDevice({ userId: userA.id, deviceRef: "dev-a1", platform: "ios" });
    await createDevice({ userId: userB.id, deviceRef: "dev-b1", platform: "android" });

    const res = await superAgent.get(`/api/v1/users/${userA.id}/devices`);
    expect(res.status).toBe(200);
    expect(res.body.data.devices).toHaveLength(1);
    expect(res.body.data.devices[0].deviceRef).toBe("dev-a1");
  });

  it("updates a device's status via devices.status.update", async () => {
    const user = await createUser({ email: "statusowner@customer.test", fullName: "Status Owner" });
    const device = await createDevice({ userId: user.id, deviceRef: "dev-status", platform: "ios" });

    const res = await superAgent.patch(`/api/v1/devices/${device.id}`).send({ status: "blocked" });
    expect(res.status).toBe(200);
    expect(res.body.data.device.status).toBe("blocked");
  });

  it("relinks a device to a different user via devices.update", async () => {
    const userA = await createUser({ email: "relink-a@customer.test", fullName: "A" });
    const userB = await createUser({ email: "relink-b@customer.test", fullName: "B" });
    const device = await createDevice({ userId: userA.id, deviceRef: "dev-relink", platform: "android" });

    const res = await superAgent.patch(`/api/v1/devices/${device.id}`).send({ userId: userB.id });
    expect(res.status).toBe(200);
    expect(res.body.data.device.userId).toBe(userB.id);
  });

  it("rejects relinking to a nonexistent user with 400", async () => {
    const user = await createUser({ email: "owner3@customer.test", fullName: "Owner 3" });
    const device = await createDevice({ userId: user.id, deviceRef: "dev-badlink", platform: "ios" });

    const res = await superAgent
      .patch(`/api/v1/devices/${device.id}`)
      .send({ userId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
  });

  it("lets Risk/Fraud change device status but not relink it (split permission enforcement on one route)", async () => {
    const agent = await loginAsRole("risk@baft.test", fixtures.riskFraudAdmin.id);
    const userA = await createUser({ email: "risk-a@customer.test", fullName: "A" });
    const userB = await createUser({ email: "risk-b@customer.test", fullName: "B" });
    const device = await createDevice({ userId: userA.id, deviceRef: "dev-risk", platform: "ios" });

    const statusRes = await agent.patch(`/api/v1/devices/${device.id}`).send({ status: "inactive" });
    expect(statusRes.status).toBe(200);

    const relinkRes = await agent.patch(`/api/v1/devices/${device.id}`).send({ userId: userB.id });
    expect(relinkRes.status).toBe(403);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/devices");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without any devices permission", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/devices");
    expect(res.status).toBe(403);
  });

  it("records DEVICE_STATUS_CHANGED and DEVICE_UPDATED audit entries", async () => {
    const userA = await createUser({ email: "audit-a@customer.test", fullName: "A" });
    const userB = await createUser({ email: "audit-b@customer.test", fullName: "B" });
    const device = await createDevice({ userId: userA.id, deviceRef: "dev-audit", platform: "ios" });

    await superAgent.patch(`/api/v1/devices/${device.id}`).send({ status: "blocked" });
    await superAgent.patch(`/api/v1/devices/${device.id}`).send({ userId: userB.id });

    expect(db.auditLogs.some((l) => l.action === "DEVICE_STATUS_CHANGED")).toBe(true);
    expect(db.auditLogs.some((l) => l.action === "DEVICE_UPDATED")).toBe(true);
  });
});
