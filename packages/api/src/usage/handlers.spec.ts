import type { TUsageResponse, TUserUsageResponse } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createUsageAccessHandler, createUsageHandlers } from './handlers';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

const emptyUsage: TUsageResponse = {
  range: '30d',
  from: '2026-10-05T00:00:00.000Z',
  to: '2026-11-04T00:00:00.000Z',
  summary: {
    users: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    credits: 0,
    requests: 0,
  },
  users: [],
  page: 1,
  pages: 1,
  total: 0,
};
const userUsage: TUserUsageResponse = {
  userId: 'a'.repeat(24),
  range: '7d',
  totals: emptyUsage.summary,
  models: [],
};

const createResponse = () => {
  const statusJson = jest.fn();
  const status = jest.fn().mockReturnValue({ json: statusJson });
  const json = jest.fn();
  return { response: { status, json } as Partial<Response> as Response, status, statusJson, json };
};

const createRequest = (
  query: ServerRequest['query'] = {},
  params: Record<string, string> = {},
): ServerRequest =>
  ({
    query,
    params,
    user: { id: 'admin-id', role: 'ADMIN', tenantId: 'tenant-a' },
  }) as unknown as ServerRequest;

const createDeps = () => ({
  getUsageByUser: jest.fn().mockResolvedValue(emptyUsage),
  getUserUsageByModel: jest.fn().mockResolvedValue(userUsage),
});

describe('createUsageAccessHandler', () => {
  it('confirms access', () => {
    const { response, json } = createResponse();
    createUsageAccessHandler()(createRequest(), response);
    expect(json).toHaveBeenCalledWith({ access: true });
  });
});

describe('listUsage', () => {
  it('passes validated query values and the caller tenant', async () => {
    const deps = createDeps();
    const { response, json } = createResponse();

    await createUsageHandlers(deps).listUsage(
      createRequest({
        range: '7d',
        sort: 'credits',
        search: ' alice ',
        page: '2',
        pageSize: '500',
      }),
      response,
    );

    expect(deps.getUsageByUser).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      range: '7d',
      sort: 'credits',
      search: 'alice',
      page: 2,
      pageSize: 50,
    });
    expect(json).toHaveBeenCalledWith(emptyUsage);
  });

  it('drops unknown range, sort, short searches and bad numbers', async () => {
    const deps = createDeps();
    const { response } = createResponse();

    await createUsageHandlers(deps).listUsage(
      createRequest({ range: '1y', sort: '$where', search: 'a', page: '-3', pageSize: 'x' }),
      response,
    );

    expect(deps.getUsageByUser).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      range: undefined,
      sort: undefined,
      search: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('returns a coded 500 without leaking the error', async () => {
    const deps = createDeps();
    deps.getUsageByUser.mockRejectedValue(new Error('connection to mongo://secret failed'));
    const { response, status, statusJson } = createResponse();

    await createUsageHandlers(deps).listUsage(createRequest(), response);

    expect(status).toHaveBeenCalledWith(500);
    expect(statusJson).toHaveBeenCalledWith({
      message: 'Failed to load usage',
      code: 'USAGE_LOAD_FAILED',
    });
  });
});

describe('getUserUsage', () => {
  it('rejects a malformed user id before querying', async () => {
    const deps = createDeps();
    const { response, status, statusJson } = createResponse();

    await createUsageHandlers(deps).getUserUsage(
      createRequest({}, { userId: '{"$ne":null}' }),
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(statusJson).toHaveBeenCalledWith({
      message: 'Invalid user id',
      code: 'INVALID_USER_ID',
    });
    expect(deps.getUserUsageByModel).not.toHaveBeenCalled();
  });

  it('loads the per-model breakdown within the caller tenant', async () => {
    const deps = createDeps();
    const { response, json } = createResponse();

    await createUsageHandlers(deps).getUserUsage(
      createRequest({ range: '7d' }, { userId: 'a'.repeat(24) }),
      response,
    );

    expect(deps.getUserUsageByModel).toHaveBeenCalledWith({
      userId: 'a'.repeat(24),
      tenantId: 'tenant-a',
      range: '7d',
    });
    expect(json).toHaveBeenCalledWith(userUsage);
  });

  it('returns a coded 500 when the query fails', async () => {
    const deps = createDeps();
    deps.getUserUsageByModel.mockRejectedValue(new Error('boom'));
    const { response, status } = createResponse();

    await createUsageHandlers(deps).getUserUsage(
      createRequest({}, { userId: 'a'.repeat(24) }),
      response,
    );

    expect(status).toHaveBeenCalledWith(500);
  });
});

describe('getMyUsage', () => {
  it('reads the session user, ignoring any user id in the request', async () => {
    const deps = createDeps();
    const { response, json } = createResponse();

    await createUsageHandlers(deps).getMyUsage(
      createRequest({ range: '24h', userId: 'b'.repeat(24) }, { userId: 'b'.repeat(24) }),
      response,
    );

    expect(deps.getUserUsageByModel).toHaveBeenCalledWith({
      userId: 'admin-id',
      tenantId: 'tenant-a',
      range: '24h',
    });
    expect(json).toHaveBeenCalledWith(userUsage);
  });

  it('requires a session user', async () => {
    const deps = createDeps();
    const { response, status, statusJson } = createResponse();

    await createUsageHandlers(deps).getMyUsage(
      { query: {}, params: {} } as unknown as ServerRequest,
      response,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(statusJson).toHaveBeenCalledWith({
      message: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    expect(deps.getUserUsageByModel).not.toHaveBeenCalled();
  });
});
