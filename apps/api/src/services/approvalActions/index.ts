// Importing these for their side effect (registerApprovalAction calls) is
// the only place new action types get wired in. Import this module once,
// before the approval routes are used, so the registry is populated.
import "./securityUserActions.js";
import "./administrationRoleActions.js";
