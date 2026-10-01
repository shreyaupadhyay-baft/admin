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

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Security RBAC matrix, lifecycle, and session revocation", () => {
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

  it("Super Admin: allowed on every security operation", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    const caseRes = await agent.post("/api/v1/security/cases").send({ title: "Matrix", category: "system" });
    expect(caseRes.status).toBe(201);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(200);
    expect((await agent.get("/api/v1/security/posture")).status).toBe(200);
  });

  it("Security Admin: full investigation and action authority", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    const eventRes = await agent
      .post("/api/v1/security/events")
      .send({ eventType: "x", category: "system", source: "s", description: "d" });
    expect(eventRes.status).toBe(201);

    const caseRes = await agent.post("/api/v1/security/cases").send({ title: "Owned", category: "system" });
    const caseId = caseRes.body.data.case.id;
    expect((await agent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "triaged" })).status).toBe(200);
    expect((await agent.post(`/api/v1/security/cases/${caseId}/resolve`).send({})).status).toBe(200);
    expect((await agent.post(`/api/v1/security/cases/${caseId}/close`).send({})).status).toBe(200);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(200);
  });

  it("Operations Admin: read-only on events/cases, no action visibility or approval", async () => {
    const agent = await loginAsRole("ops@baft.test", fixtures.operationsAdmin.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(403);
    expect((await agent.post("/api/v1/security/cases").send({ title: "X", category: "system" })).status).toBe(403);
  });

  it("Support Admin: security_cases.read only", async () => {
    const agent = await loginAsRole("support@baft.test", fixtures.supportAdmin.id);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/security/events")).status).toBe(403);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(403);
  });

  it("Risk/Fraud Admin: read-only events/cases, no action approval", async () => {
    const agent = await loginAsRole("risk@baft.test", fixtures.riskFraudAdmin.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(403);
  });

  it("Auditor: read-only across events, cases, and the action approval trail", async () => {
    const agent = await loginAsRole("auditor@baft.test", fixtures.auditor.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(200);
    expect((await agent.post("/api/v1/security/cases").send({ title: "X", category: "system" })).status).toBe(403);
  });

  it("Product/Growth Admin: no security access at all", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(403);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(403);
    expect((await agent.get("/api/v1/security/actions")).status).toBe(403);
  });

  it("Engineering Admin: security_events.read only", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(403);
  });

  it("Unauthenticated requests get 401 on every security route", async () => {
    expect((await request(app).get("/api/v1/security/events")).status).toBe(401);
    expect((await request(app).get("/api/v1/security/cases")).status).toBe(401);
    expect((await request(app).get("/api/v1/security/actions")).status).toBe(401);
    expect((await request(app).get("/api/v1/security/posture")).status).toBe(401);
  });

  it("rejects requests from a revoked admin session", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createAdminUser({ email: "revoke-me@baft.test", passwordHash, fullName: "Revoke Me" });
    await assignRoleToAdmin(admin.id, fixtures.securityAdmin.id);

    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ email: "revoke-me@baft.test", password: PASSWORD });
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);

    await agent.post("/api/v1/auth/logout");
    expect((await agent.get("/api/v1/security/events")).status).toBe(401);
  });

  it("walks the full security case lifecycle: open -> triaged -> investigating -> resolved -> closed", async () => {
    const agent = await loginAsRole("security2@baft.test", fixtures.securityAdmin.id);
    const createRes = await agent.post("/api/v1/security/cases").send({ title: "Lifecycle", category: "authentication" });
    const caseId = createRes.body.data.case.id;
    expect(createRes.body.data.case.status).toBe("open");

    const triaged = await agent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "triaged" });
    expect(triaged.body.data.case.status).toBe("triaged");

    const investigating = await agent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "investigating" });
    expect(investigating.body.data.case.status).toBe("investigating");

    const resolved = await agent.post(`/api/v1/security/cases/${caseId}/resolve`).send({});
    expect(resolved.body.data.case.status).toBe("resolved");

    const closed = await agent.post(`/api/v1/security/cases/${caseId}/close`).send({});
    expect(closed.body.data.case.status).toBe("closed");

    // Terminal: no further status transition is legal.
    const reopenAttempt = await agent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "open" });
    expect(reopenAttempt.status).toBe(409);
    expect(reopenAttempt.body.error.code).toBe("INVALID_TRANSITION");
  });
});
