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
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Risk Cases API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let riskAgent: ReturnType<typeof request.agent>;
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
    const risk = await createAdminUser({ email: "risk@baft.test", passwordHash, fullName: "Risk" });
    await assignRoleToAdmin(risk.id, fixtures.riskFraudAdmin.id);

    riskAgent = request.agent(app);
    await riskAgent.post("/api/v1/auth/login").send({ email: "risk@baft.test", password: PASSWORD });

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  it("creates a risk case with a generated case number", async () => {
    const res = await riskAgent.post("/api/v1/risk/cases").send({
      title: "Suspicious login pattern",
      category: "authentication_security",
      severity: "high",
      userId: customerId,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.case.status).toBe("open");
    expect(res.body.data.case.caseNumber).toMatch(/^RC-\d{6}$/);
  });

  it("rejects invalid input with 400", async () => {
    const res = await riskAgent.post("/api/v1/risk/cases").send({ title: "", category: "not-a-category" });
    expect(res.status).toBe(400);
  });

  it("lists and gets a case, including its bundled timeline, evidence, and decisions", async () => {
    const createRes = await riskAgent
      .post("/api/v1/risk/cases")
      .send({ title: "Case A", category: "fraud", userId: customerId });
    const caseId = createRes.body.data.case.id;

    const listRes = await riskAgent.get("/api/v1/risk/cases");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.cases).toHaveLength(1);

    const getRes = await riskAgent.get(`/api/v1/risk/cases/${caseId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.events.some((e: { eventType: string }) => e.eventType === "CASE_CREATED")).toBe(true);
    expect(getRes.body.data.evidence).toEqual([]);
    expect(getRes.body.data.decisions).toEqual([]);
  });

  it("returns 404 for a nonexistent case and 400 for a malformed id", async () => {
    expect((await riskAgent.get("/api/v1/risk/cases/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await riskAgent.get("/api/v1/risk/cases/not-a-uuid")).status).toBe(400);
  });

  it("updates general fields without touching status or severity", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Old Title", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const res = await riskAgent.patch(`/api/v1/risk/cases/${caseId}`).send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.data.case.title).toBe("New Title");
    expect(res.body.data.case.status).toBe("open");
    expect(res.body.data.case.severity).toBe("medium");
  });

  it("changes status and severity independently — one never implies the other", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Independence", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const statusRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/status`).send({ status: "investigating" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.case.status).toBe("investigating");
    expect(statusRes.body.data.case.severity).toBe("medium");

    const severityRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/severity`).send({ severity: "critical" });
    expect(severityRes.status).toBe(200);
    expect(severityRes.body.data.case.severity).toBe("critical");
    expect(severityRes.body.data.case.status).toBe("investigating");
  });

  it("rejects setting a terminal status through the generic status endpoint", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Terminal Guard", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const res = await riskAgent.post(`/api/v1/risk/cases/${caseId}/status`).send({ status: "resolved" });
    expect(res.status).toBe(400);
  });

  it("assigns and unassigns a case", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const investigator = await createAdminUser({ email: "investigator@baft.test", passwordHash, fullName: "Investigator" });
    await assignRoleToAdmin(investigator.id, fixtures.riskFraudAdmin.id);

    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Assign Me", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const assignRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/assign`).send({ adminId: investigator.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.case.assignedAdminId).toBe(investigator.id);

    const unassignRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/assign`).send({ adminId: null });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.data.case.assignedAdminId).toBeNull();
  });

  it("adds evidence referencing an external system without copying provider data", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Evidence Case", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const res = await riskAgent.post(`/api/v1/risk/cases/${caseId}/evidence`).send({
      evidenceType: "provider_signal",
      source: "transcorp_webhook",
      externalReference: "txn-ref-abc123",
      description: "Provider flagged an unusual transaction pattern.",
      metadata: { flagCode: "VELOCITY_001" },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.evidence.evidenceType).toBe("provider_signal");
    expect(res.body.data.evidence.externalReference).toBe("txn-ref-abc123");
    // Only a reference + metadata are stored, never a transaction amount/account number field.
    expect(Object.keys(res.body.data.evidence)).not.toContain("amount");
    expect(Object.keys(res.body.data.evidence)).not.toContain("accountNumber");
  });

  it("records a decision as an administrative record, not an external action", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Decision Case", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    const res = await riskAgent
      .post(`/api/v1/risk/cases/${caseId}/decisions`)
      .send({ decision: "restrict_account", reason: "Confirmed account takeover attempt." });

    expect(res.status).toBe(201);
    expect(res.body.data.decision.decision).toBe("restrict_account");

    const getRes = await riskAgent.get(`/api/v1/risk/cases/${caseId}`);
    expect(getRes.body.data.decisions).toHaveLength(1);
    // The case's own user account is untouched — deciding "restrict_account" only records the decision.
    expect(getRes.body.data.case.status).toBe("open");
  });

  it("adds a note, then resolves and closes the case", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Lifecycle Case", category: "fraud" });
    const caseId = createRes.body.data.case.id;

    expect((await riskAgent.post(`/api/v1/risk/cases/${caseId}/notes`).send({ note: "Contacted user." })).status).toBe(201);

    const resolveRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/resolve`).send({ note: "False positive." });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.case.status).toBe("resolved");
    expect(resolveRes.body.data.case.resolvedAt).toBeTruthy();

    const closeRes = await riskAgent.post(`/api/v1/risk/cases/${caseId}/close`).send({});
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.case.status).toBe("closed");
    expect(closeRes.body.data.case.closedAt).toBeTruthy();

    const getRes = await riskAgent.get(`/api/v1/risk/cases/${caseId}`);
    const eventTypes = getRes.body.data.events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining(["CASE_CREATED", "NOTE_ADDED", "CASE_RESOLVED", "CASE_CLOSED"]));
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/risk/cases");
    expect(res.status).toBe(401);
  });

  it("returns 403 for Support Admin attempting to mutate a case (read-only access)", async () => {
    const agent = await loginAsRole("support@baft.test", fixtures.supportAdmin.id);
    expect((await agent.get("/api/v1/risk/cases")).status).toBe(200);
    expect((await agent.post("/api/v1/risk/cases").send({ title: "X", category: "fraud" })).status).toBe(403);
  });
});
