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
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Security Cases API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let securityAgent: ReturnType<typeof request.agent>;
  let customerId: string;

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

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  it("creates a security case with a generated case number", async () => {
    const res = await securityAgent.post("/api/v1/security/cases").send({
      title: "Suspicious admin access pattern",
      category: "access",
      severity: "high",
      userId: customerId,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.case.status).toBe("open");
    expect(res.body.data.case.caseNumber).toMatch(/^SEC-\d{6}$/);
  });

  it("rejects invalid input with 400", async () => {
    const res = await securityAgent.post("/api/v1/security/cases").send({ title: "", category: "not-a-category" });
    expect(res.status).toBe(400);
  });

  it("lists and gets a case, including its bundled timeline and evidence", async () => {
    const createRes = await securityAgent
      .post("/api/v1/security/cases")
      .send({ title: "Case A", category: "authentication", userId: customerId });
    const caseId = createRes.body.data.case.id;

    const listRes = await securityAgent.get("/api/v1/security/cases");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.cases).toHaveLength(1);

    const getRes = await securityAgent.get(`/api/v1/security/cases/${caseId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.events.some((e: { eventType: string }) => e.eventType === "CASE_CREATED")).toBe(true);
    expect(getRes.body.data.evidence).toEqual([]);
  });

  it("returns 404 for a nonexistent case and 400 for a malformed id", async () => {
    expect((await securityAgent.get("/api/v1/security/cases/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await securityAgent.get("/api/v1/security/cases/not-a-uuid")).status).toBe(400);
  });

  it("updates general fields without touching status or severity", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Old Title", category: "account" });
    const caseId = createRes.body.data.case.id;

    const res = await securityAgent.patch(`/api/v1/security/cases/${caseId}`).send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.data.case.title).toBe("New Title");
    expect(res.body.data.case.status).toBe("open");
    expect(res.body.data.case.severity).toBe("medium");
  });

  it("changes status and severity independently through dedicated endpoints", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Independence", category: "session" });
    const caseId = createRes.body.data.case.id;

    const statusRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "investigating" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.case.status).toBe("investigating");
    expect(statusRes.body.data.case.severity).toBe("medium");

    const severityRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/severity`).send({ severity: "critical" });
    expect(severityRes.status).toBe(200);
    expect(severityRes.body.data.case.severity).toBe("critical");
    expect(severityRes.body.data.case.status).toBe("investigating");
  });

  it("rejects setting a terminal status through the generic status endpoint", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Terminal Guard", category: "system" });
    const caseId = createRes.body.data.case.id;

    const res = await securityAgent.post(`/api/v1/security/cases/${caseId}/status`).send({ status: "resolved" });
    expect(res.status).toBe(400);
  });

  it("rejects modifying status, severity, or assignment through the generic PATCH endpoint", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "PATCH Guard", category: "system" });
    const caseId = createRes.body.data.case.id;

    const res = await securityAgent.patch(`/api/v1/security/cases/${caseId}`).send({ status: "investigating", severity: "high" });
    // Neither field exists on the update schema, so nothing recognized remains -> validation failure.
    expect(res.status).toBe(400);
  });

  it("assigns and unassigns a case", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const investigator = await createAdminUser({ email: "investigator@baft.test", passwordHash, fullName: "Investigator" });
    await assignRoleToAdmin(investigator.id, fixtures.securityAdmin.id);

    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Assign Me", category: "account" });
    const caseId = createRes.body.data.case.id;

    const assignRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/assign`).send({ adminId: investigator.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.case.assignedAdminId).toBe(investigator.id);

    const unassignRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/assign`).send({ adminId: null });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.data.case.assignedAdminId).toBeNull();
  });

  it("adds evidence referencing an external system without copying provider data", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Evidence Case", category: "authentication" });
    const caseId = createRes.body.data.case.id;

    const res = await securityAgent.post(`/api/v1/security/cases/${caseId}/evidence`).send({
      evidenceType: "provider_signal",
      source: "transcorp_auth_log",
      externalReference: "auth-ref-abc123",
      description: "Provider flagged repeated MFA failures.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.evidence.evidenceType).toBe("provider_signal");
    expect(Object.keys(res.body.data.evidence)).not.toContain("cardNumber");
    expect(Object.keys(res.body.data.evidence)).not.toContain("accountNumber");
  });

  it("adds a note, then resolves and closes the case", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Lifecycle Case", category: "access" });
    const caseId = createRes.body.data.case.id;

    expect((await securityAgent.post(`/api/v1/security/cases/${caseId}/notes`).send({ note: "Contacted user." })).status).toBe(201);

    const resolveRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/resolve`).send({ note: "False positive." });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.case.status).toBe("resolved");
    expect(resolveRes.body.data.case.resolvedAt).toBeTruthy();

    const closeRes = await securityAgent.post(`/api/v1/security/cases/${caseId}/close`).send({});
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.case.status).toBe("closed");
    expect(closeRes.body.data.case.closedAt).toBeTruthy();

    const getRes = await securityAgent.get(`/api/v1/security/cases/${caseId}`);
    const eventTypes = getRes.body.data.events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining(["CASE_CREATED", "NOTE_ADDED", "CASE_RESOLVED", "CASE_CLOSED"]));
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/security/cases");
    expect(res.status).toBe(401);
  });

  it("returns 403 for Support Admin attempting to mutate a case (read-only access)", async () => {
    const agent = await loginAsRole("support@baft.test", fixtures.supportAdmin.id);
    expect((await agent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await agent.post("/api/v1/security/cases").send({ title: "X", category: "account" })).status).toBe(403);
  });

  it("records SECURITY_CASE_CREATED and SECURITY_CASE_RESOLVED audit entries with identifiers", async () => {
    const createRes = await securityAgent.post("/api/v1/security/cases").send({ title: "Audited Case", category: "account" });
    const caseId = createRes.body.data.case.id;
    await securityAgent.post(`/api/v1/security/cases/${caseId}/resolve`).send({});

    const created = db.auditLogs.find((l) => l.action === "SECURITY_CASE_CREATED" && l.target_id === caseId);
    expect(created).toBeDefined();
    expect(created?.actor_admin_id).toBeTruthy();
    expect(created?.request_id).toBeTruthy();

    expect(db.auditLogs.some((l) => l.action === "SECURITY_CASE_RESOLVED" && l.target_id === caseId)).toBe(true);
  });
});
