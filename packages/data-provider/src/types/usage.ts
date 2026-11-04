export type UsageRange = '24h' | '7d' | '30d' | '90d';
export type UsageSort = 'tokens' | 'credits' | 'lastActive';

export const USAGE_RANGES: readonly UsageRange[] = ['24h', '7d', '30d', '90d'];
export const USAGE_SORTS: readonly UsageSort[] = ['tokens', 'credits', 'lastActive'];
export const USAGE_SEARCH_MIN_LENGTH = 2;
export const USAGE_SEARCH_MAX_LENGTH = 200;
export const USAGE_MAX_PAGE_SIZE = 50;

export type TUsageParams = {
  range?: UsageRange;
  sort?: UsageSort;
  search?: string;
  page?: number;
  pageSize?: number;
};

/** Token counts are absolute; `credits` is the balance spent (1,000,000 credits = $1). */
export type TUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  credits: number;
  /** Prompt transactions recorded, one per model call. */
  requests: number;
};

export type TUserUsage = TUsageTotals & {
  userId: string;
  name: string;
  email: string;
  /** Remaining `tokenCredits`, or `null` when the user has no balance record. */
  balance: number | null;
  lastActive: string;
};

export type TUsageResponse = {
  range: UsageRange;
  from: string;
  to: string;
  summary: TUsageTotals & { users: number };
  users: TUserUsage[];
  page: number;
  pages: number;
  total: number;
};

export type TUserUsageModel = TUsageTotals & { model: string };

export type TUserUsageResponse = {
  userId: string;
  range: UsageRange;
  /** Across every model, not only the `models` returned (capped at 100). */
  totals: TUsageTotals;
  models: TUserUsageModel[];
};

export type TUsageAccessResponse = { access: true };
