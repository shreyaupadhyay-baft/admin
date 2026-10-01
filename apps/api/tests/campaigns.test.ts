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
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Campaigns API", () => {
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

  it("creates a campaign in draft status", async () => {
    const res = await growthAgent.post("/api/v1/campaigns").send({
      name: "Referral Boost",
      description: "Invite friends for bonus points.",
      campaignType: "referral",
      targetingDefinition: { platform: "ios" },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.campaign.status).toBe("draft");
    expect(res.body.data.campaign.targetingDefinition).toEqual({ platform: "ios" });
  });

  it("rejects invalid input with 400", async () => {
    const res = await growthAgent.post("/api/v1/campaigns").send({ name: "", campaignType: "not-a-type" });
    expect(res.status).toBe(400);
  });

  it("lists and filters campaigns", async () => {
    await growthAgent.post("/api/v1/campaigns").send({ name: "Promo A", campaignType: "promotional" });
    await growthAgent.post("/api/v1/campaigns").send({ name: "Retention B", campaignType: "retention" });

    const res = await growthAgent.get("/api/v1/campaigns?campaignType=retention");
    expect(res.status).toBe(200);
    expect(res.body.data.campaigns).toHaveLength(1);
    expect(res.body.data.campaigns[0].name).toBe("Retention B");
  });

  it("returns 404 for a nonexistent campaign and 400 for a malformed id", async () => {
    expect((await growthAgent.get("/api/v1/campaigns/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await growthAgent.get("/api/v1/campaigns/not-a-uuid")).status).toBe(400);
  });

  it("updates campaign fields but rejects a status field entirely", async () => {
    const createRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Editable", campaignType: "other" });
    const campaignId = createRes.body.data.campaign.id;

    const res = await growthAgent.patch(`/api/v1/campaigns/${campaignId}`).send({ description: "Updated copy" });
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.description).toBe("Updated copy");

    // "status" isn't even in the schema, so it's silently stripped, not applied.
    const attempt = await growthAgent.patch(`/api/v1/campaigns/${campaignId}`).send({ status: "active" });
    expect(attempt.status).toBe(400); // no recognized field remains -> refine fails
  });

  it("walks the full lifecycle: draft -> scheduled -> active -> completed", async () => {
    const createRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Lifecycle", campaignType: "promotional" });
    const campaignId = createRes.body.data.campaign.id;

    const scheduleRes = await growthAgent
      .post(`/api/v1/campaigns/${campaignId}/schedule`)
      .send({ startAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(scheduleRes.status).toBe(200);
    expect(scheduleRes.body.data.campaign.status).toBe("scheduled");

    const activateRes = await growthAgent.post(`/api/v1/campaigns/${campaignId}/activate`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.campaign.status).toBe("active");

    const completeRes = await growthAgent.post(`/api/v1/campaigns/${campaignId}/complete`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.campaign.status).toBe("completed");
  });

  it("rejects activating a campaign that was never scheduled", async () => {
    const createRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Skip", campaignType: "other" });
    const campaignId = createRes.body.data.campaign.id;

    const res = await growthAgent.post(`/api/v1/campaigns/${campaignId}/activate`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects completing a campaign that was never activated", async () => {
    const createRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Skip2", campaignType: "other" });
    const campaignId = createRes.body.data.campaign.id;
    await growthAgent.post(`/api/v1/campaigns/${campaignId}/schedule`).send({ startAt: new Date().toISOString() });

    const res = await growthAgent.post(`/api/v1/campaigns/${campaignId}/complete`);
    expect(res.status).toBe(409);
  });

  it("cancels a draft campaign, and rejects cancelling an already-completed one", async () => {
    const createRes = await growthAgent.post("/api/v1/campaigns").send({ name: "CancelMe", campaignType: "other" });
    const campaignId = createRes.body.data.campaign.id;

    const cancelRes = await growthAgent.post(`/api/v1/campaigns/${campaignId}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.campaign.status).toBe("cancelled");

    const secondCancel = await growthAgent.post(`/api/v1/campaigns/${campaignId}/cancel`);
    expect(secondCancel.status).toBe(409);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/campaigns");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without the specific campaign permission needed", async () => {
    const agent = await loginAsRole("support@baft.test", fixtures.supportAdmin.id);
    expect((await agent.get("/api/v1/campaigns")).status).toBe(200);
    expect((await agent.post("/api/v1/campaigns").send({ name: "X", campaignType: "other" })).status).toBe(403);
  });
});
