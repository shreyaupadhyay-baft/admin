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
const { createUser, findUserById } = await import("../src/repositories/user.repository.js");
const { createUserSession, listActiveUserSessions } = await import("../src/repositories/userSession.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

describe("Security Actions API (maker-checker)", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let adminA: ReturnType<typeof request.agent>;
  let adminB: ReturnType<typeof request.agent>;
  let customerId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const a = await createAdminUser({ email: "admin-a@baft.test", passwordHash, fullName: "Admin A" });
    await assignRoleToAdmin(a.id, fixtures.securityAdmin.id);
    const b = await createAdminUser({ email: "admin-b@baft.test", passwordHash, fullName: "Admin B" });
    await assignRoleToAdmin(b.id, fixtures.securityAdmin.id);

    adminA = request.agent(app);
    await adminA.post("/api/v1/auth/login").send({ email: "admin-a@baft.test", password: PASSWORD });
    adminB = request.agent(app);
    await adminB.post("/api/v1/auth/login").send({ email: "admin-b@baft.test", password: PASSWORD });

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  it("requests a block, Admin B approves it, and the user becomes blocked", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "Suspected takeover." });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.data.action.status).toBe("requested");
    const actionId = requestRes.body.data.action.id;

    const approveRes = await adminB.post(`/api/v1/security/actions/${actionId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.action.status).toBe("executed");
    expect(approveRes.body.data.action.approvedBy).toBeTruthy();

    const user = await findUserById(customerId);
    expect(user?.security_status).toBe("blocked");
  });

  it("rejects self-approval with 403, even though the requester holds the approve permission", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "Suspected takeover." });
    const actionId = requestRes.body.data.action.id;

    const selfApprove = await adminA.post(`/api/v1/security/actions/${actionId}/approve`);
    expect(selfApprove.status).toBe(403);

    const user = await findUserById(customerId);
    expect(user?.security_status).toBe("normal");
  });

  it("rejects a requested action", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "False alarm check." });
    const actionId = requestRes.body.data.action.id;

    const rejectRes = await adminB.post(`/api/v1/security/actions/${actionId}/reject`).send({ reason: "Not enough evidence." });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.action.status).toBe("rejected");

    const user = await findUserById(customerId);
    expect(user?.security_status).toBe("normal");
  });

  it("rejects approving an already-rejected action (rejected -> approved invalid)", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const actionId = requestRes.body.data.action.id;
    await adminB.post(`/api/v1/security/actions/${actionId}/reject`).send({});

    const res = await adminB.post(`/api/v1/security/actions/${actionId}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects a duplicate approval (executed -> approved invalid)", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const actionId = requestRes.body.data.action.id;
    await adminB.post(`/api/v1/security/actions/${actionId}/approve`);

    const res = await adminB.post(`/api/v1/security/actions/${actionId}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects rejecting an already-executed action (executed -> rejected invalid)", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const actionId = requestRes.body.data.action.id;
    await adminB.post(`/api/v1/security/actions/${actionId}/approve`);

    const res = await adminB.post(`/api/v1/security/actions/${actionId}/reject`).send({});
    expect(res.status).toBe(409);
  });

  it("rejects a second block request while one is already pending is not required, but blocking an already-blocked user is rejected", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    await adminB.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/approve`);

    const secondRequest = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "y" });
    expect(secondRequest.status).toBe(409);
  });

  it("runs the full unblock workflow with a different authorized admin approving", async () => {
    const blockRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    await adminB.post(`/api/v1/security/actions/${blockRes.body.data.action.id}/approve`);
    expect((await findUserById(customerId))?.security_status).toBe("blocked");

    const unblockRequest = await adminB.post(`/api/v1/security/users/${customerId}/unblock/request`).send({ reason: "Resolved." });
    expect(unblockRequest.status).toBe(201);

    const selfApproveUnblock = await adminB.post(`/api/v1/security/actions/${unblockRequest.body.data.action.id}/approve`);
    expect(selfApproveUnblock.status).toBe(403);

    const unblockApprove = await adminA.post(`/api/v1/security/actions/${unblockRequest.body.data.action.id}/approve`);
    expect(unblockApprove.status).toBe(200);
    expect((await findUserById(customerId))?.security_status).toBe("normal");
  });

  it("rejects requesting an unblock for a user who isn't blocked", async () => {
    const res = await adminA.post(`/api/v1/security/users/${customerId}/unblock/request`).send({ reason: "x" });
    expect(res.status).toBe(409);
  });

  it("force-logs-out a user, revoking their active sessions immediately with no approval step", async () => {
    await createUserSession({ userId: customerId });
    await createUserSession({ userId: customerId });
    expect(await listActiveUserSessions(customerId)).toHaveLength(2);

    const res = await adminA.post(`/api/v1/security/users/${customerId}/force-logout`).send({ reason: "Compromise suspected." });
    expect(res.status).toBe(201);
    expect(res.body.data.action.status).toBe("executed");
    expect(res.body.data.action.approvedBy).toBeNull();

    expect(await listActiveUserSessions(customerId)).toHaveLength(0);
  });

  it("revokes all sessions for a user immediately with no approval step", async () => {
    await createUserSession({ userId: customerId });
    const res = await adminA.post(`/api/v1/security/users/${customerId}/revoke-sessions`).send({ reason: "Password reset." });
    expect(res.status).toBe(201);
    expect(res.body.data.action.status).toBe("executed");
    expect(await listActiveUserSessions(customerId)).toHaveLength(0);
  });

  it("returns 404 for a nonexistent user, action, or malformed id (IDOR guards)", async () => {
    expect(
      (await adminA.post(`/api/v1/security/users/00000000-0000-0000-0000-000000000000/block/request`).send({ reason: "x" })).status,
    ).toBe(404);
    expect((await adminA.get("/api/v1/security/actions/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await adminA.get("/api/v1/security/actions/not-a-uuid")).status).toBe(400);
    expect((await adminA.post("/api/v1/security/users/not-a-uuid/block/request").send({ reason: "x" })).status).toBe(400);
  });

  it("rejects unauthenticated requests with 401", async () => {
    expect((await request(app).get("/api/v1/security/actions")).status).toBe(401);
  });

  it("rejects a role with security_cases.read but no security_actions.request from requesting a block", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const opsAdmin = await createAdminUser({ email: "ops@baft.test", passwordHash, fullName: "Ops" });
    await assignRoleToAdmin(opsAdmin.id, fixtures.operationsAdmin.id);
    const opsAgent = request.agent(app);
    await opsAgent.post("/api/v1/auth/login").send({ email: "ops@baft.test", password: PASSWORD });

    const res = await opsAgent.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    expect(res.status).toBe(403);
  });

  it("does not give approval permission merely because a role can investigate cases", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const riskAdmin = await createAdminUser({ email: "risk@baft.test", passwordHash, fullName: "Risk" });
    await assignRoleToAdmin(riskAdmin.id, fixtures.riskFraudAdmin.id);
    const riskAgent = request.agent(app);
    await riskAgent.post("/api/v1/auth/login").send({ email: "risk@baft.test", password: PASSWORD });

    // Risk/Fraud Admin can read security cases/events, but has no security_actions.* at all.
    expect((await riskAgent.get("/api/v1/security/cases")).status).toBe(200);
    expect((await riskAgent.get("/api/v1/security/actions")).status).toBe(403);

    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const approveAttempt = await riskAgent.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/approve`);
    expect(approveAttempt.status).toBe(403);
  });

  it("Auditor can read the approval trail but cannot request, approve, or reject", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const auditorAdmin = await createAdminUser({ email: "auditor@baft.test", passwordHash, fullName: "Auditor" });
    await assignRoleToAdmin(auditorAdmin.id, fixtures.auditor.id);
    const auditorAgent = request.agent(app);
    await auditorAgent.post("/api/v1/auth/login").send({ email: "auditor@baft.test", password: PASSWORD });

    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });

    expect((await auditorAgent.get("/api/v1/security/actions")).status).toBe(200);
    expect((await auditorAgent.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" })).status).toBe(403);
    expect((await auditorAgent.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/approve`)).status).toBe(403);
    expect((await auditorAgent.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/reject`).send({})).status).toBe(403);
  });

  it("records SECURITY_ACTION_REQUESTED, SECURITY_ACTION_APPROVED, and SECURITY_FORCE_LOGOUT with actor/request identifiers", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const actionId = requestRes.body.data.action.id;
    await adminB.post(`/api/v1/security/actions/${actionId}/approve`);
    await adminA.post(`/api/v1/security/users/${customerId}/force-logout`).send({ reason: "y" });

    const requested = db.auditLogs.find((l) => l.action === "SECURITY_ACTION_REQUESTED" && l.target_id === actionId);
    expect(requested).toBeDefined();
    expect(requested?.actor_admin_id).toBeTruthy();
    expect(requested?.request_id).toBeTruthy();

    expect(db.auditLogs.some((l) => l.action === "SECURITY_ACTION_APPROVED" && l.target_id === actionId)).toBe(true);
    expect(db.auditLogs.some((l) => l.action === "SECURITY_FORCE_LOGOUT")).toBe(true);
  });

  it("never leaks a password hash or session token in an action response or audit record", async () => {
    const requestRes = await adminA.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
    const combined = JSON.stringify({ requestRes: requestRes.body, auditLogs: db.auditLogs });
    expect(combined).not.toMatch(/password_hash|scrypt\$/i);
    expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
  });
});
