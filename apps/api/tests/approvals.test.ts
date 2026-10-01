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
vi.mock("../src/repositories/approval.repository.js", () => import("./fakes/approval.repository.fake.js"));
vi.mock("../src/repositories/approvalEvent.repository.js", () => import("./fakes/approvalEvent.repository.fake.js"));
vi.mock("../src/repositories/notification.repository.js", () => import("./fakes/notification.repository.fake.js"));

const { hashPassword } = await import("../src/services/password.service.js");
const { createAdminUser } = await import("../src/repositories/adminUser.repository.js");
const { assignRoleToAdmin, createRole, setRolePermissions, listPermissions } = await import(
  "../src/repositories/rbac.repository.js"
);
const { createUser, findUserById } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { registerApprovalAction } = await import("../src/services/approvalAction.registry.js");
const { PERMISSIONS } = await import("../src/constants/permissions.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

// Generic-engine test-only action types, registered once for this file so
// engine behavior (execution success/failure representation, approver
// eligibility) can be exercised without depending on the specific production
// action handlers in services/approvalActions/*.
registerApprovalAction({
  actionType: "test.always_succeeds",
  requiredApprovalPermission: PERMISSIONS.APPROVALS_APPROVE,
  validateMetadata: (metadata) => metadata,
  execute: async () => ({ ok: true }),
});

registerApprovalAction({
  actionType: "test.always_fails",
  requiredApprovalPermission: PERMISSIONS.APPROVALS_APPROVE,
  validateMetadata: (metadata) => metadata,
  execute: async () => {
    throw new Error("simulated execution failure");
  },
});

registerApprovalAction({
  actionType: "test.restricted",
  // Security Admin (used as the generic approvals.approve holder in these
  // tests) has no campaigns.* permissions at all, so this proves the
  // blanket approvals.approve permission is not by itself sufficient.
  requiredApprovalPermission: PERMISSIONS.CAMPAIGNS_CREATE,
  validateMetadata: (metadata) => metadata,
  execute: async () => ({ ok: true }),
});

registerApprovalAction({
  actionType: "test.eligibility_gated",
  requiredApprovalPermission: PERMISSIONS.APPROVALS_APPROVE,
  validateMetadata: (metadata) => metadata,
  isApproverEligible: async (approver) => approver.permissions.includes("users.create"),
  execute: async () => ({ ok: true }),
});

const login = async (email: string) => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return agent;
};

describe("Approvals API", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let secondSuperAgent: ReturnType<typeof request.agent>;
  let securityAgent: ReturnType<typeof request.agent>;
  let auditorAgent: ReturnType<typeof request.agent>;
  let customerId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);

    const superA = await createAdminUser({ email: "super-a@baft.test", passwordHash, fullName: "Super A" });
    await assignRoleToAdmin(superA.id, fixtures.superAdmin.id);
    const superB = await createAdminUser({ email: "super-b@baft.test", passwordHash, fullName: "Super B" });
    await assignRoleToAdmin(superB.id, fixtures.superAdmin.id);
    const secAdmin = await createAdminUser({ email: "security@baft.test", passwordHash, fullName: "Security" });
    await assignRoleToAdmin(secAdmin.id, fixtures.securityAdmin.id);
    const auditorAdmin = await createAdminUser({ email: "auditor@baft.test", passwordHash, fullName: "Auditor" });
    await assignRoleToAdmin(auditorAdmin.id, fixtures.auditor.id);

    superAgent = await login("super-a@baft.test");
    secondSuperAgent = await login("super-b@baft.test");
    securityAgent = await login("security@baft.test");
    auditorAgent = await login("auditor@baft.test");

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  describe("CRUD and lifecycle", () => {
    it("creates an approval, gets it by id, and lists it", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "Suspected takeover.",
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.approval.status).toBe("requested");
      expect(createRes.body.data.approval.approvalNumber).toMatch(/^APR-\d{6}$/);
      const id = createRes.body.data.approval.id;

      const getRes = await superAgent.get(`/api/v1/approvals/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.approval.id).toBe(id);

      const listRes = await superAgent.get("/api/v1/approvals");
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.approvals.some((a: { id: string }) => a.id === id)).toBe(true);
    });

    it("returns 404 for a nonexistent approval and 400 for a malformed id", async () => {
      expect((await superAgent.get("/api/v1/approvals/00000000-0000-0000-0000-000000000000")).status).toBe(404);
      expect((await superAgent.get("/api/v1/approvals/not-a-uuid")).status).toBe(400);
    });

    it("approves a security.block_user approval and the underlying user is actually blocked", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const approveRes = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.approval.status).toBe("approved");
      expect(approveRes.body.data.approval.executionStatus).toBe("executed");

      expect((await findUserById(customerId))?.security_status).toBe("blocked");
    });

    it("rejects a requested approval", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const rejectRes = await securityAgent.post(`/api/v1/approvals/${id}/reject`).send({ reason: "Not enough evidence." });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.approval.status).toBe("rejected");
      expect(rejectRes.body.data.approval.rejectionReason).toBe("Not enough evidence.");

      expect((await findUserById(customerId))?.security_status).toBe("normal");
    });

    it("lets the requester cancel their own pending approval", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const cancelRes = await superAgent.post(`/api/v1/approvals/${id}/cancel`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.approval.status).toBe("cancelled");
    });

    it("rejects cancel by an unrelated admin without approvals.cancel", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const cancelRes = await securityAgent.post(`/api/v1/approvals/${id}/cancel`);
      expect(cancelRes.status).toBe(403);
    });

    it("no arbitrary transitions: rejects approve/reject/cancel on an already-terminal approval with 409", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;
      await securityAgent.post(`/api/v1/approvals/${id}/approve`);

      const reApprove = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(reApprove.status).toBe(409);
      expect(reApprove.body.error.code).toBe("INVALID_TRANSITION");

      const reReject = await securityAgent.post(`/api/v1/approvals/${id}/reject`).send({ reason: "x" });
      expect(reReject.status).toBe(409);

      const reCancel = await superAgent.post(`/api/v1/approvals/${id}/cancel`);
      expect(reCancel.status).toBe(409);
    });

    it("gets the approval's event timeline", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;
      await securityAgent.post(`/api/v1/approvals/${id}/approve`);

      const eventsRes = await superAgent.get(`/api/v1/approvals/${id}/events`);
      expect(eventsRes.status).toBe(200);
      const types = eventsRes.body.data.events.map((e: { eventType: string }) => e.eventType);
      expect(types).toEqual(["CREATED", "APPROVED", "EXECUTED"]);
    });
  });

  describe("Maker-checker enforcement", () => {
    it("rejects self-approval via direct API call with 403, even though the requester holds approvals.approve", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const selfApprove = await superAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(selfApprove.status).toBe(403);
      expect(selfApprove.body.error.code).toBe("SELF_APPROVAL_DENIED");

      expect((await findUserById(customerId))?.security_status).toBe("normal");
    });

    it("rejects self-rejection via direct API call with 403", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const selfReject = await superAgent.post(`/api/v1/approvals/${id}/reject`).send({ reason: "x" });
      expect(selfReject.status).toBe(403);
    });

    it("rejects a duplicate approve after the approval already reached a terminal state via a different admin (race lost)", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;
      await securityAgent.post(`/api/v1/approvals/${id}/reject`).send({ reason: "x" });

      const res = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(res.status).toBe(409);
    });
  });

  describe("RBAC per permission", () => {
    it("requires approvals.read to list or view approvals", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const opsAdmin = await createAdminUser({ email: "ops@baft.test", passwordHash, fullName: "Ops" });
      await assignRoleToAdmin(opsAdmin.id, fixtures.operationsAdmin.id);
      const opsAgent = await login("ops@baft.test");

      expect((await opsAgent.get("/api/v1/approvals")).status).toBe(403);
    });

    it("requires approvals.create to create an approval", async () => {
      expect((await securityAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      })).status).toBe(403);
    });

    it("requires approvals.approve to approve and approvals.reject to reject", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      expect((await auditorAgent.post(`/api/v1/approvals/${id}/approve`)).status).toBe(403);
      expect((await auditorAgent.post(`/api/v1/approvals/${id}/reject`).send({ reason: "x" })).status).toBe(403);
    });

    it("Auditor can read approvals and their events but cannot create, approve, reject, or cancel", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      expect((await auditorAgent.get("/api/v1/approvals")).status).toBe(200);
      expect((await auditorAgent.get(`/api/v1/approvals/${id}/events`)).status).toBe(200);
      expect((await auditorAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      })).status).toBe(403);
      expect((await auditorAgent.post(`/api/v1/approvals/${id}/cancel`)).status).toBe(403);
    });

    it("rejects unauthenticated requests with 401", async () => {
      expect((await request(app).get("/api/v1/approvals")).status).toBe(401);
    });
  });

  describe("Action registry and authorization", () => {
    it("rejects creating an approval with an unregistered actionType (no arbitrary handler injection)", async () => {
      const res = await superAgent.post("/api/v1/approvals").send({
        actionType: "some.totally_unregistered_action",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("UNKNOWN_ACTION_TYPE");
    });

    it("holding the blanket approvals.approve permission is not by itself sufficient for an action with a stricter required permission", async () => {
      // Security Admin holds approvals.approve but not administration.audit.read.
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.restricted",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const res = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(res.status).toBe(403);
    });

    it("enforces a per-action isApproverEligible check beyond the blanket permission", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.eligibility_gated",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      // securityAgent holds approvals.approve but not users.create -> ineligible.
      const ineligible = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(ineligible.status).toBe(403);
      expect(ineligible.body.error.code).toBe("NOT_ELIGIBLE_APPROVER");

      // secondSuperAgent (Super Admin) holds users.create -> eligible.
      const eligible = await secondSuperAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(eligible.status).toBe(200);
    });

    it("rejects a request to change the Super Admin role's permissions via the generic action (resource validation)", async () => {
      const res = await superAgent.post("/api/v1/approvals").send({
        actionType: "administration.role_permission_change",
        resourceType: "role",
        resourceId: fixtures.superAdmin.id,
        reason: "x",
        metadata: { permissionIds: [] },
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SUPER_ADMIN_ROLE_IMMUTABLE");
    });

    it("rejects a nonexistent resourceId for a role-scoped action", async () => {
      const res = await superAgent.post("/api/v1/approvals").send({
        actionType: "administration.role_permission_change",
        resourceType: "role",
        resourceId: "00000000-0000-0000-0000-000000000000",
        reason: "x",
        metadata: { permissionIds: [] },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ROLE_NOT_FOUND");
    });

    it("actually changes role permissions end to end, and only lets an approver who holds every granted permission approve it", async () => {
      const allPermissions = await listPermissions();
      const usersRead = allPermissions.find((p) => p.key === "users.read")!;
      const usersCreate = allPermissions.find((p) => p.key === "users.create")!;

      // A custom role that holds administration.roles.permissions.update
      // (so it can approve role-permission-change approvals in principle)
      // but does NOT hold users.create -> must be ineligible to approve a
      // grant that includes users.create.
      const limitedApproverRole = await createRole({ name: "Limited Approver", description: "" });
      const administrationRolesPermUpdate = allPermissions.find(
        (p) => p.key === "administration.roles.permissions.update",
      )!;
      const approvalsApprove = allPermissions.find((p) => p.key === "approvals.approve")!;
      await setRolePermissions(limitedApproverRole.id, [
        administrationRolesPermUpdate.id,
        approvalsApprove.id,
        usersRead.id,
      ]);
      const passwordHash = await hashPassword(PASSWORD);
      const limitedApprover = await createAdminUser({
        email: "limited-approver@baft.test",
        passwordHash,
        fullName: "Limited Approver",
      });
      await assignRoleToAdmin(limitedApprover.id, limitedApproverRole.id);
      const limitedAgent = await login("limited-approver@baft.test");

      const targetRole = await createRole({ name: "Target Role", description: "" });

      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "administration.role_permission_change",
        resourceType: "role",
        resourceId: targetRole.id,
        reason: "Grant read+create on users.",
        metadata: { permissionIds: [usersRead.id, usersCreate.id] },
      });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.approval.id;

      const ineligible = await limitedAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(ineligible.status).toBe(403);
      expect(ineligible.body.error.code).toBe("NOT_ELIGIBLE_APPROVER");

      const eligible = await secondSuperAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(eligible.status).toBe(200);
      expect(eligible.body.data.approval.executionStatus).toBe("executed");

      const grantedPermissions = await import("./fakes/store.js").then(({ db: liveDb }) =>
        liveDb.rolePermissions.filter((rp) => rp.role_id === targetRole.id).map((rp) => rp.permission_id),
      );
      expect(new Set(grantedPermissions)).toEqual(new Set([usersRead.id, usersCreate.id]));
    });
  });

  describe("Execution", () => {
    it("represents a failed execution without undoing the approval decision", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.always_fails",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const res = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(res.status).toBe(200);
      expect(res.body.data.approval.status).toBe("approved");
      expect(res.body.data.approval.executionStatus).toBe("failed");
      expect(res.body.data.approval.executionResult.error).toMatch(/simulated execution failure/);
    });

    it("a duplicate approval cannot execute twice: the second approve attempt on the same approval is rejected", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.always_succeeds",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const first = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(first.status).toBe(200);
      expect(first.body.data.approval.executionStatus).toBe("executed");

      const second = await securityAgent.post(`/api/v1/approvals/${id}/approve`);
      expect(second.status).toBe(409);
    });

    it("concurrent approval attempts on the same approval are safe: only one succeeds", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.always_succeeds",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;

      const [a, b] = await Promise.all([
        securityAgent.post(`/api/v1/approvals/${id}/approve`),
        secondSuperAgent.post(`/api/v1/approvals/${id}/approve`),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  describe("Idempotency", () => {
    it("returns the original approval on a duplicate idempotency key instead of creating a second one", async () => {
      const first = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
        idempotencyKey: "same-key-123",
      });
      expect(first.status).toBe(201);
      const firstId = first.body.data.approval.id;

      const second = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "a completely different reason that should be ignored",
        idempotencyKey: "same-key-123",
      });
      expect(second.status).toBe(200);
      expect(second.body.data.approval.id).toBe(firstId);
      expect(second.body.data.idempotentReplay).toBe(true);

      expect(db.approvals.filter((a) => a.idempotency_key === "same-key-123")).toHaveLength(1);
    });
  });

  describe("Audit behavior", () => {
    it("records APPROVAL_CREATED, APPROVAL_APPROVED, and APPROVAL_EXECUTED with actor/request identifiers", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const id = createRes.body.data.approval.id;
      await securityAgent.post(`/api/v1/approvals/${id}/approve`);

      const created = db.auditLogs.find((l) => l.action === "APPROVAL_CREATED" && l.target_id === id);
      expect(created).toBeDefined();
      expect(created?.actor_admin_id).toBeTruthy();
      expect(created?.request_id).toBeTruthy();
      expect(db.auditLogs.some((l) => l.action === "APPROVAL_APPROVED" && l.target_id === id)).toBe(true);
      expect(db.auditLogs.some((l) => l.action === "APPROVAL_EXECUTED" && l.target_id === id)).toBe(true);
    });

    it("records APPROVAL_EXECUTION_FAILED on a failed execution", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "test.always_fails",
        resourceType: "test",
        resourceId: "irrelevant",
        reason: "x",
      });
      const id = createRes.body.data.approval.id;
      await securityAgent.post(`/api/v1/approvals/${id}/approve`);

      expect(db.auditLogs.some((l) => l.action === "APPROVAL_EXECUTION_FAILED" && l.target_id === id)).toBe(true);
    });

    it("never leaks a password hash or session token in an approval response or audit record", async () => {
      const createRes = await superAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user",
        resourceType: "user",
        resourceId: customerId,
        reason: "x",
      });
      const combined = JSON.stringify({ createRes: createRes.body, auditLogs: db.auditLogs });
      expect(combined).not.toMatch(/password_hash|scrypt\$/i);
      expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
    });
  });

  describe("IDOR", () => {
    it("a nonexistent approval id returns 404 on approve/reject/cancel/events rather than leaking existence via a different code", async () => {
      const bogus = "00000000-0000-0000-0000-000000000000";
      expect((await securityAgent.post(`/api/v1/approvals/${bogus}/approve`)).status).toBe(404);
      expect((await securityAgent.post(`/api/v1/approvals/${bogus}/reject`).send({ reason: "x" })).status).toBe(404);
      expect((await superAgent.post(`/api/v1/approvals/${bogus}/cancel`)).status).toBe(404);
      expect((await superAgent.get(`/api/v1/approvals/${bogus}/events`)).status).toBe(404);
    });
  });
});
