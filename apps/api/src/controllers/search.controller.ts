import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { searchAll, type SearchRow } from "../repositories/search.repository.js";
import { SEARCH_RESOURCE_PERMISSIONS, SEARCH_RESOURCE_TYPES, type SearchResourceType } from "../constants/search.js";
import { searchQuerySchema } from "../validation/search.schema.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// The route the frontend would use to open this result's underlying
// resource. A device has no detail page of its own, so it routes to its
// owning user; an app issue has no detail route at all, so it falls back to
// the existing list page — never a new/duplicate detail page.
const buildUrl = (row: SearchRow): string => {
  switch (row.type) {
    case "user":
      return `/users/${row.id}`;
    case "device":
      return row.parent_id ? `/users/${row.parent_id}` : "/users";
    case "support_case":
      return `/support/cases/${row.id}`;
    case "app_issue":
      return "/support/app-issues";
    case "campaign":
      return `/campaigns/${row.id}`;
    case "reward":
      return `/rewards/${row.id}`;
    case "risk_case":
      return `/risk/cases/${row.id}`;
    case "security_case":
      return `/security/cases/${row.id}`;
    case "admin_user":
      return `/administration/admins/${row.id}`;
    case "approval":
      return `/approvals/${row.id}`;
  }
};

const serializeRow = (row: SearchRow) => ({
  type: row.type,
  id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  status: row.status,
  url: buildUrl(row),
});

export const globalSearchHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { q, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = parsed.data;
  const adminPermissions = req.admin?.permissions ?? [];

  // Visibility is derived entirely from the caller's EXISTING module
  // permissions — never a separate "search" permission, and never all types
  // by default. An admin with none of these ten permissions gets an empty
  // result set, not an error.
  const allowedTypes = SEARCH_RESOURCE_TYPES.filter((type) =>
    adminPermissions.includes(SEARCH_RESOURCE_PERMISSIONS[type as SearchResourceType]),
  );

  const offset = (page - 1) * limit;
  const { rows, total } = await searchAll({ query: q, allowedTypes: [...allowedTypes], limit, offset });

  sendSuccess(
    res,
    200,
    { query: q, results: rows.map(serializeRow) },
    { page, limit, total, hasNext: offset + rows.length < total },
  );
};
