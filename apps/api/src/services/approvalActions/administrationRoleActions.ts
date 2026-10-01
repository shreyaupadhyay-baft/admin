// Registers administration.role_permission_change as a generic-Approval
// action type — a second, additive front door for role permission edits,
// alongside Administration's existing direct PUT
// /administration/roles/:id/permissions endpoint (untouched by this file).
// Unlike the direct endpoint (where the actor applying the change must hold
// every permission being granted), this two-step flow shifts that "cannot
// grant what you don't hold" check to the APPROVER — the requester may
// legitimately be a lower-privileged admin proposing a change that only a
// more senior approver can ratify; that's the point of maker-checker here.
import { AppError } from "../../utils/response.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { findRoleById, listPermissionsByIds, setRolePermissions } from "../../repositories/rbac.repository.js";
import { assertRoleIsNotSuperAdmin } from "../privilegeEscalation.service.js";
import { registerApprovalAction } from "../approvalAction.registry.js";

const parsePermissionIds = (metadata: Record<string, unknown>): string[] => {
  const permissionIds = metadata.permissionIds;
  if (!Array.isArray(permissionIds) || !permissionIds.every((id) => typeof id === "string")) {
    throw new AppError("VALIDATION_ERROR", "metadata.permissionIds must be an array of permission ids.", 400);
  }
  return permissionIds;
};

registerApprovalAction({
  actionType: "administration.role_permission_change",
  requiredApprovalPermission: PERMISSIONS.ADMINISTRATION_ROLES_PERMISSIONS_UPDATE,

  validateMetadata: async (metadata) => {
    const permissionIds = parsePermissionIds(metadata);
    const found = await listPermissionsByIds(permissionIds);
    if (found.length !== new Set(permissionIds).size) {
      throw new AppError("PERMISSION_NOT_FOUND", "One or more permissionIds do not exist.", 400);
    }
    return { permissionIds };
  },

  validateResource: async (resourceId) => {
    const role = await findRoleById(resourceId);
    if (!role) {
      throw new AppError("ROLE_NOT_FOUND", "The referenced role does not exist.", 400);
    }
    // Same protection as the direct Administration endpoint — this generic
    // pathway must not become a backdoor around Super Admin immutability.
    assertRoleIsNotSuperAdmin(role.name, "have its permissions changed");
  },

  isApproverEligible: async (approver, approval) => {
    const permissionIds = (approval.request_metadata.permissionIds as string[]) ?? [];
    const grantedKeys = (await listPermissionsByIds(permissionIds)).map((p) => p.key);
    return grantedKeys.every((key) => approver.permissions.includes(key));
  },

  execute: async (approval) => {
    const permissionIds = (approval.request_metadata.permissionIds as string[]) ?? [];
    await setRolePermissions(approval.resource_id, permissionIds);
    return { roleId: approval.resource_id, permissionIds };
  },
});
