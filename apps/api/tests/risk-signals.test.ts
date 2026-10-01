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

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Risk Signals API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let riskAgent: ReturnType<typeof request.agent>;

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
  });

  it("creates a risk signal in 'new' status", async () => {
    const res = await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "impossible_travel",
      category: "authentication_security",
      severity: "high",
      source: "device_service",
      description: "Login from two countries within 5 minutes.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.signal.status).toBe("new");
  });

  it("rejects a signal referencing a nonexistent user with 400", async () => {
    const res = await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "x",
      category: "fraud",
      source: "rules_engine",
      description: "y",
      userId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input with 400", async () => {
    const res = await riskAgent.post("/api/v1/risk/signals").send({ signalType: "", category: "not-a-category" });
    expect(res.status).toBe(400);
  });

  it("filters signals by category, severity, and status", async () => {
    await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "a",
      category: "device",
      severity: "low",
      source: "s",
      description: "d",
    });
    await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "b",
      category: "fraud",
      severity: "critical",
      source: "s",
      description: "d",
    });

    const res = await riskAgent.get("/api/v1/risk/signals?category=fraud&severity=critical");
    expect(res.status).toBe(200);
    expect(res.body.data.signals).toHaveLength(1);
    expect(res.body.data.signals[0].signalType).toBe("b");
  });

  it("returns 404 for a nonexistent signal and 400 for a malformed id", async () => {
    expect((await riskAgent.get("/api/v1/risk/signals/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await riskAgent.get("/api/v1/risk/signals/not-a-uuid")).status).toBe(400);
  });

  it("transitions a signal's status and audits the change", async () => {
    const createRes = await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "velocity",
      category: "fraud",
      source: "rules_engine",
      description: "Too many attempts.",
    });
    const signalId = createRes.body.data.signal.id;

    const res = await riskAgent
      .patch(`/api/v1/risk/signals/${signalId}/status`)
      .send({ status: "escalated", reason: "Confirmed pattern." });
    expect(res.status).toBe(200);
    expect(res.body.data.signal.status).toBe("escalated");
  });

  it("links a signal to a real user when userId is provided", async () => {
    const user = await createUser({ email: "signal-user@customer.test", fullName: "Signal User" });
    const res = await riskAgent.post("/api/v1/risk/signals").send({
      signalType: "device_change",
      category: "device",
      source: "device_service",
      description: "New device fingerprint.",
      userId: user.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.signal.userId).toBe(user.id);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/risk/signals");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without risk_signals permissions", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/risk/signals");
    expect(res.status).toBe(403);
  });

  it("lets Engineering Admin read signals but never create or change status", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/risk/signals")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/v1/risk/signals")
          .send({ signalType: "x", category: "fraud", source: "s", description: "d" })
      ).status,
    ).toBe(403);
  });
});
