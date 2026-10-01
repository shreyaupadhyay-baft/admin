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
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Risk & Fraud RBAC matrix, audit, and security", () => {
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

  it("Super Admin: allowed on every risk signal and case operation", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    const caseRes = await agent.post("/api/v1/risk/cases").send({ title: "Matrix", category: "fraud" });
    expect(caseRes.status).toBe(201);
    expect((await agent.post(`/api/v1/risk/cases/${caseRes.body.data.case.id}/resolve`).send({})).status).toBe(200);
    expect((await agent.get("/api/v1/risk/signals")).status).toBe(200);
  });

  it("Risk/Fraud Admin: owns the full workflow end to end", async () => {
    const agent = await loginAsRole("risk@baft.test", fixtures.riskFraudAdmin.id);

    const signalRes = await agent
      .post("/api/v1/risk/signals")
      .send({ signalType: "x", category: "fraud", source: "s", description: "d" });
    expect(signalRes.status).toBe(201);
    expect((await agent.patch(`/api/v1/risk/signals/${signalRes.body.data.signal.id}/status`).send({ status: "acknowledged" })).status).toBe(200);

    const caseRes = await agent.post("/api/v1/risk/cases").send({ title: "Owned Case", category: "fraud" });
    const caseId = caseRes.body.data.case.id;
    expect((await agent.post(`/api/v1/risk/cases/${caseId}/status`).send({ status: "investigating" })).status).toBe(200);
    expect((await agent.post(`/api/v1/risk/cases/${caseId}/severity`).send({ severity: "high" })).status).toBe(200);
    expect(
      (
        await agent
          .post(`/api/v1/risk/cases/${caseId}/evidence`)
          .send({ evidenceType: "manual_note", source: "analyst", description: "Reviewed." })
      ).status,
    ).toBe(201);
    expect(
      (await agent.post(`/api/v1/risk/cases/${caseId}/decisions`).send({ decision: "monitor", reason: "Watching." })).status,
    ).toBe(201);
    expect((await agent.post(`/api/v1/risk/cases/${caseId}/resolve`).send({})).status).toBe(200);
    expect((await agent.post(`/api/v1/risk/cases/${caseId}/close`).send({})).status).toBe(200);
  });

  it("Operations Admin, Support Admin, Auditor: read-only on risk cases", async () => {
    for (const [email, roleId] of [
      ["ops@baft.test", fixtures.operationsAdmin.id],
      ["support@baft.test", fixtures.supportAdmin.id],
      ["auditor@baft.test", fixtures.auditor.id],
    ] as const) {
      const agent = await loginAsRole(email, roleId);
      expect((await agent.get("/api/v1/risk/cases")).status).toBe(200);
      expect((await agent.post("/api/v1/risk/cases").send({ title: "X", category: "fraud" })).status).toBe(403);
    }
  });

  it("Engineering Admin: risk_signals.read only, no risk_cases access at all", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/risk/signals")).status).toBe(200);
    expect((await agent.get("/api/v1/risk/cases")).status).toBe(403);
  });

  it("Product/Growth Admin: no risk access at all", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    expect((await agent.get("/api/v1/risk/signals")).status).toBe(403);
    expect((await agent.get("/api/v1/risk/cases")).status).toBe(403);
  });

  it("Security Admin: no risk access despite the role existing", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    expect((await agent.get("/api/v1/risk/signals")).status).toBe(403);
    expect((await agent.get("/api/v1/risk/cases")).status).toBe(403);
  });

  it("Unauthenticated requests get 401 on every risk route", async () => {
    expect((await request(app).get("/api/v1/risk/signals")).status).toBe(401);
    expect((await request(app).get("/api/v1/risk/cases")).status).toBe(401);
  });

  it("records RISK_CASE_CREATED, RISK_CASE_DECISION_RECORDED, and AUTHORIZATION_DENIED with identifiers", async () => {
    const riskAgent = await loginAsRole("risk2@baft.test", fixtures.riskFraudAdmin.id);
    const caseRes = await riskAgent.post("/api/v1/risk/cases").send({ title: "Audited Case", category: "fraud" });
    const caseId = caseRes.body.data.case.id;
    await riskAgent.post(`/api/v1/risk/cases/${caseId}/decisions`).send({ decision: "no_action", reason: "Benign." });

    const auditorAgent = await loginAsRole("auditor2@baft.test", fixtures.auditor.id);
    await auditorAgent.post(`/api/v1/risk/cases/${caseId}/resolve`).send({});

    const created = db.auditLogs.find((l) => l.action === "RISK_CASE_CREATED" && l.target_id === caseId);
    expect(created).toBeDefined();
    expect(created?.actor_admin_id).toBeTruthy();
    expect(created?.request_id).toBeTruthy();

    const decided = db.auditLogs.find((l) => l.action === "RISK_CASE_DECISION_RECORDED");
    expect(decided).toBeDefined();

    expect(db.auditLogs.some((l) => l.action === "AUTHORIZATION_DENIED")).toBe(true);
  });

  it("never leaks a password hash or session token in a risk response or audit record", async () => {
    const agent = await loginAsRole("secure-check@baft.test", fixtures.riskFraudAdmin.id);
    const caseRes = await agent.post("/api/v1/risk/cases").send({ title: "Secure Case", category: "fraud" });
    await agent.post(`/api/v1/risk/cases/${caseRes.body.data.case.id}/notes`).send({ note: "internal note" });

    const combined = JSON.stringify({ caseRes: caseRes.body, auditLogs: db.auditLogs });
    expect(combined).not.toMatch(/password_hash|scrypt\$/i);
    expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
  });

  it("does not persist provider transaction/card/KYC fields in evidence", async () => {
    const agent = await loginAsRole("secure-check2@baft.test", fixtures.riskFraudAdmin.id);
    const caseRes = await agent.post("/api/v1/risk/cases").send({ title: "Boundary Case", category: "transaction_payment" });
    const evidenceRes = await agent.post(`/api/v1/risk/cases/${caseRes.body.data.case.id}/evidence`).send({
      evidenceType: "provider_signal",
      source: "transcorp",
      externalReference: "ref-1",
      description: "Reference only.",
    });

    const evidenceKeys = Object.keys(evidenceRes.body.data.evidence);
    for (const forbidden of ["amount", "cardNumber", "accountNumber", "kycDocument", "beneficiary"]) {
      expect(evidenceKeys).not.toContain(forbidden);
    }
  });
});
