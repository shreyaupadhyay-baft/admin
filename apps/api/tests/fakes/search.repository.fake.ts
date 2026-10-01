import { db } from "./store.js";
import type { SearchResourceType } from "../../src/constants/search.js";

type FakeSearchRow = {
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

// Mirrors the real repository's matching/ranking semantics (case-insensitive
// contains/exact, 0/1/2 rank) closely enough to exercise the same behavior
// against the in-memory store, without needing a real Postgres connection.
const contains = (haystack: string | null | undefined, needle: string): boolean =>
  !!haystack && haystack.toLowerCase().includes(needle.toLowerCase());
const equalsCI = (a: string | null | undefined, b: string): boolean => !!a && a.toLowerCase() === b.toLowerCase();
const startsWithCI = (haystack: string, needle: string): boolean => haystack.toLowerCase().startsWith(needle.toLowerCase());

const rankFor = (id: string, title: string, query: string): number => {
  if (equalsCI(id, query)) return 0;
  if (startsWithCI(title, query)) return 1;
  return 2;
};

const BUILDERS: Record<SearchResourceType, (query: string) => FakeSearchRow[]> = {
  user: (query) =>
    db.users
      .filter(
        (u) =>
          equalsCI(u.id, query) ||
          equalsCI(u.phone_number, query) ||
          equalsCI(u.external_ref, query) ||
          contains(u.email, query) ||
          contains(u.full_name, query),
      )
      .map((u) => ({
        type: "user",
        id: u.id,
        title: u.full_name,
        subtitle: u.email,
        status: u.status,
        parent_id: null,
        match_rank: rankFor(u.id, u.full_name, query),
        created_at: u.created_at,
        total_count: "0",
      })),
  device: (query) =>
    db.devices
      .filter((d) => equalsCI(d.id, query) || equalsCI(d.user_id, query) || contains(d.device_ref, query))
      .map((d) => ({
        type: "device",
        id: d.id,
        title: d.device_ref,
        subtitle: d.platform,
        status: d.status,
        parent_id: d.user_id,
        match_rank: rankFor(d.id, d.device_ref, query),
        created_at: d.created_at,
        total_count: "0",
      })),
  support_case: (query) =>
    db.supportCases
      .filter((c) => equalsCI(c.id, query) || equalsCI(c.user_id, query) || contains(c.subject, query))
      .map((c) => ({
        type: "support_case",
        id: c.id,
        title: c.subject,
        subtitle: c.category,
        status: c.status,
        parent_id: c.user_id,
        match_rank: rankFor(c.id, c.subject, query),
        created_at: c.created_at,
        total_count: "0",
      })),
  app_issue: (query) =>
    db.appIssues
      .filter(
        (i) => equalsCI(i.id, query) || equalsCI(i.user_id, query) || contains(i.title, query) || contains(i.description, query),
      )
      .map((i) => ({
        type: "app_issue",
        id: i.id,
        title: i.title,
        subtitle: i.source,
        status: i.status,
        parent_id: i.user_id,
        match_rank: rankFor(i.id, i.title, query),
        created_at: i.created_at,
        total_count: "0",
      })),
  campaign: (query) =>
    db.campaigns
      .filter((c) => equalsCI(c.id, query) || equalsCI(c.status, query) || contains(c.name, query))
      .map((c) => ({
        type: "campaign",
        id: c.id,
        title: c.name,
        subtitle: c.campaign_type,
        status: c.status,
        parent_id: null,
        match_rank: rankFor(c.id, c.name, query),
        created_at: c.created_at,
        total_count: "0",
      })),
  reward: (query) =>
    db.rewards
      .filter((r) => equalsCI(r.id, query) || equalsCI(r.status, query) || contains(r.name, query))
      .map((r) => ({
        type: "reward",
        id: r.id,
        title: r.name,
        subtitle: r.reward_type,
        status: r.status,
        parent_id: null,
        match_rank: rankFor(r.id, r.name, query),
        created_at: r.created_at,
        total_count: "0",
      })),
  risk_case: (query) =>
    db.riskCases
      .filter((c) => equalsCI(c.id, query) || equalsCI(c.user_id, query) || equalsCI(c.case_number, query) || contains(c.title, query))
      .map((c) => ({
        type: "risk_case",
        id: c.id,
        title: c.title,
        subtitle: c.case_number,
        status: c.status,
        parent_id: c.user_id,
        match_rank: rankFor(c.id, c.title, query),
        created_at: c.created_at,
        total_count: "0",
      })),
  security_case: (query) =>
    db.securityCases
      .filter((c) => equalsCI(c.id, query) || equalsCI(c.user_id, query) || equalsCI(c.case_number, query) || contains(c.title, query))
      .map((c) => ({
        type: "security_case",
        id: c.id,
        title: c.title,
        subtitle: c.case_number,
        status: c.status,
        parent_id: c.user_id,
        match_rank: rankFor(c.id, c.title, query),
        created_at: c.created_at,
        total_count: "0",
      })),
  admin_user: (query) =>
    db.adminUsers
      .filter((a) => equalsCI(a.id, query) || contains(a.email, query) || contains(a.full_name, query))
      .map((a) => ({
        type: "admin_user",
        id: a.id,
        title: a.full_name,
        subtitle: a.email,
        status: a.is_active ? "active" : "disabled",
        parent_id: null,
        match_rank: rankFor(a.id, a.full_name, query),
        created_at: a.created_at,
        total_count: "0",
      })),
  approval: (query) =>
    db.approvals
      .filter((a) => equalsCI(a.id, query) || equalsCI(a.approval_number, query) || equalsCI(a.status, query) || contains(a.action_type, query))
      .map((a) => ({
        type: "approval",
        id: a.id,
        title: a.approval_number,
        subtitle: a.action_type,
        status: a.status,
        parent_id: null,
        match_rank: rankFor(a.id, a.approval_number, query),
        created_at: a.requested_at,
        total_count: "0",
      })),
};

export const searchAll = async (params: {
  query: string;
  allowedTypes: SearchResourceType[];
  limit: number;
  offset: number;
}): Promise<{ rows: FakeSearchRow[]; total: number }> => {
  if (params.allowedTypes.length === 0) return { rows: [], total: 0 };

  const combined = params.allowedTypes.flatMap((type) => BUILDERS[type](params.query));
  combined.sort((a, b) => {
    if (a.match_rank !== b.match_rank) return a.match_rank - b.match_rank;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.created_at.getTime() !== b.created_at.getTime()) return b.created_at.getTime() - a.created_at.getTime();
    return a.id.localeCompare(b.id);
  });

  const total = combined.length;
  const rows = combined.slice(params.offset, params.offset + params.limit).map((row) => ({ ...row, total_count: String(total) }));
  return { rows, total };
};
