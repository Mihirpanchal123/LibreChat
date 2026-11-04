const express = require('express');
const request = require('supertest');

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';

/** `Bearer admin` holds read:usage; `Bearer user` does not; `Bearer locked` is a role
 *  whose USAGE permission is off. */
const TOKEN_ROLES = { 'Bearer admin': 'ADMIN', 'Bearer user': 'USER', 'Bearer locked': 'LOCKED' };
const mockRequireJwtAuth = jest.fn((req, res, next) => {
  const role = TOKEN_ROLES[req.headers.authorization];
  if (!role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.user = { id: USER_ID, role };
  next();
});

jest.mock('~/server/middleware', () => ({ requireJwtAuth: mockRequireJwtAuth }));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: jest.fn(() => (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden', code: 'FORBIDDEN' });
    }
    next();
  }),
}));

const mockRoles = {
  ADMIN: { name: 'ADMIN', permissions: { USAGE: { USE: true } } },
  USER: { name: 'USER', permissions: { USAGE: { USE: true } } },
  LOCKED: { name: 'LOCKED', permissions: { USAGE: { USE: false } } },
};
const mockDb = {
  getUsageByUser: jest.fn(),
  getUserUsageByModel: jest.fn(),
  getRoleByName: jest.fn(async (name) => mockRoles[name] ?? null),
};
jest.mock('~/models', () => mockDb);

const emptyTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  credits: 0,
  requests: 0,
};

function createApp() {
  const app = express();
  app.use('/api/usage', require('./usage'));
  return app;
}

describe('usage routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getUserUsageByModel.mockImplementation(async ({ userId, range }) => ({
      userId,
      range: range ?? '30d',
      totals: emptyTotals,
      models: [],
    }));
    mockDb.getUsageByUser.mockResolvedValue({ users: [] });
  });

  it('requires sign-in for every route', async () => {
    await request(app).get('/api/usage/me').expect(401);
    await request(app).get('/api/usage').expect(401);
    expect(mockDb.getUserUsageByModel).not.toHaveBeenCalled();
    expect(mockDb.getUsageByUser).not.toHaveBeenCalled();
  });

  it('lets a user without read:usage read only their own usage', async () => {
    const res = await request(app)
      .get(`/api/usage/me?range=7d&userId=${OTHER_ID}`)
      .set('Authorization', 'Bearer user')
      .expect(200);

    expect(res.body.userId).toBe(USER_ID);
    expect(mockDb.getUserUsageByModel).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, range: '7d' }),
    );
  });

  it("refuses a user's own usage when their role has the USAGE permission off", async () => {
    await request(app).get('/api/usage/me').set('Authorization', 'Bearer locked').expect(403);
    expect(mockDb.getRoleByName).toHaveBeenCalledWith('LOCKED');
    expect(mockDb.getUserUsageByModel).not.toHaveBeenCalled();
  });

  it('keeps every other usage route behind read:usage', async () => {
    for (const path of ['/api/usage', '/api/usage/access', `/api/usage/users/${OTHER_ID}`]) {
      await request(app).get(path).set('Authorization', 'Bearer user').expect(403);
    }
    expect(mockDb.getUsageByUser).not.toHaveBeenCalled();
    expect(mockDb.getUserUsageByModel).not.toHaveBeenCalled();
  });

  it('serves the all-users routes to a holder of read:usage', async () => {
    await request(app).get('/api/usage/access').set('Authorization', 'Bearer admin').expect(200);
    await request(app).get('/api/usage').set('Authorization', 'Bearer admin').expect(200);
    const res = await request(app)
      .get(`/api/usage/users/${OTHER_ID}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(res.body.userId).toBe(OTHER_ID);
  });
});
