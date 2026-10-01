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
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Campaigns + Rewards RBAC matrix, audit, and security", () => {
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

  it("Super Admin: allowed on every campaign and reward operation", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    const campaignRes = await agent.post("/api/v1/campaigns").send({ name: "Matrix", campaignType: "other" });
    expect(campaignRes.status).toBe(201);
    expect((await agent.post(`/api/v1/campaigns/${campaignRes.body.data.campaign.id}/cancel`)).status).toBe(200);

    const rewardRes = await agent.post("/api/v1/rewards").send({ name: "Matrix Reward", rewardType: "points" });
    expect(rewardRes.status).toBe(201);
    expect((await agent.post(`/api/v1/rewards/${rewardRes.body.data.reward.id}/activate`)).status).toBe(200);
  });

  it("Product/Growth Admin: full campaign and reward management", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const campaignRes = await agent.post("/api/v1/campaigns").send({ name: "Growth Campaign", campaignType: "promotional" });
    expect(campaignRes.status).toBe(201);
    await agent.post(`/api/v1/campaigns/${campaignRes.body.data.campaign.id}/schedule`).send({ startAt: new Date().toISOString() });
    expect((await agent.post(`/api/v1/campaigns/${campaignRes.body.data.campaign.id}/activate`)).status).toBe(200);

    const rewardRes = await agent.post("/api/v1/rewards").send({ name: "Growth Reward", rewardType: "bonus" });
    expect(rewardRes.status).toBe(201);
  });

  it("Operations Admin: operational levers only, not create/design", async () => {
    const growthAgent = await loginAsRole("growth2@baft.test", fixtures.productGrowthAdmin.id);
    const campaignRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Ops Target", campaignType: "other" });
    const campaignId = campaignRes.body.data.campaign.id;
    await growthAgent.post(`/api/v1/campaigns/${campaignId}/schedule`).send({ startAt: new Date().toISOString() });

    const opsAgent = await loginAsRole("ops@baft.test", fixtures.operationsAdmin.id);
    expect((await opsAgent.get("/api/v1/campaigns")).status).toBe(200);
    expect((await opsAgent.post(`/api/v1/campaigns/${campaignId}/activate`)).status).toBe(200);
    expect((await opsAgent.post(`/api/v1/campaigns/${campaignId}/cancel`)).status).toBe(200);
    expect((await opsAgent.post("/api/v1/campaigns").send({ name: "X", campaignType: "other" })).status).toBe(403);
  });

  it("Support Admin, Auditor, Risk/Fraud Admin, Engineering Admin: read-only on campaigns and rewards", async () => {
    for (const [email, roleId] of [
      ["support@baft.test", fixtures.supportAdmin.id],
      ["auditor@baft.test", fixtures.auditor.id],
      ["risk@baft.test", fixtures.riskFraudAdmin.id],
      ["eng@baft.test", fixtures.engineeringAdmin.id],
    ] as const) {
      const agent = await loginAsRole(email, roleId);
      expect((await agent.get("/api/v1/campaigns")).status).toBe(200);
      expect((await agent.get("/api/v1/rewards")).status).toBe(200);
      expect((await agent.post("/api/v1/campaigns").send({ name: "X", campaignType: "other" })).status).toBe(403);
      expect((await agent.post("/api/v1/rewards").send({ name: "X", rewardType: "points" })).status).toBe(403);
    }
  });

  it("Security Admin: no campaign or reward access despite the role existing", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    expect((await agent.get("/api/v1/campaigns")).status).toBe(403);
    expect((await agent.get("/api/v1/rewards")).status).toBe(403);
  });

  it("Unauthenticated requests get 401 on every campaign and reward route", async () => {
    expect((await request(app).get("/api/v1/campaigns")).status).toBe(401);
    expect((await request(app).get("/api/v1/rewards")).status).toBe(401);
  });

  it("records CAMPAIGN_CREATED, CAMPAIGN_CANCELLED, REWARD_CREATED, and AUTHORIZATION_DENIED with identifiers", async () => {
    const growthAgent = await loginAsRole("growth3@baft.test", fixtures.productGrowthAdmin.id);
    const campaignRes = await growthAgent.post("/api/v1/campaigns").send({ name: "Audited Campaign", campaignType: "other" });
    const campaignId = campaignRes.body.data.campaign.id;
    await growthAgent.post(`/api/v1/campaigns/${campaignId}/cancel`);

    const rewardRes = await growthAgent.post("/api/v1/rewards").send({ name: "Audited Reward", rewardType: "points" });

    const auditorAgent = await loginAsRole("auditor2@baft.test", fixtures.auditor.id);
    await auditorAgent.post(`/api/v1/rewards/${rewardRes.body.data.reward.id}/activate`);

    const created = db.auditLogs.find((l) => l.action === "CAMPAIGN_CREATED" && l.target_id === campaignId);
    expect(created).toBeDefined();
    expect(created?.actor_admin_id).toBeTruthy();
    expect(created?.request_id).toBeTruthy();

    const cancelled = db.auditLogs.find((l) => l.action === "CAMPAIGN_CANCELLED" && l.target_id === campaignId);
    expect(cancelled).toBeDefined();

    const rewardCreated = db.auditLogs.find((l) => l.action === "REWARD_CREATED");
    expect(rewardCreated).toBeDefined();

    expect(db.auditLogs.some((l) => l.action === "AUTHORIZATION_DENIED")).toBe(true);
  });

  it("never leaks a password hash or session token in a campaign/reward response or audit record", async () => {
    const agent = await loginAsRole("secure-check@baft.test", fixtures.productGrowthAdmin.id);
    const campaignRes = await agent.post("/api/v1/campaigns").send({ name: "Secure Campaign", campaignType: "other" });
    const rewardRes = await agent.post("/api/v1/rewards").send({ name: "Secure Reward", rewardType: "points" });

    const combined = JSON.stringify({ campaignRes: campaignRes.body, rewardRes: rewardRes.body, auditLogs: db.auditLogs });
    expect(combined).not.toMatch(/password_hash|scrypt\$/i);
    expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
  });

  it("does not embed transaction, card, or KYC data in any campaign or reward response", async () => {
    const agent = await loginAsRole("secure-check2@baft.test", fixtures.productGrowthAdmin.id);
    const campaignRes = await agent.post("/api/v1/campaigns").send({
      name: "Field Check",
      campaignType: "other",
      audienceDefinition: { minAccountAgeDays: 30 },
    });
    const rewardRes = await agent.post("/api/v1/rewards").send({ name: "Field Check Reward", rewardType: "cashback" });

    const campaignKeys = Object.keys(campaignRes.body.data.campaign);
    const rewardKeys = Object.keys(rewardRes.body.data.reward);
    for (const forbidden of ["kycDocuments", "cardNumber", "transactionHistory", "beneficiary"]) {
      expect(campaignKeys).not.toContain(forbidden);
      expect(rewardKeys).not.toContain(forbidden);
    }
  });
});
