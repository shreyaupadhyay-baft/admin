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
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Security Posture API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let securityAgent: ReturnType<typeof request.agent>;

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
    const security = await createAdminUser({ email: "security@baft.test", passwordHash, fullName: "Security" });
    await assignRoleToAdmin(security.id, fixtures.securityAdmin.id);

    securityAgent = request.agent(app);
    await securityAgent.post("/api/v1/auth/login").send({ email: "security@baft.test", password: PASSWORD });
  });

  it("returns correct aggregate counts", async () => {
    const customer = await createUser({ email: "posture@customer.test", fullName: "Posture" });

    await securityAgent.post("/api/v1/security/events").send({
      eventType: "login_failure",
      category: "authentication",
      severity: "critical",
      source: "auth_service",
      description: "d",
    });

    await securityAgent.post("/api/v1/security/cases").send({ title: "Open Case", category: "account", severity: "critical" });
    const closedCaseRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Closed Case", category: "account" });
    await securityAgent.post(`/api/v1/security/cases/${closedCaseRes.body.data.case.id}/resolve`).send({});
    await securityAgent.post(`/api/v1/security/cases/${closedCaseRes.body.data.case.id}/close`).send({});

    await securityAgent.post(`/api/v1/security/users/${customer.id}/block/request`).send({ reason: "x" });

    const res = await securityAgent.get("/api/v1/security/posture");
    expect(res.status).toBe(200);
    const posture = res.body.data.posture;

    expect(posture.activeSecurityCases).toBe(1);
    expect(posture.criticalSecurityCases).toBe(1);
    expect(posture.highSeverityEvents).toBe(1);
    expect(posture.blockedUsers).toBe(0);
    expect(posture.pendingSecurityActions).toBe(1);
    expect(Array.isArray(posture.recentSecurityEvents)).toBe(true);
    expect(posture.recentSecurityEvents.length).toBeGreaterThan(0);
  });

  it("reflects a blocked user in the blockedUsers count after approval", async () => {
    const customer = await createUser({ email: "blocked@customer.test", fullName: "Blocked" });
    const passwordHash = await hashPassword(PASSWORD);
    const approver = await createAdminUser({ email: "approver@baft.test", passwordHash, fullName: "Approver" });
    await assignRoleToAdmin(approver.id, fixtures.securityAdmin.id);
    const approverAgent = request.agent(app);
    await approverAgent.post("/api/v1/auth/login").send({ email: "approver@baft.test", password: PASSWORD });

    const requestRes = await securityAgent.post(`/api/v1/security/users/${customer.id}/block/request`).send({ reason: "x" });
    await approverAgent.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/approve`);

    const res = await securityAgent.get("/api/v1/security/posture");
    expect(res.body.data.posture.blockedUsers).toBe(1);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/security/posture");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without security_cases.read", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/security/posture");
    expect(res.status).toBe(403);
  });

  it("never exposes sensitive or provider-owned fields in the posture response", async () => {
    const res = await securityAgent.get("/api/v1/security/posture");
    const serialized = JSON.stringify(res.body);
    for (const forbidden of ["passwordHash", "sessionToken", "cardNumber", "accountNumber", "transactionHistory", "kycDocuments", "beneficiary", "providerCredentials"]) {
      expect(serialized).not.toMatch(new RegExp(forbidden, "i"));
    }
  });
});
