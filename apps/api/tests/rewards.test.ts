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

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser, updateUserStatus } = await import("../src/repositories/user.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Rewards API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let growthAgent: ReturnType<typeof request.agent>;

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
    const growth = await createAdminUser({ email: "growth@baft.test", passwordHash, fullName: "Growth" });
    await assignRoleToAdmin(growth.id, fixtures.productGrowthAdmin.id);

    growthAgent = request.agent(app);
    await growthAgent.post("/api/v1/auth/login").send({ email: "growth@baft.test", password: PASSWORD });
  });

  it("creates a reward rule in draft status", async () => {
    const res = await growthAgent.post("/api/v1/rewards").send({
      name: "Welcome Cashback",
      rewardType: "cashback",
      ruleDefinition: { combinator: "AND", conditions: [{ field: "status", operator: "eq", value: "active" }] },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.reward.status).toBe("draft");
  });

  it("rejects invalid input with 400", async () => {
    const res = await growthAgent.post("/api/v1/rewards").send({ name: "", rewardType: "not-a-type" });
    expect(res.status).toBe(400);
  });

  it("walks the full lifecycle: draft -> active -> paused -> active -> expired", async () => {
    const createRes = await growthAgent.post("/api/v1/rewards").send({ name: "Lifecycle Reward", rewardType: "points" });
    const rewardId = createRes.body.data.reward.id;

    expect((await growthAgent.post(`/api/v1/rewards/${rewardId}/activate`)).body.data.reward.status).toBe("active");
    expect((await growthAgent.post(`/api/v1/rewards/${rewardId}/pause`)).body.data.reward.status).toBe("paused");
    expect((await growthAgent.post(`/api/v1/rewards/${rewardId}/resume`)).body.data.reward.status).toBe("active");
    expect((await growthAgent.post(`/api/v1/rewards/${rewardId}/expire`)).body.data.reward.status).toBe("expired");
  });

  it("rejects illegal transitions with 409", async () => {
    const createRes = await growthAgent.post("/api/v1/rewards").send({ name: "IllegalTransition", rewardType: "bonus" });
    const rewardId = createRes.body.data.reward.id;

    const pauseFromDraft = await growthAgent.post(`/api/v1/rewards/${rewardId}/pause`);
    expect(pauseFromDraft.status).toBe(409);
    expect(pauseFromDraft.body.error.code).toBe("INVALID_TRANSITION");

    const resumeFromDraft = await growthAgent.post(`/api/v1/rewards/${rewardId}/resume`);
    expect(resumeFromDraft.status).toBe(409);
  });

  it("cancels a reward from draft, active, or paused", async () => {
    const createRes = await growthAgent.post("/api/v1/rewards").send({ name: "CancelMe", rewardType: "voucher" });
    const rewardId = createRes.body.data.reward.id;

    const cancelRes = await growthAgent.post(`/api/v1/rewards/${rewardId}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.reward.status).toBe("cancelled");
  });

  it("evaluates entitlement against a user's status without creating any grant record", async () => {
    const eligibleUser = await createUser({ email: "eligible@customer.test", fullName: "Eligible" });
    const ineligibleUser = await createUser({ email: "ineligible@customer.test", fullName: "Ineligible" });
    await updateUserStatus(ineligibleUser.id, "suspended");

    const createRes = await growthAgent.post("/api/v1/rewards").send({
      name: "Active Users Only",
      rewardType: "points",
      ruleDefinition: { combinator: "AND", conditions: [{ field: "status", operator: "eq", value: "active" }] },
    });
    const rewardId = createRes.body.data.reward.id;
    await growthAgent.post(`/api/v1/rewards/${rewardId}/activate`);

    const eligibleRes = await growthAgent.get(`/api/v1/rewards/${rewardId}/entitlement?userId=${eligibleUser.id}`);
    expect(eligibleRes.status).toBe(200);
    expect(eligibleRes.body.data.entitlement.eligible).toBe(true);
    expect(eligibleRes.body.data.entitlement.entitled).toBe(true);
    expect(eligibleRes.body.data.entitlement.evaluatedConditions[0]).toMatchObject({
      field: "status",
      operator: "eq",
      value: "active",
      actual: "active",
      passed: true,
    });

    const ineligibleRes = await growthAgent.get(`/api/v1/rewards/${rewardId}/entitlement?userId=${ineligibleUser.id}`);
    expect(ineligibleRes.status).toBe(200);
    expect(ineligibleRes.body.data.entitlement.eligible).toBe(false);
    expect(ineligibleRes.body.data.entitlement.entitled).toBe(false);
    expect(ineligibleRes.body.data.entitlement.evaluatedConditions[0]).toMatchObject({
      actual: "suspended",
      passed: false,
    });
  });

  it("returns a reward as not entitled while still in draft status, even if eligible by rule", async () => {
    const user = await createUser({ email: "draft-check@customer.test", fullName: "Draft Check" });
    const createRes = await growthAgent.post("/api/v1/rewards").send({
      name: "Draft Reward",
      rewardType: "points",
      ruleDefinition: { conditions: [{ field: "status", operator: "eq", value: "active" }] },
    });
    const rewardId = createRes.body.data.reward.id;

    const res = await growthAgent.get(`/api/v1/rewards/${rewardId}/entitlement?userId=${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.entitlement.eligible).toBe(true);
    expect(res.body.data.entitlement.entitled).toBe(false);
  });

  it("returns 404 when checking entitlement for a nonexistent user", async () => {
    const createRes = await growthAgent.post("/api/v1/rewards").send({ name: "NoUser", rewardType: "points" });
    const rewardId = createRes.body.data.reward.id;

    const res = await growthAgent.get(
      `/api/v1/rewards/${rewardId}/entitlement?userId=00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(404);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/rewards");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without the specific reward permission needed", async () => {
    const agent = await loginAsRole("auditor@baft.test", fixtures.auditor.id);
    expect((await agent.get("/api/v1/rewards")).status).toBe(200);
    expect((await agent.post("/api/v1/rewards").send({ name: "X", rewardType: "points" })).status).toBe(403);
  });
});
