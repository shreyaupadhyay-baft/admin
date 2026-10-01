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

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Support RBAC matrix, audit, and security", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
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
    const customer = await createUser({ email: "matrix-customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  it("Super Admin: allowed on every support case and app issue operation", async () => {
    const agent = await loginAsRole("super@baft.test", fixtures.superAdmin.id);
    const createRes = await agent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Matrix", description: "Desc", category: "other" });
    expect(createRes.status).toBe(201);
    expect((await agent.post(`/api/v1/support/cases/${createRes.body.data.case.id}/resolve`).send({})).status).toBe(200);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
  });

  it("Operations Admin: full read+write on both resources", async () => {
    const agent = await loginAsRole("ops@baft.test", fixtures.operationsAdmin.id);
    const createRes = await agent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Ops case", description: "Desc", category: "technical" });
    expect(createRes.status).toBe(201);

    const issueRes = await agent
      .post("/api/v1/support/app-issues")
      .send({ source: "IN_APP", title: "Ops issue", description: "Desc" });
    expect(issueRes.status).toBe(201);
    expect((await agent.post(`/api/v1/support/app-issues/${issueRes.body.data.appIssue.id}/resolve`)).status).toBe(200);
  });

  it("Support Admin: full Support Case and App Issue access", async () => {
    const agent = await loginAsRole("support@baft.test", fixtures.supportAdmin.id);
    const createRes = await agent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Support case", description: "Desc", category: "account" });
    expect(createRes.status).toBe(201);
    expect((await agent.post(`/api/v1/support/cases/${createRes.body.data.case.id}/close`).send({})).status).toBe(200);
  });

  it("Auditor: read-only on both resources, never mutation", async () => {
    const agent = await loginAsRole("auditor@baft.test", fixtures.auditor.id);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/v1/support/cases")
          .send({ userId: customerId, subject: "X", description: "Y", category: "other" })
      ).status,
    ).toBe(403);
    expect((await agent.post("/api/v1/support/app-issues").send({ source: "IN_APP", title: "X", description: "Y" })).status).toBe(
      403,
    );
  });

  it("Risk/Fraud Admin: read access for investigation, no mutation permissions", async () => {
    const agent = await loginAsRole("risk@baft.test", fixtures.riskFraudAdmin.id);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(200);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/v1/support/cases")
          .send({ userId: customerId, subject: "X", description: "Y", category: "other" })
      ).status,
    ).toBe(403);
  });

  it("Product/Growth Admin: app_issues.read only, no support_cases access", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(403);
  });

  it("Engineering Admin: app_issues.read only, no support_cases access", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(403);
  });

  it("Security Admin: no Support access despite the role existing", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(403);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(403);
  });

  it("Unauthenticated requests get 401 on every support route", async () => {
    expect((await request(app).get("/api/v1/support/cases")).status).toBe(401);
    expect((await request(app).get("/api/v1/support/app-issues")).status).toBe(401);
  });

  it("records SUPPORT_CASE_CREATED, SUPPORT_CASE_RESOLVED, and AUTHORIZATION_DENIED with identifiers", async () => {
    const opsAgent = await loginAsRole("ops2@baft.test", fixtures.operationsAdmin.id);
    const createRes = await opsAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Audited case", description: "Desc", category: "technical" });
    const caseId = createRes.body.data.case.id;
    await opsAgent.post(`/api/v1/support/cases/${caseId}/resolve`).send({ note: "done" });

    const auditorAgent = await loginAsRole("auditor2@baft.test", fixtures.auditor.id);
    await auditorAgent.post(`/api/v1/support/cases/${caseId}/close`).send({});

    const created = db.auditLogs.find((l) => l.action === "SUPPORT_CASE_CREATED" && l.target_id === caseId);
    expect(created).toBeDefined();
    expect(created?.actor_admin_id).toBeTruthy();
    expect(created?.request_id).toBeTruthy();

    const resolved = db.auditLogs.find((l) => l.action === "SUPPORT_CASE_RESOLVED" && l.target_id === caseId);
    expect(resolved).toBeDefined();

    expect(db.auditLogs.some((l) => l.action === "AUTHORIZATION_DENIED")).toBe(true);
  });

  it("never leaks a password hash or session token in a support response or audit record", async () => {
    const agent = await loginAsRole("secure-check@baft.test", fixtures.supportAdmin.id);
    const createRes = await agent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Secure", description: "Desc", category: "other" });
    await agent.post(`/api/v1/support/cases/${createRes.body.data.case.id}/notes`).send({ note: "internal note" });

    const combined = JSON.stringify({ createRes: createRes.body, auditLogs: db.auditLogs });
    expect(combined).not.toMatch(/password_hash|scrypt\$/i);
    expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
  });
});
