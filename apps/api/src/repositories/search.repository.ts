import { pool } from "../infrastructure/database/pool.js";
import type { SearchResourceType } from "../constants/search.js";
import { escapeLikeSpecials } from "../utils/sql.js";

export type SearchRow = {
  type: SearchResourceType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  parent_id: string | null;
  match_rank: number;
  created_at: Date;
  total_count: string;
};

// Each branch outputs the exact same column shape so they can be UNION ALL'd
// together; match_rank (0 = exact id match, 1 = the title field starts with
// the term, 2 = everything else that matched) is deliberately technical and
// deterministic — never a subjective "business relevance" score.
const BRANCH_BUILDERS: Record<SearchResourceType, () => string> = {
  user: () => `
    SELECT 'user' AS type, id, full_name AS title, email AS subtitle, status, NULL::uuid AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN full_name ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM users
    WHERE id::text ILIKE $1 ESCAPE '\\' OR phone_number ILIKE $1 ESCAPE '\\' OR external_ref ILIKE $1 ESCAPE '\\'
      OR email ILIKE $2 ESCAPE '\\' OR full_name ILIKE $2 ESCAPE '\\'
  `,
  device: () => `
    SELECT 'device' AS type, id, device_ref AS title, platform AS subtitle, status, user_id AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN device_ref ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM devices
    WHERE id::text ILIKE $1 ESCAPE '\\' OR user_id::text ILIKE $1 ESCAPE '\\' OR device_ref ILIKE $2 ESCAPE '\\'
  `,
  support_case: () => `
    SELECT 'support_case' AS type, id, subject AS title, category AS subtitle, status, user_id AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN subject ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM support_cases
    WHERE id::text ILIKE $1 ESCAPE '\\' OR user_id::text ILIKE $1 ESCAPE '\\' OR subject ILIKE $2 ESCAPE '\\'
  `,
  app_issue: () => `
    SELECT 'app_issue' AS type, id, title AS title, source AS subtitle, status, user_id AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM app_issues
    WHERE id::text ILIKE $1 ESCAPE '\\' OR user_id::text ILIKE $1 ESCAPE '\\' OR title ILIKE $2 ESCAPE '\\' OR description ILIKE $2 ESCAPE '\\'
  `,
  campaign: () => `
    SELECT 'campaign' AS type, id, name AS title, campaign_type AS subtitle, status, NULL::uuid AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN name ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM campaigns
    WHERE id::text ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\' OR name ILIKE $2 ESCAPE '\\'
  `,
  reward: () => `
    SELECT 'reward' AS type, id, name AS title, reward_type AS subtitle, status, NULL::uuid AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN name ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM rewards
    WHERE id::text ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\' OR name ILIKE $2 ESCAPE '\\'
  `,
  risk_case: () => `
    SELECT 'risk_case' AS type, id, title AS title, case_number AS subtitle, status, user_id AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM risk_cases
    WHERE id::text ILIKE $1 ESCAPE '\\' OR user_id::text ILIKE $1 ESCAPE '\\' OR case_number ILIKE $1 ESCAPE '\\' OR title ILIKE $2 ESCAPE '\\'
  `,
  security_case: () => `
    SELECT 'security_case' AS type, id, title AS title, case_number AS subtitle, status, user_id AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM security_cases
    WHERE id::text ILIKE $1 ESCAPE '\\' OR user_id::text ILIKE $1 ESCAPE '\\' OR case_number ILIKE $1 ESCAPE '\\' OR title ILIKE $2 ESCAPE '\\'
  `,
  admin_user: () => `
    SELECT 'admin_user' AS type, id, full_name AS title, email AS subtitle,
      CASE WHEN is_active THEN 'active' ELSE 'disabled' END AS status, NULL::uuid AS parent_id, created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN full_name ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM admin_users
    WHERE id::text ILIKE $1 ESCAPE '\\' OR email ILIKE $2 ESCAPE '\\' OR full_name ILIKE $2 ESCAPE '\\'
  `,
  approval: () => `
    SELECT 'approval' AS type, id, approval_number AS title, action_type AS subtitle, status, NULL::uuid AS parent_id, requested_at AS created_at,
      CASE WHEN id::text ILIKE $1 ESCAPE '\\' THEN 0 WHEN approval_number ILIKE $3 ESCAPE '\\' THEN 1 ELSE 2 END AS match_rank
    FROM approvals
    WHERE id::text ILIKE $1 ESCAPE '\\' OR approval_number ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\' OR action_type ILIKE $2 ESCAPE '\\'
  `,
};

export const searchAll = async (params: {
  query: string;
  allowedTypes: SearchResourceType[];
  limit: number;
  offset: number;
}): Promise<{ rows: SearchRow[]; total: number }> => {
  if (params.allowedTypes.length === 0) {
    // No permitted resource type at all — never run a zero-branch UNION.
    return { rows: [], total: 0 };
  }

  const escaped = escapeLikeSpecials(params.query);
  const exactParam = escaped;
  const containsParam = `%${escaped}%`;
  const prefixParam = `${escaped}%`;

  const branches = params.allowedTypes.map((type) => BRANCH_BUILDERS[type]());
  const limitIndex = 4;
  const offsetIndex = 5;

  const { rows } = await pool.query<SearchRow>(
    `SELECT *, COUNT(*) OVER() AS total_count FROM (
       ${branches.join(" UNION ALL ")}
     ) combined
     ORDER BY match_rank ASC, type ASC, created_at DESC, id ASC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [exactParam, containsParam, prefixParam, params.limit, params.offset],
  );

  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  return { rows, total };
};
