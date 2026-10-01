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
const { resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("App Issues API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let supportAgent: ReturnType<typeof request.agent>;
  let reporterId: string;

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

    const reporter = await createUser({ email: "reporter@customer.test", fullName: "Reporter" });
    reporterId = reporter.id;
  });

  it("creates a user-reported app issue", async () => {
    const res = await supportAgent.post("/api/v1/support/app-issues").send({
      userId: reporterId,
      source: "USER_REPORTED",
      title: "App crashes on startup",
      description: "Crashes immediately after splash screen.",
      severity: "high",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.appIssue.source).toBe("USER_REPORTED");
    expect(res.body.data.appIssue.status).toBe("open");
  });

  it("creates an in-app issue with no reporting user", async () => {
    const res = await supportAgent.post("/api/v1/support/app-issues").send({
      source: "IN_APP",
      title: "Crash loop detected",
      description: "Auto-detected from crash telemetry.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.appIssue.userId).toBeNull();
  });

  it("rejects creation referencing a nonexistent user with 400", async () => {
    const res = await supportAgent.post("/api/v1/support/app-issues").send({
      userId: "00000000-0000-0000-0000-000000000000",
      source: "USER_REPORTED",
      title: "X",
      description: "Y",
    });
    expect(res.status).toBe(400);
  });

  it("lists and gets issues, returns 404 for a nonexistent one and 400 for a malformed id", async () => {
    const createRes = await supportAgent.post("/api/v1/support/app-issues").send({
      source: "IN_APP",
      title: "Issue A",
      description: "Desc",
    });
    const issueId = createRes.body.data.appIssue.id;

    expect((await supportAgent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect((await supportAgent.get(`/api/v1/support/app-issues/${issueId}`)).status).toBe(200);
    expect((await supportAgent.get("/api/v1/support/app-issues/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await supportAgent.get("/api/v1/support/app-issues/not-a-uuid")).status).toBe(400);
  });

  it("updates fields and moves to a non-terminal status, but rejects 'resolved' via PATCH", async () => {
    const createRes = await supportAgent.post("/api/v1/support/app-issues").send({
      source: "IN_APP",
      title: "Issue B",
      description: "Desc",
    });
    const issueId = createRes.body.data.appIssue.id;

    const fieldRes = await supportAgent.patch(`/api/v1/support/app-issues/${issueId}`).send({ severity: "critical" });
    expect(fieldRes.status).toBe(200);
    expect(fieldRes.body.data.appIssue.severity).toBe("critical");

    const statusRes = await supportAgent.patch(`/api/v1/support/app-issues/${issueId}`).send({ status: "in_progress" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.appIssue.status).toBe("in_progress");

    const badRes = await supportAgent.patch(`/api/v1/support/app-issues/${issueId}`).send({ status: "resolved" });
    expect(badRes.status).toBe(400);
  });

  it("assigns, unassigns, and resolves an issue via dedicated endpoints", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const assignee = await createAdminUser({ email: "assignee2@baft.test", passwordHash, fullName: "Assignee" });
    await assignRoleToAdmin(assignee.id, fixtures.supportAdmin.id);

    const createRes = await supportAgent.post("/api/v1/support/app-issues").send({
      source: "IN_APP",
      title: "Issue C",
      description: "Desc",
    });
    const issueId = createRes.body.data.appIssue.id;

    const assignRes = await supportAgent
      .post(`/api/v1/support/app-issues/${issueId}/assign`)
      .send({ adminId: assignee.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.appIssue.assignedAdminId).toBe(assignee.id);

    const unassignRes = await supportAgent.post(`/api/v1/support/app-issues/${issueId}/assign`).send({ adminId: null });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.data.appIssue.assignedAdminId).toBeNull();

    const resolveRes = await supportAgent.post(`/api/v1/support/app-issues/${issueId}/resolve`);
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.appIssue.status).toBe("resolved");
    expect(resolveRes.body.data.appIssue.resolvedAt).toBeTruthy();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/support/app-issues");
    expect(res.status).toBe(401);
  });

  it("allows Engineering Admin to read app issues but not mutate them", async () => {
    const agent = await loginAsRole("eng@baft.test", fixtures.engineeringAdmin.id);
    expect((await agent.get("/api/v1/support/app-issues")).status).toBe(200);
    expect(
      (await agent.post("/api/v1/support/app-issues").send({ source: "IN_APP", title: "X", description: "Y" })).status,
    ).toBe(403);
  });

  it("returns 403 for a role with no app_issues permission at all", async () => {
    const agent = await loginAsRole("security@baft.test", fixtures.securityAdmin.id);
    const res = await agent.get("/api/v1/support/app-issues");
    expect(res.status).toBe(403);
  });
});
