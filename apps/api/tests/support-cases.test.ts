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
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin } = await import("../src/repositories/rbac.repository.js");
const { createUser } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Support Cases API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let supportAgent: ReturnType<typeof request.agent>;
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
    const supportAdminUser = await createAdminUser({ email: "support@baft.test", passwordHash, fullName: "Support" });
    await assignRoleToAdmin(supportAdminUser.id, fixtures.supportAdmin.id);

    supportAgent = request.agent(app);
    await supportAgent.post("/api/v1/auth/login").send({ email: "support@baft.test", password: PASSWORD });

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  it("creates a support case", async () => {
    const res = await supportAgent.post("/api/v1/support/cases").send({
      userId: customerId,
      subject: "Cannot log in",
      description: "User reports login failures since yesterday.",
      category: "account",
      priority: "high",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.case.subject).toBe("Cannot log in");
    expect(res.body.data.case.status).toBe("open");
  });

  it("rejects creation for a nonexistent user with 400", async () => {
    const res = await supportAgent.post("/api/v1/support/cases").send({
      userId: "00000000-0000-0000-0000-000000000000",
      subject: "X",
      description: "Y",
      category: "other",
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input with 400", async () => {
    const res = await supportAgent.post("/api/v1/support/cases").send({ userId: customerId, subject: "" });
    expect(res.status).toBe(400);
  });

  it("lists and gets cases, including their event history", async () => {
    const createRes = await supportAgent.post("/api/v1/support/cases").send({
      userId: customerId,
      subject: "Case A",
      description: "Desc",
      category: "technical",
    });
    const caseId = createRes.body.data.case.id;

    const listRes = await supportAgent.get("/api/v1/support/cases");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.cases).toHaveLength(1);

    const getRes = await supportAgent.get(`/api/v1/support/cases/${caseId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.case.id).toBe(caseId);
    expect(getRes.body.data.events.some((e: { eventType: string }) => e.eventType === "CASE_CREATED")).toBe(true);
  });

  it("returns 404 for a nonexistent case and 400 for a malformed id", async () => {
    expect((await supportAgent.get("/api/v1/support/cases/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await supportAgent.get("/api/v1/support/cases/not-a-uuid")).status).toBe(400);
  });

  it("updates case fields and moves between non-terminal statuses via PATCH", async () => {
    const createRes = await supportAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Case B", description: "Desc", category: "technical" });
    const caseId = createRes.body.data.case.id;

    const fieldRes = await supportAgent.patch(`/api/v1/support/cases/${caseId}`).send({ priority: "urgent" });
    expect(fieldRes.status).toBe(200);
    expect(fieldRes.body.data.case.priority).toBe("urgent");

    const statusRes = await supportAgent.patch(`/api/v1/support/cases/${caseId}`).send({ status: "in_progress" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.case.status).toBe("in_progress");
  });

  it("rejects setting a terminal status through the generic PATCH endpoint", async () => {
    const createRes = await supportAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Case C", description: "Desc", category: "technical" });
    const caseId = createRes.body.data.case.id;

    const res = await supportAgent.patch(`/api/v1/support/cases/${caseId}`).send({ status: "resolved" });
    expect(res.status).toBe(400);
  });

  it("assigns a case to a valid admin and unassigns it", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const assignee = await createAdminUser({ email: "assignee@baft.test", passwordHash, fullName: "Assignee" });
    await assignRoleToAdmin(assignee.id, fixtures.supportAdmin.id);

    const createRes = await supportAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Case E", description: "Desc", category: "account" });
    const caseId = createRes.body.data.case.id;

    const assignRes = await supportAgent.post(`/api/v1/support/cases/${caseId}/assign`).send({ adminId: assignee.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.case.assignedAdminId).toBe(assignee.id);

    const unassignRes = await supportAgent.post(`/api/v1/support/cases/${caseId}/assign`).send({ adminId: null });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.data.case.assignedAdminId).toBeNull();
  });

  it("rejects assigning to a nonexistent admin with 400", async () => {
    const createRes = await supportAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Case F", description: "Desc", category: "account" });
    const caseId = createRes.body.data.case.id;

    const res = await supportAgent
      .post(`/api/v1/support/cases/${caseId}/assign`)
      .send({ adminId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
  });

  it("adds a note, then resolves and closes the case", async () => {
    const createRes = await supportAgent
      .post("/api/v1/support/cases")
      .send({ userId: customerId, subject: "Case G", description: "Desc", category: "technical" });
    const caseId = createRes.body.data.case.id;

    const noteRes = await supportAgent.post(`/api/v1/support/cases/${caseId}/notes`).send({ note: "Called the customer." });
    expect(noteRes.status).toBe(201);
    expect(noteRes.body.data.event.eventType).toBe("NOTE_ADDED");

    const resolveRes = await supportAgent.post(`/api/v1/support/cases/${caseId}/resolve`).send({ note: "Fixed." });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.case.status).toBe("resolved");
    expect(resolveRes.body.data.case.resolvedAt).toBeTruthy();

    const closeRes = await supportAgent.post(`/api/v1/support/cases/${caseId}/close`).send({});
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.case.status).toBe("closed");
    expect(closeRes.body.data.case.closedAt).toBeTruthy();

    const getRes = await supportAgent.get(`/api/v1/support/cases/${caseId}`);
    const eventTypes = getRes.body.data.events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(["CASE_CREATED", "NOTE_ADDED", "RESOLVED", "CLOSED"]),
    );
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/support/cases");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role lacking the specific support_cases permission needed", async () => {
    const agent = await loginAsRole("growth@baft.test", fixtures.productGrowthAdmin.id);
    const res = await agent.get("/api/v1/support/cases");
    expect(res.status).toBe(403);
  });

  it("lets Risk/Fraud read cases but not create or mutate them", async () => {
    const agent = await loginAsRole("risk@baft.test", fixtures.riskFraudAdmin.id);
    expect((await agent.get("/api/v1/support/cases")).status).toBe(200);
    expect(
      (
        await agent
          .post("/api/v1/support/cases")
          .send({ userId: customerId, subject: "X", description: "Y", category: "other" })
      ).status,
    ).toBe(403);
  });
});
