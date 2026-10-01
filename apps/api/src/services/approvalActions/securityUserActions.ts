// Registers security.block_user / security.unblock_user as generic-Approval
// action types. This is a SECOND, additive front door onto the exact same
// underlying primitive (updateUserSecurityStatus) that Security's own
// dedicated maker-checker flow (security_actions table, POST
// /security/users/:userId/block/request, etc.) already uses — that flow is
// completely untouched by this file. An admin can use either front door;
// neither one knows about the other. See the integration-boundary note in
// the final report for why the two flows were kept separate rather than
// merged.
import { AppError } from "../../utils/response.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { findUserById, updateUserSecurityStatus } from "../../repositories/user.repository.js";
import { registerApprovalAction } from "../approvalAction.registry.js";

const validateUserResource = async (resourceId: string): Promise<void> => {
  const user = await findUserById(resourceId);
  if (!user) {
    throw new AppError("RESOURCE_NOT_FOUND", "The referenced user does not exist.", 400);
  }
};

registerApprovalAction({
  actionType: "security.block_user",
  // Reuses Security's own approve permission as the domain-specific gate:
  // only an admin who could approve via Security's native flow may approve
  // this alternate one either.
  requiredApprovalPermission: PERMISSIONS.SECURITY_ACTIONS_APPROVE,
  validateMetadata: () => ({}),
  validateResource: validateUserResource,
  execute: async (approval) => {
    await updateUserSecurityStatus(approval.resource_id, "blocked");
    return { userId: approval.resource_id, newSecurityStatus: "blocked" };
  },
});

registerApprovalAction({
  actionType: "security.unblock_user",
  requiredApprovalPermission: PERMISSIONS.SECURITY_ACTIONS_APPROVE,
  validateMetadata: () => ({}),
  validateResource: validateUserResource,
  execute: async (approval) => {
    await updateUserSecurityStatus(approval.resource_id, "normal");
    return { userId: approval.resource_id, newSecurityStatus: "normal" };
  },
});
