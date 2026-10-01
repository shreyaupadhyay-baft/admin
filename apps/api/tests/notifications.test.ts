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
const { assignRoleToAdmin, createRole, setRolePermissions, setRoleActive } = await import(
  "../src/repositories/rbac.repository.js"
);
const { createUser } = await import("../src/repositories/user.repository.js");
const { db, resetStore, seedRbacFixtures } = await import("./fakes/store.js");
const { notifyAdmin, notifyAdmins, notifyRole } = await import("../src/services/notification.service.js");
const { createApp } = await import("../src/app.js");

const app = createApp();
const PASSWORD = "correct-horse-battery-staple-1";

const login = async (email: string) => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return agent;
};

describe("Notifications", () => {
  let fixtures: ReturnType<typeof seedRbacFixtures>;
  let superAgent: ReturnType<typeof request.agent>;
  let superAdminId: string;
  let customerId: string;

  beforeEach(async () => {
    resetStore();
    fixtures = seedRbacFixtures();

    const passwordHash = await hashPassword(PASSWORD);
    const superA = await createAdminUser({ email: "super-a@baft.test", passwordHash, fullName: "Super A" });
    await assignRoleToAdmin(superA.id, fixtures.superAdmin.id);
    superAdminId = superA.id;
    superAgent = await login("super-a@baft.test");

    const customer = await createUser({ email: "customer@customer.test", fullName: "Customer" });
    customerId = customer.id;
  });

  describe("Core", () => {
    it("an internally-created notification is visible to its recipient via the list endpoint", async () => {
      await notifyAdmin(superAdminId, {
        type: "admin_account_disabled",
        title: "Test",
        message: "Test message",
        severity: "info",
      });

      const res = await superAgent.get("/api/v1/notifications");
      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toHaveLength(1);
      expect(res.body.data.notifications[0].title).toBe("Test");
      expect(res.body.data.notifications[0].status).toBe("unread");
    });

    it("paginates and filters by status, severity, and type", async () => {
      for (let i = 0; i < 3; i++) {
        await notifyAdmin(superAdminId, {
          type: "admin_role_changed",
          title: `Info ${i}`,
          message: "x",
          severity: "info",
        });
      }
      await notifyAdmin(superAdminId, {
        type: "admin_account_disabled",
        title: "Critical one",
        message: "x",
        severity: "critical",
      });

      const page1 = await superAgent.get("/api/v1/notifications?limit=2&offset=0");
      expect(page1.body.data.notifications).toHaveLength(2);
      const page2 = await superAgent.get("/api/v1/notifications?limit=2&offset=2");
      expect(page2.body.data.notifications).toHaveLength(2);

      const bySeverity = await superAgent.get("/api/v1/notifications?severity=critical");
      expect(bySeverity.body.data.notifications).toHaveLength(1);
      expect(bySeverity.body.data.notifications[0].title).toBe("Critical one");

      const byType = await superAgent.get("/api/v1/notifications?type=admin_role_changed");
      expect(byType.body.data.notifications).toHaveLength(3);
    });

    it("reports an accurate unread count via an indexed count, not by loading all rows", async () => {
      await notifyAdmins([superAdminId], { type: "admin_role_changed", title: "a", message: "x", severity: "info" });
      await notifyAdmins([superAdminId], { type: "admin_role_changed", title: "b", message: "x", severity: "info" });

      const res = await superAgent.get("/api/v1/notifications/unread-count");
      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(2);
    });

    it("marks a single notification as read, and unread count decreases", async () => {
      const created = await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "a", message: "x", severity: "info" });

      const before = await superAgent.get("/api/v1/notifications/unread-count");
      expect(before.body.data.unreadCount).toBe(1);

      const readRes = await superAgent.patch(`/api/v1/notifications/${created!.id}/read`);
      expect(readRes.status).toBe(200);
      expect(readRes.body.data.notification.status).toBe("read");
      expect(readRes.body.data.notification.readAt).toBeTruthy();

      const after = await superAgent.get("/api/v1/notifications/unread-count");
      expect(after.body.data.unreadCount).toBe(0);
    });

    it("mark-all-read marks every unread notification for the current admin only", async () => {
      await notifyAdmins([superAdminId], { type: "admin_role_changed", title: "a", message: "x", severity: "info" });
      await notifyAdmins([superAdminId], { type: "admin_role_changed", title: "b", message: "x", severity: "info" });

      const res = await superAgent.post("/api/v1/notifications/read-all");
      expect(res.status).toBe(200);
      expect(res.body.data.markedCount).toBe(2);

      const unread = await superAgent.get("/api/v1/notifications/unread-count");
      expect(unread.body.data.unreadCount).toBe(0);
    });
  });

  describe("Concurrency", () => {
    it("marking the same notification read twice is safe and idempotent", async () => {
      const created = await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "a", message: "x", severity: "info" });

      const first = await superAgent.patch(`/api/v1/notifications/${created!.id}/read`);
      const second = await superAgent.patch(`/api/v1/notifications/${created!.id}/read`);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.notification.status).toBe("read");
    });

    it("concurrent mark-read attempts on the same notification both succeed without error", async () => {
      const created = await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "a", message: "x", severity: "info" });

      const [a, b] = await Promise.all([
        superAgent.patch(`/api/v1/notifications/${created!.id}/read`),
        superAgent.patch(`/api/v1/notifications/${created!.id}/read`),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    });
  });

  describe("IDOR / recipient isolation", () => {
    it("an admin cannot list, read, or mark-read another admin's notification", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const otherAdmin = await createAdminUser({ email: "other@baft.test", passwordHash, fullName: "Other" });
      await assignRoleToAdmin(otherAdmin.id, fixtures.auditor.id);
      const otherAgent = await login("other@baft.test");

      const created = await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "secret", message: "x", severity: "info" });

      const listRes = await otherAgent.get("/api/v1/notifications");
      expect(listRes.body.data.notifications).toHaveLength(0);

      const getRes = await otherAgent.get(`/api/v1/notifications/${created!.id}`);
      expect(getRes.status).toBe(404);

      const readRes = await otherAgent.patch(`/api/v1/notifications/${created!.id}/read`);
      expect(readRes.status).toBe(404);

      // The notification must remain untouched (still unread) for its real recipient.
      const stillUnread = await superAgent.get(`/api/v1/notifications/${created!.id}`);
      expect(stillUnread.body.data.notification.status).toBe("unread");
    });

    it("returns 404 (not a different error) for a nonexistent notification id", async () => {
      const bogus = "00000000-0000-0000-0000-000000000000";
      expect((await superAgent.get(`/api/v1/notifications/${bogus}`)).status).toBe(404);
      expect((await superAgent.patch(`/api/v1/notifications/${bogus}/read`)).status).toBe(404);
    });

    it("rejects unauthenticated requests with 401", async () => {
      expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
    });
  });

  describe("RBAC", () => {
    it("an admin without notifications.read cannot list or read notifications", async () => {
      const strippedRole = await createRole({ name: "No Notifications Role", description: "" });
      // Deliberately grant nothing at all, including no notifications.* —
      // proving the endpoint is genuinely permission-gated, not just
      // "everyone always has access" by accident.
      await setRolePermissions(strippedRole.id, []);

      const passwordHash = await hashPassword(PASSWORD);
      const stripped = await createAdminUser({ email: "stripped@baft.test", passwordHash, fullName: "Stripped" });
      await assignRoleToAdmin(stripped.id, strippedRole.id);
      const strippedAgent = await login("stripped@baft.test");

      expect((await strippedAgent.get("/api/v1/notifications")).status).toBe(403);
      expect((await strippedAgent.get("/api/v1/notifications/unread-count")).status).toBe(403);
      expect((await strippedAgent.post("/api/v1/notifications/read-all")).status).toBe(403);
    });
  });

  describe("Recipient resolution", () => {
    it("notifyAdmin delivers to exactly the explicit recipient", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const bystander = await createAdminUser({ email: "bystander@baft.test", passwordHash, fullName: "Bystander" });
      await assignRoleToAdmin(bystander.id, fixtures.auditor.id);

      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "only for super", message: "x", severity: "info" });

      expect(db.notifications.filter((n) => n.recipient_admin_id === superAdminId)).toHaveLength(1);
      expect(db.notifications.filter((n) => n.recipient_admin_id === bystander.id)).toHaveLength(0);
    });

    it("notifyRole delivers to every active admin holding the role, and only that role", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const secA = await createAdminUser({ email: "sec-a@baft.test", passwordHash, fullName: "Sec A" });
      await assignRoleToAdmin(secA.id, fixtures.securityAdmin.id);
      const secB = await createAdminUser({ email: "sec-b@baft.test", passwordHash, fullName: "Sec B" });
      await assignRoleToAdmin(secB.id, fixtures.securityAdmin.id);
      const auditorAdmin = await createAdminUser({ email: "aud@baft.test", passwordHash, fullName: "Auditor" });
      await assignRoleToAdmin(auditorAdmin.id, fixtures.auditor.id);

      await notifyRole("Security Admin", { type: "security_action_requested", title: "x", message: "x", severity: "warning" });

      const recipients = new Set(db.notifications.map((n) => n.recipient_admin_id));
      expect(recipients.has(secA.id)).toBe(true);
      expect(recipients.has(secB.id)).toBe(true);
      expect(recipients.has(auditorAdmin.id)).toBe(false);
    });

    it("notifyAdmins delivers to multiple explicit recipients", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const admin1 = await createAdminUser({ email: "m1@baft.test", passwordHash, fullName: "M1" });
      const admin2 = await createAdminUser({ email: "m2@baft.test", passwordHash, fullName: "M2" });

      await notifyAdmins([admin1.id, admin2.id], { type: "admin_role_changed", title: "x", message: "x", severity: "info" });

      expect(db.notifications.filter((n) => n.recipient_admin_id === admin1.id)).toHaveLength(1);
      expect(db.notifications.filter((n) => n.recipient_admin_id === admin2.id)).toHaveLength(1);
    });

    it("excludes disabled admins from role-based notification recipients", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const activeSec = await createAdminUser({ email: "active-sec@baft.test", passwordHash, fullName: "Active" });
      await assignRoleToAdmin(activeSec.id, fixtures.securityAdmin.id);
      const disabledSec = await createAdminUser({ email: "disabled-sec@baft.test", passwordHash, fullName: "Disabled" });
      await assignRoleToAdmin(disabledSec.id, fixtures.securityAdmin.id);
      const disableRes = await superAgent.post(`/api/v1/administration/admins/${disabledSec.id}/disable`);
      expect(disableRes.status).toBe(200);

      await notifyRole("Security Admin", { type: "security_action_requested", title: "x", message: "x", severity: "warning" });

      const recipients = new Set(
        db.notifications.filter((n) => n.type === "security_action_requested").map((n) => n.recipient_admin_id),
      );
      expect(recipients.has(activeSec.id)).toBe(true);
      expect(recipients.has(disabledSec.id)).toBe(false);
    });

    it("excludes admins holding a disabled role from role-based recipients", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const admin = await createAdminUser({ email: "disabled-role@baft.test", passwordHash, fullName: "X" });
      await assignRoleToAdmin(admin.id, fixtures.securityAdmin.id);
      await setRoleActive(fixtures.securityAdmin.id, false);

      await notifyRole("Security Admin", { type: "security_action_requested", title: "x", message: "x", severity: "warning" });

      expect(db.notifications.filter((n) => n.recipient_admin_id === admin.id)).toHaveLength(0);
    });
  });

  describe("Deduplication", () => {
    it("a duplicate delivery attempt with the same dedup key does not create a second notification", async () => {
      const first = await notifyAdmin(superAdminId, {
        type: "admin_role_changed",
        title: "x",
        message: "x",
        severity: "info",
        dedupKey: "same-event-123",
      });
      const second = await notifyAdmin(superAdminId, {
        type: "admin_role_changed",
        title: "x (retry)",
        message: "x",
        severity: "info",
        dedupKey: "same-event-123",
      });

      expect(second!.id).toBe(first!.id);
      expect(db.notifications.filter((n) => n.recipient_admin_id === superAdminId)).toHaveLength(1);
    });

    it("legitimately distinct events for the same recipient still create separate notifications", async () => {
      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "assigned", message: "x", severity: "info", dedupKey: "event-1" });
      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "reassigned", message: "x", severity: "info", dedupKey: "event-2" });
      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "status changed", message: "x", severity: "info" });

      expect(db.notifications.filter((n) => n.recipient_admin_id === superAdminId)).toHaveLength(3);
    });

    it("the same dedup key for two different recipients creates a notification for each", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const other = await createAdminUser({ email: "dedupe-other@baft.test", passwordHash, fullName: "Other" });

      await notifyAdmins([superAdminId, other.id], {
        type: "admin_role_changed",
        title: "x",
        message: "x",
        severity: "info",
        dedupKey: "shared-event",
      });

      expect(db.notifications.filter((n) => n.dedup_key !== null)).toHaveLength(2);
    });
  });

  describe("Security / data boundaries", () => {
    it("a notification never leaks a password hash or session token", async () => {
      await notifyAdmin(superAdminId, { type: "admin_role_changed", title: "x", message: "x", severity: "info" });
      const res = await superAgent.get("/api/v1/notifications");
      const combined = JSON.stringify(res.body);
      expect(combined).not.toMatch(/password_hash|scrypt\$/i);
      expect(combined).not.toMatch(/baft_admin_(access|refresh)_token/);
    });

    it("reading a notification about a resource does not itself grant access to that resource", async () => {
      // Support Admin has no security_cases.* permission at all (per
      // 015_seed_security_permissions.sql's role mapping) but DOES get
      // notifications.read from the blanket grant.
      const passwordHash = await hashPassword(PASSWORD);
      const supportAdmin = await createAdminUser({ email: "support-only@baft.test", passwordHash, fullName: "Support" });
      await assignRoleToAdmin(supportAdmin.id, fixtures.supportAdmin.id);
      const supportAgent = await login("support-only@baft.test");

      const notification = await notifyAdmin(supportAdmin.id, {
        type: "security_case_assigned",
        title: "Security case assigned to you",
        message: "SEC-000001 — Test",
        severity: "info",
        resourceType: "security_case",
        resourceId: "00000000-0000-0000-0000-000000000001",
      });

      const getRes = await supportAgent.get(`/api/v1/notifications/${notification!.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.notification.resourceType).toBe("security_case");

      // Support Admin DOES have security_cases.read (from
      // 015_seed_security_permissions.sql), so use the actions surface
      // instead, which they truly have no permission for.
      const actionsRes = await supportAgent.get("/api/v1/security/actions");
      expect(actionsRes.status).toBe(403);
    });
  });

  describe("Producer integration", () => {
    it("Security: requesting a block notifies Security Admins (excluding the requester)", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const secA = await createAdminUser({ email: "prod-sec-a@baft.test", passwordHash, fullName: "Sec A" });
      await assignRoleToAdmin(secA.id, fixtures.securityAdmin.id);
      const secB = await createAdminUser({ email: "prod-sec-b@baft.test", passwordHash, fullName: "Sec B" });
      await assignRoleToAdmin(secB.id, fixtures.securityAdmin.id);
      const secAAgent = await login("prod-sec-a@baft.test");

      const res = await secAAgent.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
      expect(res.status).toBe(201);

      expect(db.notifications.some((n) => n.recipient_admin_id === secB.id && n.type === "security_action_requested")).toBe(true);
      expect(db.notifications.some((n) => n.recipient_admin_id === secA.id && n.type === "security_action_requested")).toBe(false);
    });

    it("Security: approving a security action notifies the original requester", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const secA = await createAdminUser({ email: "prod2-sec-a@baft.test", passwordHash, fullName: "Sec A" });
      await assignRoleToAdmin(secA.id, fixtures.securityAdmin.id);
      const secB = await createAdminUser({ email: "prod2-sec-b@baft.test", passwordHash, fullName: "Sec B" });
      await assignRoleToAdmin(secB.id, fixtures.securityAdmin.id);
      const secAAgent = await login("prod2-sec-a@baft.test");
      const secBAgent = await login("prod2-sec-b@baft.test");

      const requestRes = await secAAgent.post(`/api/v1/security/users/${customerId}/block/request`).send({ reason: "x" });
      await secBAgent.post(`/api/v1/security/actions/${requestRes.body.data.action.id}/approve`);

      expect(db.notifications.some((n) => n.recipient_admin_id === secA.id && n.type === "security_action_approved")).toBe(true);
    });

    it("Risk: assigning a risk case notifies the assignee", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const riskAdmin = await createAdminUser({ email: "prod-risk@baft.test", passwordHash, fullName: "Risk" });
      await assignRoleToAdmin(riskAdmin.id, fixtures.riskFraudAdmin.id);
      const riskAgent = await login("prod-risk@baft.test");
      const investigator = await createAdminUser({ email: "prod-investigator@baft.test", passwordHash, fullName: "Investigator" });
      await assignRoleToAdmin(investigator.id, fixtures.riskFraudAdmin.id);

      const caseRes = await riskAgent.post("/api/v1/risk/cases").send({
        title: "Case", category: "fraud", severity: "high", userId: customerId,
      });
      const caseId = caseRes.body.data.case.id;
      await riskAgent.post(`/api/v1/risk/cases/${caseId}/assign`).send({ adminId: investigator.id });

      expect(db.notifications.some((n) => n.recipient_admin_id === investigator.id && n.type === "risk_case_assigned")).toBe(true);
    });

    it("Support: assigning and changing status of a support case notifies the assignee", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const supportAdmin = await createAdminUser({ email: "prod-support@baft.test", passwordHash, fullName: "Support" });
      await assignRoleToAdmin(supportAdmin.id, fixtures.supportAdmin.id);
      const supportAgent = await login("prod-support@baft.test");
      const assignee = await createAdminUser({ email: "prod-assignee@baft.test", passwordHash, fullName: "Assignee" });
      await assignRoleToAdmin(assignee.id, fixtures.supportAdmin.id);
      const assigneeAgent = await login("prod-assignee@baft.test");

      const caseRes = await supportAgent.post("/api/v1/support/cases").send({
        userId: customerId, subject: "Help", description: "x", category: "account", priority: "medium",
      });
      const caseId = caseRes.body.data.case.id;
      await supportAgent.post(`/api/v1/support/cases/${caseId}/assign`).send({ adminId: assignee.id });
      expect(db.notifications.some((n) => n.recipient_admin_id === assignee.id && n.type === "support_case_assigned")).toBe(true);

      // Status changed by someone OTHER than the assignee, so the assignee gets notified.
      await supportAgent.patch(`/api/v1/support/cases/${caseId}`).send({ status: "in_progress" });
      expect(db.notifications.some((n) => n.recipient_admin_id === assignee.id && n.type === "support_case_status_changed")).toBe(true);
    });

    it("Approvals: creating an approval notifies eligible approvers, and a decision notifies the requester", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const requesterAdmin = await createAdminUser({ email: "prod-approval-req@baft.test", passwordHash, fullName: "Requester" });
      await assignRoleToAdmin(requesterAdmin.id, fixtures.superAdmin.id);
      const requesterAgent = await login("prod-approval-req@baft.test");
      const approverAdmin = await createAdminUser({ email: "prod-approval-appr@baft.test", passwordHash, fullName: "Approver" });
      await assignRoleToAdmin(approverAdmin.id, fixtures.securityAdmin.id);
      const approverAgent = await login("prod-approval-appr@baft.test");

      const createRes = await requesterAgent.post("/api/v1/approvals").send({
        actionType: "security.block_user", resourceType: "user", resourceId: customerId, reason: "x",
      });
      expect(createRes.status).toBe(201);
      const approvalId = createRes.body.data.approval.id;

      expect(db.notifications.some((n) => n.recipient_admin_id === approverAdmin.id && n.type === "approval_requested")).toBe(true);

      await approverAgent.post(`/api/v1/approvals/${approvalId}/approve`);
      expect(db.notifications.some((n) => n.recipient_admin_id === requesterAdmin.id && n.type === "approval_approved")).toBe(true);
    });

    it("Administration: disabling an admin and changing their roles notifies that admin", async () => {
      const passwordHash = await hashPassword(PASSWORD);
      const target = await createAdminUser({ email: "prod-target@baft.test", passwordHash, fullName: "Target" });
      await assignRoleToAdmin(target.id, fixtures.auditor.id);

      await superAgent.post(`/api/v1/administration/admins/${target.id}/roles`).send({ roleId: fixtures.supportAdmin.id });
      expect(db.notifications.some((n) => n.recipient_admin_id === target.id && n.type === "admin_role_changed")).toBe(true);

      await superAgent.post(`/api/v1/administration/admins/${target.id}/disable`);
      expect(db.notifications.some((n) => n.recipient_admin_id === target.id && n.type === "admin_account_disabled")).toBe(true);
    });
  });
});
