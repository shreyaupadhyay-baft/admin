import { apiGet } from "./client.js";

export type SearchResultType =
  | "user"
  | "device"
  | "support_case"
  | "app_issue"
  | "campaign"
  | "reward"
  | "risk_case"
  | "security_case"
  | "admin_user"
  | "approval";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  url: string;
};

export const globalSearch = async (
  query: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ query: string; results: SearchResult[]; page: number; limit: number; total: number; hasNext: boolean }> => {
  const qs = new URLSearchParams({ q: query });
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));

  const res = await apiGet<{ query: string; results: SearchResult[] }>(`/api/v1/search?${qs.toString()}`);
  return {
    query: res.data.query,
    results: res.data.results,
    page: (res.meta.page as number) ?? params.page ?? 1,
    limit: (res.meta.limit as number) ?? params.limit ?? 20,
    total: (res.meta.total as number) ?? 0,
    hasNext: Boolean(res.meta.hasNext),
  };
};

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  user: "Users",
  device: "Devices",
  support_case: "Support Cases",
  app_issue: "App Issues",
  campaign: "Campaigns",
  reward: "Rewards",
  risk_case: "Risk Cases",
  security_case: "Security Cases",
  admin_user: "Admins",
  approval: "Approvals",
};
