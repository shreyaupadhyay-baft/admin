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
const { createUser } = await import("../src/repositories/user.repository.js");
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Security Events API", () => {
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

  it("creates a security event in 'new' status", async () => {
    const res = await securityAgent.post("/api/v1/security/events").send({
      eventType: "login_failure",
      category: "authentication",
      severity: "medium",
      source: "auth_service",
      description: "Three failed login attempts within a minute.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.event.status).toBe("new");
  });

  it("rejects an event referencing a nonexistent user or device with 400", async () => {
    const badUser = await securityAgent.post("/api/v1/security/events").send({
      eventType: "x",
      category: "account",
      source: "s",
      description: "d",
      userId: "00000000-0000-0000-0000-000000000000",
    });
    expect(badUser.status).toBe(400);

    const badDevice = await securityAgent.post("/api/v1/security/events").send({
      eventType: "x",
      category: "device",
      source: "s",
      description: "d",
      deviceId: "00000000-0000-0000-0000-000000000000",
    });
    expect(badDevice.status).toBe(400);
  });

  it("rejects invalid input with 400", async () => {
    const res = await securityAgent.post("/api/v1/security/events").send({ eventType: "", category: "not-a-category" });
    expect(res.status).toBe(400);
  });

  it("filters events by category, severity, and status, and paginates results", async () => {
    await securityAgent.post("/api/v1/security/events").send({
      eventType: "a",
      category: "device",
      severity: "low",
      source: "s",
      description: "d",
    });
    await securityAgent.post("/api/v1/security/events").send({
      eventType: "b",
      category: "authentication",
      severity: "critical",
      source: "s",
      description: "d",
    });

    const filtered = await securityAgent.get("/api/v1/security/events?category=authentication&severity=critical");
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.events).toHaveLength(1);
    expect(filtered.body.data.events[0].eventType).toBe("b");

    const paged = await securityAgent.get("/api/v1/security/events?limit=1&offset=0");
    expect(paged.body.data.events).toHaveLength(1);
    expect(paged.body.meta.limit).toBe(1);
  });

  it("returns 404 for a nonexistent event and 400 for a malformed id", async () => {
    expect((await securityAgent.get("/api/v1/security/events/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await securityAgent.get("/api/v1/security/events/not-a-uuid")).status).toBe(400);
  });

  it("transitions an event's status and audits the change", async () => {
    const createRes = await securityAgent.post("/api/v1/security/events").send({
      eventType: "permission_denied",
      category: "access",
      source: "authz_service",
      description: "Repeated 403s from the same admin session.",
    });
    const eventId = createRes.body.data.event.id;

    const res = await securityAgent
      .patch(`/api/v1/security/events/${eventId}/status`)
      .send({ status: "escalated", reason: "Confirmed pattern." });
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe("escalated");
  });

  it("links an event to a real user", async () => {
    const user = await createUser({ email: "event-user@customer.test", fullName: "Event User" });
    const res = await securityAgent.post("/api/v1/security/events").send({
      eventType: "device_anomaly",
      category: "device",
      source: "device_service",
      description: "New device fingerprint.",
      userId: user.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.event.userId).toBe(user.id);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/security/events");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without security_events permissions", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/security/events");
    expect(res.status).toBe(403);
  });

  it("lets Engineering Admin read events but never create or change status", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/security/events")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/v1/security/events")
          .send({ eventType: "x", category: "system", source: "s", description: "d" })
      ).status,
    ).toBe(403);
  });
});
