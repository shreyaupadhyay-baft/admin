import { pool } from "../infrastructure/database/pool.js";
import type { Granularity, ResolvedRange } from "../utils/dateRange.js";

/**
 * Read-only SQL aggregations for the Analytics module.
 *
 * Rules:
 *  - Everything is aggregated in Postgres (COUNT / FILTER / GROUP BY / generate_series);
 *    no rows are loaded into Node to be counted.
 *  - Only counts are returned: never a user, device or case row, email, phone or provider id.
 *  - All values are bound parameters. The only interpolated SQL fragments are table/column
 *    names taken from the closed whitelists below, never from request input.
 *  - Ranges are half-open: created_at >= $1 AND created_at < $2 (UTC instants, see utils/dateRange.ts).
 *  - Any ORDER BY is fully deterministic (value DESC, key ASC / bucket ASC).
 */

const params = (r: ResolvedRange) => [r.start.toISOString(), r.endExclusive.toISOString()];
const inRange = (col: string) => `${col} >= $1::timestamptz AND ${col} < $2::timestamptz`;

const one = async <T>(sql: string, values: unknown[]): Promise<T> => {
  const { rows } = await pool.query(sql, values);
  return rows[0] as T;
};

export type UserCounts = { totalAsOfEnd: number; newInRange: number; activeStatusNow: number };
export const getUserCounts = (r: ResolvedRange) =>
  one<UserCounts>(
    `SELECT COUNT(*) FILTER (WHERE created_at < $2::timestamptz)::int AS "totalAsOfEnd",
            COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "newInRange",
            COUNT(*) FILTER (WHERE status = 'active')::int AS "activeStatusNow"
     FROM users`,
    params(r),
  );

export type DeviceCounts = { totalAsOfEnd: number; registeredInRange: number; usersWithDeviceAsOfEnd: number };
export const getDeviceCounts = (r: ResolvedRange) =>
  one<DeviceCounts>(
    `SELECT COUNT(*) FILTER (WHERE first_seen_at < $2::timestamptz)::int AS "totalAsOfEnd",
            COUNT(*) FILTER (WHERE ${inRange("first_seen_at")})::int AS "registeredInRange",
            COUNT(DISTINCT user_id) FILTER (WHERE first_seen_at < $2::timestamptz)::int AS "usersWithDeviceAsOfEnd"
     FROM devices`,
    params(r),
  );

/** Users created in the range, and how many of them have at least one registered device by the end of the range. */
export type OnboardingCounts = { usersCreated: number; withDevice: number };
export const getOnboardingCounts = (r: ResolvedRange) =>
  one<OnboardingCounts>(
    `SELECT COUNT(*)::int AS "usersCreated",
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.first_seen_at < $2::timestamptz
            ))::int AS "withDevice"
     FROM users u WHERE ${inRange("u.created_at")}`,
    params(r),
  );

export type VolumeCounts = { createdInRange: number; openNow: number };
export const getSupportCaseCounts = (r: ResolvedRange) =>
  one<VolumeCounts>(
    `SELECT COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "createdInRange",
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::int AS "openNow"
     FROM support_cases`,
    params(r),
  );
export const getAppIssueCounts = (r: ResolvedRange) =>
  one<VolumeCounts>(
    `SELECT COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "createdInRange",
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::int AS "openNow"
     FROM app_issues`,
    params(r),
  );
const CASE_TABLES = { risk_cases: "risk_cases", security_cases: "security_cases" } as const;
export type CaseTable = keyof typeof CASE_TABLES;
export const getCaseCounts = (table: CaseTable, r: ResolvedRange) =>
  one<VolumeCounts>(
    `SELECT COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "createdInRange",
            COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS "openNow"
     FROM ${CASE_TABLES[table]}`,
    params(r),
  );

export type CampaignCounts = { createdInRange: number; activeNow: number; completedNow: number };
export const getCampaignCounts = (r: ResolvedRange) =>
  one<CampaignCounts>(
    `SELECT COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "createdInRange",
            COUNT(*) FILTER (WHERE status = 'active')::int AS "activeNow",
            COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedNow"
     FROM campaigns`,
    params(r),
  );

export type RewardCounts = { createdInRange: number; activeNow: number; pausedNow: number; expiredNow: number };
export const getRewardCounts = (r: ResolvedRange) =>
  one<RewardCounts>(
    `SELECT COUNT(*) FILTER (WHERE ${inRange("created_at")})::int AS "createdInRange",
            COUNT(*) FILTER (WHERE status = 'active')::int AS "activeNow",
            COUNT(*) FILTER (WHERE status = 'paused')::int AS "pausedNow",
            COUNT(*) FILTER (WHERE status = 'expired')::int AS "expiredNow"
     FROM rewards`,
    params(r),
  );

// ───────────────────────── time series ─────────────────────────

const SERIES_SOURCES = {
  users: { table: "users", column: "created_at" },
  devices: { table: "devices", column: "first_seen_at" },
  support_cases: { table: "support_cases", column: "created_at" },
  app_issues: { table: "app_issues", column: "created_at" },
  campaigns: { table: "campaigns", column: "created_at" },
  rewards: { table: "rewards", column: "created_at" },
  risk_cases: { table: "risk_cases", column: "created_at" },
  security_cases: { table: "security_cases", column: "created_at" },
} as const;
export type SeriesSource = keyof typeof SERIES_SOURCES;

const INTERVALS: Record<Granularity, string> = { day: "1 day", week: "1 week", month: "1 month" };

export type SeriesPoint = { bucket: string; value: number };
/**
 * Zero-filled counts per UTC bucket. Buckets are generated in SQL so empty periods show 0 (a real
 * count of nothing), not a gap. Weeks start Monday; the first/last bucket may be partial because
 * only rows inside [start, endExclusive) are counted. Bucket label = bucket start date (UTC).
 */
export const getSeries = async (source: SeriesSource, r: ResolvedRange): Promise<SeriesPoint[]> => {
  const { table, column } = SERIES_SOURCES[source];
  const { rows } = await pool.query(
    `SELECT to_char(g.bucket, 'YYYY-MM-DD') AS bucket, COALESCE(c.n, 0)::int AS value
     FROM generate_series(
            date_trunc($3, $1::timestamptz AT TIME ZONE 'UTC'),
            ($2::timestamptz AT TIME ZONE 'UTC') - interval '1 microsecond',
            $4::interval
          ) AS g(bucket)
     LEFT JOIN (
       SELECT date_trunc($3, ${column} AT TIME ZONE 'UTC') AS bucket, COUNT(*)::int AS n
       FROM ${table}
       WHERE ${inRange(column)}
       GROUP BY 1
     ) c ON c.bucket = g.bucket
     ORDER BY g.bucket ASC`,
    [...params(r), r.granularity, INTERVALS[r.granularity]],
  );
  return rows as SeriesPoint[];
};

// ───────────────────────── breakdowns ─────────────────────────

/** mode "range": rows created/registered inside the range. mode "as_of_end": rows existing before endExclusive. */
const BREAKDOWN_SOURCES = {
  "users.status": { table: "users", dim: "status", time: "created_at", mode: "range" },
  "devices.platform": { table: "devices", dim: "platform", time: "first_seen_at", mode: "as_of_end" },
  "devices.status": { table: "devices", dim: "status", time: "first_seen_at", mode: "as_of_end" },
  "rewards.reward_type": { table: "rewards", dim: "reward_type", time: "created_at", mode: "range" },
  "rewards.status": { table: "rewards", dim: "status", time: "created_at", mode: "range" },
  "campaigns.campaign_type": { table: "campaigns", dim: "campaign_type", time: "created_at", mode: "range" },
  "campaigns.status": { table: "campaigns", dim: "status", time: "created_at", mode: "range" },
} as const;
export type BreakdownSource = keyof typeof BREAKDOWN_SOURCES;

export type BreakdownRow = { key: string; value: number };
export const getBreakdown = async (source: BreakdownSource, r: ResolvedRange): Promise<BreakdownRow[]> => {
  const { table, dim, time, mode } = BREAKDOWN_SOURCES[source];
  const where = mode === "range" ? inRange(time) : `${time} < $1::timestamptz`;
  const values = mode === "range" ? params(r) : [r.endExclusive.toISOString()];
  const { rows } = await pool.query(
    `SELECT ${dim} AS key, COUNT(*)::int AS value FROM ${table}
     WHERE ${where} GROUP BY ${dim} ORDER BY value DESC, key ASC`,
    values,
  );
  return rows as BreakdownRow[];
};
