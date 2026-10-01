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
vi.mock("../src/repositories/approval.repository.js", () => import("./fakes/approval.repository.fake.js"));
vi.mock("../src/repositories/approvalEvent.repository.js", () => import("./fakes/approvalEvent.repository.fake.js"));
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));
vi.mock("../src/repositories/search.repository.js", () => import("./fakes/search.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin, createRole, setRolePermissions } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { createDevice } = await import("../src/repositories/device.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

const login = async (email: string) => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return agent;
};

describe("Global Search API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let customerId: string;
  let deviceId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const superA = await createAdminUser({ email: "super-a@baft.test", passwordHash, fullName: "Super A" });
    await assignRoleToAdmin(superA.id, fixtures.superAdmin.id);
    superAgent = await login("super-a@baft.test");

    const customer = await createUser({ email: "zephyr-customer@customer.test", fullName: "Zephyr Customer" });
    customerId = customer.id;

    const device = await createDevice({ userId: customerId, deviceRef: "ZEPHYR-DEVICE-001", platform: "ios" });
    deviceId = device.id;

    await superAgent.post("/api/v1/support/cases").send({
      userId: customerId, subject: "Zephyr cannot log in", description: "x", category: "account", priority: "medium",
    });
    await superAgent.post("/api/v1/support/app-issues").send({
      source: "USER_REPORTED", title: "Zephyr crash on launch", description: "x", userId: customerId,
    });
    await superAgent.post("/api/v1/campaigns").send({ name: "Zephyr Spring Promo", campaignType: "promotional" });
    await superAgent.post("/api/v1/rewards").send({ name: "Zephyr Cashback", rewardType: "cashback" });
    await superAgent.post("/api/v1/risk/cases").send({
      title: "Zephyr suspicious login", category: "authentication_security", severity: "high", userId: customerId,
    });
    await superAgent.post("/api/v1/security/cases").send({
      title: "Zephyr account takeover", category: "account", severity: "high", userId: customerId, summary: "x", source: "manual",
    });
  });

  describe("Core behavior", () => {
    it("an authenticated admin can search", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      expect(res.status).toBe(200);
      expect(res.body.data.query).toBe("Zephyr");
    });

    it("rejects unauthenticated requests with 401", async () => {
      expect((await request(app).get("/api/v1/search?q=Zephyr")).status).toBe(401);
    });

    it("rejects an empty or whitespace-only query with 400", async () => {
      expect((await superAgent.get("/api/v1/search?q=")).status).toBe(400);
      expect((await superAgent.get("/api/v1/search?q=%20%20")).status).toBe(400);
      expect((await superAgent.get("/api/v1/search")).status).toBe(400);
    });

    it("matches partially and case-insensitively", async () => {
      const res = await superAgent.get("/api/v1/search?q=zEpHyR");
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
    });

    it("returns cross-resource results together for a shared search term", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      const types = new Set(res.body.data.results.map((r) => r.type));
      expect(types.size).toBeGreaterThan(1);
    });

    it("paginates deterministically", async () => {
      const page1 = await superAgent.get("/api/v1/search?q=Zephyr&limit=2&page=1");
      const page2 = await superAgent.get("/api/v1/search?q=Zephyr&limit=2&page=2");
      expect(page1.body.data.results).toHaveLength(2);
      expect(page1.body.meta.page).toBe(1);
      expect(page1.body.meta.limit).toBe(2);
      expect(page1.body.meta.hasNext).toBe(true);

      const page1Ids = page1.body.data.results.map((r) => r.id);
      const page2Ids = page2.body.data.results.map((r) => r.id);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });

    it("orders results deterministically: exact id match ranks first", async () => {
      const res = await superAgent.get(`/api/v1/search?q=${customerId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.results[0].id).toBe(customerId);
      expect(res.body.data.results[0].type).toBe("user");
    });

    it("produces the same ordering across repeated identical requests", async () => {
      const first = await superAgent.get("/api/v1/search?q=Zephyr&limit=50");
      const second = await superAgent.get("/api/v1/search?q=Zephyr&limit=50");
      expect(first.body.data.results.map((r) => r.id)).toEqual(second.body.data.results.map((r) => r.id));
    });
  });

  describe("RBAC per resource type", () => {
    const rolelessAgent = async () => {
      const strippedRole = await createRole({ name: "No Search Access", description: "" });
      await setRolePermissions(strippedRole.id, []);
      const passwordHash = await hashPassword(PASSWORD);
      const admin = await createAdminUser({ email: `stripped-${Date.now()}@baft.test`, passwordHash, fullName: "Stripped" });
      await assignRoleToAdmin(admin.id, strippedRole.id);
      return login(admin.email);
    };

    it("User results appear when the admin holds users.read", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      expect(res.body.data.results.some((r) => r.type === "user")).toBe(true);
    });

    it("User results do NOT appear without users.read", async () => {
      const agent = await rolelessAgent();
      const res = await agent.get("/api/v1/search?q=Zephyr");
      expect(res.status).toBe(200);
      expect(res.body.data.results.some((r) => r.type === "user")).toBe(false);
    });

    it("Support Case results respect support_cases.read", async () => {
      const agent = await rolelessAgent();
      const withAccess = await superAgent.get("/api/v1/search?q=Zephyr");
      const withoutAccess = await agent.get("/api/v1/search?q=Zephyr");
      expect(withAccess.body.data.results.some((r) => r.type === "support_case")).toBe(true);
      expect(withoutAccess.body.data.results.some((r) => r.type === "support_case")).toBe(false);
    });

    it("Risk Case results respect risk_cases.read", async () => {
      const agent = await rolelessAgent();
      const withAccess = await superAgent.get("/api/v1/search?q=Zephyr");
      const withoutAccess = await agent.get("/api/v1/search?q=Zephyr");
      expect(withAccess.body.data.results.some((r) => r.type === "risk_case")).toBe(true);
      expect(withoutAccess.body.data.results.some((r) => r.type === "risk_case")).toBe(false);
    });

    it("Security Case results respect security_cases.read", async () => {
      const agent = await rolelessAgent();
      const withAccess = await superAgent.get("/api/v1/search?q=Zephyr");
      const withoutAccess = await agent.get("/api/v1/search?q=Zephyr");
      expect(withAccess.body.data.results.some((r) => r.type === "security_case")).toBe(true);
      expect(withoutAccess.body.data.results.some((r) => r.type === "security_case")).toBe(false);
    });

    it("Admin results respect administration.admins.read", async () => {
      const agent = await rolelessAgent();
      const withAccess = await superAgent.get(`/api/v1/search?q=${fixtures.superAdmin.name}`);
      const withoutAccess = await agent.get("/api/v1/search?q=Super A");
      expect(withAccess.status).toBe(200);
      expect(withoutAccess.body.data.results.some((r) => r.type === "admin_user")).toBe(false);
    });

    it("Approval results respect approvals.read", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user", resourceType: "user", resourceId: customerId, reason: "x",
      });
      const approvalNumber = createRes.body.data.approval.approvalNumber;

      const agent = await rolelessAgent();
      const withAccess = await superAgent.get(`/api/v1/search?q=${approvalNumber}`);
      const withoutAccess = await agent.get(`/api/v1/search?q=${approvalNumber}`);
      expect(withAccess.body.data.results.some((r) => r.type === "approval")).toBe(true);
      expect(withoutAccess.body.data.results.some((r) => r.type === "approval")).toBe(false);
    });

    it("an admin with zero matching permissions gets an empty result set, not an error", async () => {
      const agent = await rolelessAgent();
      const res = await agent.get("/api/v1/search?q=Zephyr");
      expect(res.status).toBe(200);
      expect(res.body.data.results).toEqual([]);
    });
  });

  describe("Security / data boundaries", () => {
    it("never returns a password hash, session token, or other raw internal field", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      const combined = JSON.stringify(res.body);
      expect(combined).not.toMatch(/password_hash|scrypt\$/i);
      expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
      expect(combined).not.toMatch(/passwordHash|requestMetadata|executionResult/);
    });

    it("only returns the normalized DTO shape (type/id/title/subtitle/status/url), never a raw row", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      for (const result of res.body.data.results) {
        expect(Object.keys(result).sort()).toEqual(["id", "status", "subtitle", "title", "type", "url"]);
      }
    });

    it("never returns a provider-owned resource type (no transaction/KYC/card/etc. fields exist to leak)", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr");
      const types = new Set(res.body.data.results.map((r) => r.type));
      const forbidden = ["transaction", "kyc", "beneficiary", "card", "dispute", "ledger", "settlement", "escrow"];
      for (const type of types) {
        expect(forbidden).not.toContain(type);
      }
    });

    it("safely handles special LIKE characters without error or unintended wildcard behavior", async () => {
      const res = await superAgent.get(`/api/v1/search?q=${encodeURIComponent("100%_test\\")}`);
      expect(res.status).toBe(200);
      expect(res.body.data.results).toEqual([]);
    });
  });

  describe("Navigation metadata", () => {
    it("each result's url points at the correct existing route for its type", async () => {
      const res = await superAgent.get("/api/v1/search?q=Zephyr&limit=50");
      const byType = Object.fromEntries(res.body.data.results.map((r) => [r.type, r]));

      expect(byType.user.url).toBe(`/users/${customerId}`);
      expect(byType.device?.url).toBe(`/users/${customerId}`);
      expect(byType.support_case.url).toMatch(/^\/support\/cases\//);
      expect(byType.app_issue.url).toBe("/support/app-issues");
      expect(byType.campaign.url).toMatch(/^\/campaigns\//);
      expect(byType.reward.url).toMatch(/^\/rewards\//);
      expect(byType.risk_case.url).toMatch(/^\/risk\/cases\//);
      expect(byType.security_case.url).toMatch(/^\/security\/cases\//);
    });

    it("finds a device by its own id and links to its owning user", async () => {
      const res = await superAgent.get(`/api/v1/search?q=${deviceId}`);
      const deviceResult = res.body.data.results.find((r) => r.type === "device");
      expect(deviceResult).toBeDefined();
      expect(deviceResult.url).toBe(`/users/${customerId}`);
    });

    it("finds a device by its linked user id", async () => {
      const res = await superAgent.get(`/api/v1/search?q=${customerId}&limit=50`);
      expect(res.body.data.results.some((r) => r.type === "device" && r.id === deviceId)).toBe(true);
    });
  });

  describe("Regression", () => {
    it("existing Users API still works unchanged", async () => {
      const res = await superAgent.get("/api/v1/users");
      expect(res.status).toBe(200);
    });

    it("existing Approvals API still works unchanged", async () => {
      const res = await superAgent.get("/api/v1/approvals");
      expect(res.status).toBe(200);
    });
  });
});
