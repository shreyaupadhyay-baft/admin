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
vi.mock("../src/repositories/dashboard.repository.js", () => import("./fakes/dashboard.repository.fake.js"));

// Matches the existing health.test.ts pattern exactly: the dashboard's
// system-health section calls these two functions directly (reusing the
// same health-check primitives the /health/ready endpoint already uses,
// rather than a second implementation), so they're mocked the same way here.
vi.mock("../src/infrastructure/database/pool.js", () => ({
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), on: vi.fn() },
}));
vi.mock("../src/infrastructure/redis/client.js", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  redis: { on: vi.fn(), connect: vi.fn(), ping: vi.fn() },
}));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin, createRole, setRolePermissions } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { notifyAdmin } = await import("../src/services/notification.service.js");
const { checkDatabaseHealth } = await import("../src/infrastructure/database/pool.js");
const { checkRedisHealth } = await import("../src/infrastructure/redis/client.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

const login = async (email: string) => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return agent;
};

describe("Global Dashboard API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let superAdminId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();
    vi.mocked(checkDatabaseHealth).mockResolvedValue(true);
    vi.mocked(checkRedisHealth).mockResolvedValue(true);

    const passwordHash = await hashPassword(PASSWORD);
    const superA = await createAdminUser({ email: "super-a@baft.test", passwordHash, fullName: "Super A" });
    await assignRoleToAdmin(superA.id, fixtures.superAdmin.id);
    superAdminId = superA.id;
    superAgent = await login("super-a@baft.test");
  });

  const rolelessAgent = async () => {
    const strippedRole = await createRole({ name: `No Dashboard Access ${Date.now()}`, description: "" });
    await setRolePermissions(strippedRole.id, []);
    const passwordHash = await hashPassword(PASSWORD);
    const email = `stripped-${Date.now()}-${Math.random().toString(36).slice(2)}@baft.test`;
    const admin = await createAdminUser({ email, passwordHash, fullName: "Stripped" });
    await assignRoleToAdmin(admin.id, strippedRole.id);
    return { agent: await login(email), adminId: admin.id };
  };

  describe("Core access", () => {
    it("an authenticated admin can access the dashboard", async () => {
      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.data.overview).toBeDefined();
    });

    it("rejects unauthenticated requests with 401", async () => {
      expect((await request(app).get("/api/v1/dashboard")).status).toBe(401);
    });

    it("a zero-permission admin still gets a 200 with only universally-available information (systemHealth)", async () => {
      const { agent } = await rolelessAgent();
      const res = await agent.get("/api/v1/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.data.overview).toEqual({});
      expect(res.body.data.users).toBeUndefined();
      expect(res.body.data.devices).toBeUndefined();
      expect(res.body.data.support).toBeUndefined();
      expect(res.body.data.risk).toBeUndefined();
      expect(res.body.data.security).toBeUndefined();
      expect(res.body.data.approvals).toBeUndefined();
      expect(res.body.data.campaigns).toBeUndefined();
      expect(res.body.data.rewards).toBeUndefined();
      expect(res.body.data.systemHealth).toBeDefined();
    });
  });

  describe("RBAC per module", () => {
    it("user metrics respect users.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.overview.totalUsers).toBeDefined();
      expect(withAccess.body.data.users.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.overview.totalUsers).toBeUndefined();
      expect(withoutAccess.body.data.users).toBeUndefined();
    });

    it("device metrics respect devices.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.devices.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.devices).toBeUndefined();
      expect(withoutAccess.body.data.overview.totalDevices).toBeUndefined();
    });

    it("support metrics respect support_cases.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.support.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.support).toBeUndefined();
      expect(withoutAccess.body.data.overview.openSupportCases).toBeUndefined();
    });

    it("risk metrics respect risk_cases.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.risk.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.risk).toBeUndefined();
      expect(withoutAccess.body.data.overview.openRiskCases).toBeUndefined();
    });

    it("security metrics respect security_cases.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.security.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.security).toBeUndefined();
      expect(withoutAccess.body.data.overview.openSecurityCases).toBeUndefined();
    });

    it("pendingSecurityActions within the security section additionally respects security_actions.read", async () => {
      // Security Admin (seeded fixture) holds both security_cases.read and
      // security_actions.read, so the sub-field must be present for them.
      const passwordHash = await hashPassword(PASSWORD);
      const secAdmin = await createAdminUser({ email: "sec-full@baft.test", passwordHash, fullName: "Sec" });
      await assignRoleToAdmin(secAdmin.id, fixtures.securityAdmin.id);
      const secAgent = await login("sec-full@baft.test");
      const withActions = await secAgent.get("/api/v1/dashboard");
      expect(withActions.body.data.security.pendingSecurityActions).toBeDefined();

      // Risk/Fraud Admin has security_cases.read but NOT security_actions.read.
      const riskAdmin = await createAdminUser({ email: "risk-only@baft.test", passwordHash, fullName: "Risk" });
      await assignRoleToAdmin(riskAdmin.id, fixtures.riskFraudAdmin.id);
      const riskAgent = await login("risk-only@baft.test");
      const withoutActions = await riskAgent.get("/api/v1/dashboard");
      expect(withoutActions.body.data.security.status).toBe("ok");
      expect(withoutActions.body.data.security.pendingSecurityActions).toBeUndefined();
    });

    it("campaign metrics respect campaigns.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.campaigns.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.campaigns).toBeUndefined();
    });

    it("reward metrics respect rewards.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.rewards.status).toBe("ok");

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.rewards).toBeUndefined();
    });

    it("approval metrics respect approvals.read", async () => {
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.approvals.status).toBe("ok");
      expect(withAccess.body.data.overview.pendingApprovals).toBeDefined();

      const { agent } = await rolelessAgent();
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.approvals).toBeUndefined();
      expect(withoutAccess.body.data.overview.pendingApprovals).toBeUndefined();
    });

    it("notification summary respects notifications.read", async () => {
      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "x", message: "x", severity: "info" });
      const withAccess = await superAgent.get("/api/v1/dashboard");
      expect(withAccess.body.data.overview.unreadNotifications).toBe(1);

      const { agent, adminId } = await rolelessAgent();
      await notifyAdmin(adminId, { type: "admin_role_changed", title: "x", message: "x", severity: "info" });
      const withoutAccess = await agent.get("/api/v1/dashboard");
      expect(withoutAccess.body.data.overview.unreadNotifications).toBeUndefined();
    });

    it("does not leak an unauthorized module's counts through the overview aggregate", async () => {
      const { agent } = await rolelessAgent();
      const res = await agent.get("/api/v1/dashboard");
      const overviewValues = Object.keys(res.body.data.overview);
      expect(overviewValues).toEqual([]);
    });
  });

  describe("Correctness against seeded data", () => {
    it("counts are correct against real seeded data", async () => {
      await createUser({ email: "active1@customer.test", fullName: "Active One" });
      const inactiveUser = await createUser({ email: "inactive1@customer.test", fullName: "Inactive One" });
      db.users.find((u) => u.id === inactiveUser.id)!.status = "suspended";

      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.body.data.users.total).toBe(2);
      expect(res.body.data.users.active).toBe(1);
      expect(res.body.data.users.inactive).toBe(1);
      expect(res.body.data.overview.totalUsers).toBe(2);
      expect(res.body.data.overview.activeUsers).toBe(1);
    });

    it("empty datasets behave correctly (all zero, not missing)", async () => {
      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.body.data.users.total).toBe(0);
      expect(res.body.data.support.open).toBe(0);
      expect(res.body.data.risk.openBySeverity).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
    });
  });

  describe("Partial-failure resilience", () => {
    it("one failing optional section does not take down the rest of the dashboard", async () => {
      const dashboardRepo = await import("../src/repositories/dashboard.repository.js");
      const spy = vi.spyOn(dashboardRepo, "getRiskOverview").mockRejectedValueOnce(new Error("boom"));

      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.status).toBe(200);
      expect(res.body.data.risk).toEqual({ status: "error" });
      expect(res.body.data.users.status).toBe("ok");
      expect(res.body.data.support.status).toBe("ok");

      spy.mockRestore();
    });
  });

  describe("System health", () => {
    it("reports healthy when both database and redis are up", async () => {
      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.body.data.systemHealth).toEqual({ status: "healthy", database: "up", redis: "up" });
    });

    it("reports degraded when redis is down but the database is up", async () => {
      vi.mocked(checkRedisHealth).mockResolvedValueOnce(false);
      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.body.data.systemHealth).toEqual({ status: "degraded", database: "up", redis: "down" });
    });

    it("reports unavailable when the database itself is down", async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValueOnce(false);
      const res = await superAgent.get("/api/v1/dashboard");
      expect(res.body.data.systemHealth.status).toBe("unavailable");
      expect(res.body.data.systemHealth.database).toBe("down");
    });

    it("system health is present even for a zero-permission admin", async () => {
      const { agent } = await rolelessAgent();
      const res = await agent.get("/api/v1/dashboard");
      expect(res.body.data.systemHealth.status).toBe("healthy");
    });
  });

  describe("Security / data boundaries", () => {
    it("never returns a password hash, session token, or other secret", async () => {
      const res = await superAgent.get("/api/v1/dashboard");
      const combined = JSON.stringify(res.body);
      expect(combined).not.toMatch(/password_hash|scrypt\$/i);
      expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
    });

    it("never returns a provider-owned resource key (no transaction/kyc/card/etc. sections exist)", async () => {
      const res = await superAgent.get("/api/v1/dashboard");
      const topLevelKeys = Object.keys(res.body.data);
      const forbidden = ["transactions", "kyc", "beneficiaries", "cards", "disputes", "ledger", "settlement", "escrow", "corporateFunds"];
      for (const key of forbidden) {
        expect(topLevelKeys).not.toContain(key);
      }
    });
  });

  describe("Regression", () => {
    it("existing Users API still works unchanged", async () => {
      expect((await superAgent.get("/api/v1/users")).status).toBe(200);
    });

    it("existing Security Posture API still works unchanged", async () => {
      expect((await superAgent.get("/api/v1/security/posture")).status).toBe(200);
    });
  });
});
