import { USAGE_MAX_PAGE_SIZE } from 'librechat-data-provider';
import type {
  UsageSort,
  UsageRange,
  TUserUsage,
  TUsageTotals,
  TUsageResponse,
  TUserUsageModel,
  TUserUsageResponse,
} from 'librechat-data-provider';
import type { Model, PipelineStage } from 'mongoose';
import type { ITransaction } from '~/schema/transaction';
import type { IBalance, IUser } from '~/types';

export type UsageOptions = {
  range?: UsageRange;
  sort?: UsageSort;
  search?: string;
  page?: number;
  pageSize?: number;
  tenantId?: string;
  now?: Date;
};

export type UserUsageOptions = {
  userId: string;
  range?: UsageRange;
  tenantId?: string;
  now?: Date;
};

export type UsageMethods = {
  /** Per-user token and credit totals for the range; users with no usage are omitted. */
  getUsageByUser: (options?: UsageOptions) => Promise<TUsageResponse>;
  /** One user's totals for the range, broken down by model. */
  getUserUsageByModel: (options: UserUsageOptions) => Promise<TUserUsageResponse>;
};

type TotalsRow = Omit<TUsageTotals, 'totalTokens'>;
type UserRow = TotalsRow & { _id: { toString(): string }; lastActive: Date };
type ModelRow = TotalsRow & { _id: string };
type SummaryRow = TotalsRow & { users: number };
type FacetResult = { summary: SummaryRow[]; rows: UserRow[] };
type ModelFacetResult = { totals: TotalsRow[]; models: ModelRow[] };
type UserSummary = {
  _id: { toString(): string };
  name?: string;
  username?: string;
  email?: string;
};
type BalanceSummary = { user: { toString(): string }; tokenCredits?: number };

const dayMs = 24 * 60 * 60 * 1000;
const rangeDays: Record<UsageRange, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
const defaultRange: UsageRange = '30d';
const defaultPageSize = 20;
/** Bounds the user-id `$in` a search can produce. */
const searchUserLimit = 500;
const modelLimit = 100;

const sortStages: Record<UsageSort, Record<string, 1 | -1>> = {
  tokens: { totalTokens: -1, _id: 1 },
  credits: { credits: -1, _id: 1 },
  lastActive: { lastActive: -1, _id: 1 },
};

const absAmount = (field: string) => ({ $abs: { $ifNull: [field, 0] } });
const whenType = (tokenType: 'prompt' | 'completion', value: unknown) => ({
  $cond: [{ $eq: ['$tokenType', tokenType] }, value, 0],
});

/** Spend transactions store negative `rawAmount` (tokens) and `tokenValue` (credits). */
const totalsAccumulators = {
  promptTokens: { $sum: whenType('prompt', absAmount('$rawAmount')) },
  completionTokens: { $sum: whenType('completion', absAmount('$rawAmount')) },
  credits: { $sum: absAmount('$tokenValue') },
  requests: { $sum: whenType('prompt', 1) },
};

const modelSummaryAccumulators = {
  promptTokens: { $sum: '$promptTokens' },
  completionTokens: { $sum: '$completionTokens' },
  credits: { $sum: '$credits' },
  requests: { $sum: '$requests' },
};

const summaryAccumulators = { users: { $sum: 1 }, ...modelSummaryAccumulators };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tenantMatch(tenantId?: string) {
  return tenantId ? { tenantId } : { tenantId: { $exists: false } };
}

function resolveRange(range: UsageRange | undefined, now: Date) {
  const resolved = range && range in rangeDays ? range : defaultRange;
  return {
    range: resolved,
    from: new Date(now.getTime() - rangeDays[resolved] * dayMs),
    to: now,
  };
}

function toTotals(row?: TotalsRow): TUsageTotals {
  const promptTokens = row?.promptTokens ?? 0;
  const completionTokens = row?.completionTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    credits: Math.round(row?.credits ?? 0),
    requests: row?.requests ?? 0,
  };
}

function emptyResponse(range: UsageRange, from: Date, to: Date, page: number): TUsageResponse {
  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    summary: { ...toTotals(), users: 0 },
    users: [],
    page,
    pages: 1,
    total: 0,
  };
}

export function createUsageMethods(mongoose: typeof import('mongoose')): UsageMethods {
  async function findMatchingUserIds(search: string, tenantId?: string) {
    const User = mongoose.models.User as Model<IUser>;
    const pattern = new RegExp(escapeRegex(search), 'i');
    const users = await User.find({
      ...tenantMatch(tenantId),
      $or: [{ name: pattern }, { username: pattern }, { email: pattern }],
    })
      .select('_id')
      .limit(searchUserLimit)
      .lean<Array<{ _id: { toString(): string } }>>();
    return users.map((user) => user._id);
  }

  async function getUsageByUser(options: UsageOptions = {}): Promise<TUsageResponse> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const User = mongoose.models.User as Model<IUser>;
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(
      USAGE_MAX_PAGE_SIZE,
      Math.max(5, Math.floor(options.pageSize ?? defaultPageSize)),
    );
    const sort = options.sort && options.sort in sortStages ? options.sort : 'tokens';
    const { range, from, to } = resolveRange(options.range, options.now ?? new Date());
    const tenant = tenantMatch(options.tenantId);
    const search = options.search?.trim();

    const match: Record<string, unknown> = {
      ...tenant,
      tokenType: { $in: ['prompt', 'completion'] },
      createdAt: { $gte: from, $lte: to },
    };
    if (search) {
      const userIds = await findMatchingUserIds(search, options.tenantId);
      if (userIds.length === 0) {
        return emptyResponse(range, from, to, page);
      }
      match.user = { $in: userIds };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $group: { _id: '$user', ...totalsAccumulators, lastActive: { $max: '$createdAt' } } },
      { $addFields: { totalTokens: { $add: ['$promptTokens', '$completionTokens'] } } },
      {
        $facet: {
          summary: [{ $group: { _id: null, ...summaryAccumulators } }],
          rows: [
            { $sort: sortStages[sort] },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
          ],
        },
      },
    ];
    const [result] = await Transaction.aggregate<FacetResult>(pipeline);
    const summary = result?.summary[0];
    const rows = result?.rows ?? [];
    const total = summary?.users ?? 0;
    if (total === 0) {
      return emptyResponse(range, from, to, page);
    }

    const ids = rows.map((row) => row._id);
    const [users, balances] = await Promise.all([
      User.find({ ...tenant, _id: { $in: ids } })
        .select('_id name username email')
        .lean<UserSummary[]>(),
      Balance.find({ ...tenant, user: { $in: ids } })
        .select('user tokenCredits')
        .lean<BalanceSummary[]>(),
    ]);
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));
    const balancesByUser = new Map(
      balances.map((balance) => [balance.user.toString(), balance.tokenCredits ?? 0]),
    );

    const userRows: TUserUsage[] = rows.map((row) => {
      const userId = row._id.toString();
      const user = usersById.get(userId);
      return {
        ...toTotals(row),
        userId,
        name: user?.name || user?.username || '',
        email: user?.email ?? '',
        balance: balancesByUser.has(userId) ? Math.round(balancesByUser.get(userId) ?? 0) : null,
        lastActive: row.lastActive.toISOString(),
      };
    });

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      summary: { ...toTotals(summary), users: total },
      users: userRows,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      total,
    };
  }

  async function getUserUsageByModel(options: UserUsageOptions): Promise<TUserUsageResponse> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const { range, from, to } = resolveRange(options.range, options.now ?? new Date());
    if (!mongoose.isValidObjectId(options.userId)) {
      return { userId: options.userId, range, totals: toTotals(), models: [] };
    }

    const [result] = await Transaction.aggregate<ModelFacetResult>([
      {
        $match: {
          ...tenantMatch(options.tenantId),
          user: new mongoose.Types.ObjectId(options.userId),
          tokenType: { $in: ['prompt', 'completion'] },
          createdAt: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: { $ifNull: ['$model', ''] }, ...totalsAccumulators } },
      {
        $facet: {
          totals: [{ $group: { _id: null, ...modelSummaryAccumulators } }],
          models: [
            { $addFields: { totalTokens: { $add: ['$promptTokens', '$completionTokens'] } } },
            { $sort: { totalTokens: -1, _id: 1 } },
            { $limit: modelLimit },
          ],
        },
      },
    ]);

    const models: TUserUsageModel[] = (result?.models ?? []).map((row) => ({
      ...toTotals(row),
      model: row._id,
    }));
    return { userId: options.userId, range, totals: toTotals(result?.totals[0]), models };
  }

  return { getUsageByUser, getUserUsageByModel };
}
