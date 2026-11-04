import { logger } from '@librechat/data-schemas';
import {
  USAGE_SORTS,
  USAGE_RANGES,
  USAGE_MAX_PAGE_SIZE,
  USAGE_SEARCH_MIN_LENGTH,
  USAGE_SEARCH_MAX_LENGTH,
} from 'librechat-data-provider';
import type { UsageRange, UsageSort } from 'librechat-data-provider';
import type { UsageMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

export type UsageHandlerDeps = Pick<UsageMethods, 'getUsageByUser' | 'getUserUsageByModel'>;

type UserUsageParams = { userId?: string };
type UsageRouteHandler = (req: ServerRequest, res: Response) => Promise<void>;

export type UsageHandlers = {
  listUsage: UsageRouteHandler;
  getUserUsage: UsageRouteHandler;
  getMyUsage: UsageRouteHandler;
};

const objectIdPattern = /^[a-f\d]{24}$/i;

const firstQueryValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }
  return typeof value === 'string' ? value.trim() || undefined : undefined;
};

const positiveInteger = (value: unknown): number | undefined => {
  const parsed = Number.parseInt(firstQueryValue(value) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined => {
  const candidate = firstQueryValue(value);
  return allowed.find((option) => option === candidate);
};

const searchValue = (value: unknown): string | undefined => {
  const search = firstQueryValue(value)?.slice(0, USAGE_SEARCH_MAX_LENGTH);
  return search && search.length >= USAGE_SEARCH_MIN_LENGTH ? search : undefined;
};

/** Reached only after `requireCapability(READ_USAGE)`, so it just confirms access. */
export function createUsageAccessHandler(): (req: ServerRequest, res: Response) => void {
  return (_req: ServerRequest, res: Response): void => {
    res.json({ access: true });
  };
}

export function createUsageHandlers({
  getUsageByUser,
  getUserUsageByModel,
}: UsageHandlerDeps): UsageHandlers {
  async function listUsage(req: ServerRequest, res: Response): Promise<void> {
    try {
      const pageSize = positiveInteger(req.query.pageSize);
      const usage = await getUsageByUser({
        tenantId: req.user?.tenantId,
        range: oneOf<UsageRange>(USAGE_RANGES, req.query.range),
        sort: oneOf<UsageSort>(USAGE_SORTS, req.query.sort),
        search: searchValue(req.query.search),
        page: positiveInteger(req.query.page),
        pageSize: pageSize ? Math.min(pageSize, USAGE_MAX_PAGE_SIZE) : undefined,
      });
      res.json(usage);
    } catch (error) {
      logger.error('[Usage] Failed to load usage by user', error);
      res.status(500).json({ message: 'Failed to load usage', code: 'USAGE_LOAD_FAILED' });
    }
  }

  async function sendUserUsage(userId: string, req: ServerRequest, res: Response): Promise<void> {
    try {
      const usage = await getUserUsageByModel({
        userId,
        tenantId: req.user?.tenantId,
        range: oneOf<UsageRange>(USAGE_RANGES, req.query.range),
      });
      res.json(usage);
    } catch (error) {
      logger.error('[Usage] Failed to load user usage', error);
      res.status(500).json({ message: 'Failed to load usage', code: 'USAGE_LOAD_FAILED' });
    }
  }

  async function getUserUsage(req: ServerRequest, res: Response): Promise<void> {
    const { userId } = req.params as UserUsageParams;
    if (!userId || !objectIdPattern.test(userId)) {
      res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      return;
    }
    await sendUserUsage(userId, req, res);
  }

  /** The caller's own usage: the id comes from the session only, never the request. */
  async function getMyUsage(req: ServerRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }
    await sendUserUsage(userId, req, res);
  }

  return { listUsage, getUserUsage, getMyUsage };
}
