import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTransactionModel } from '../models/transaction';
import { createBalanceModel } from '../models/balance';
import { createUserModel } from '../models/user';
import { createUsageMethods } from './usage';

let mongoServer: MongoMemoryServer;
const methods = createUsageMethods(mongoose);
const now = new Date('2026-11-04T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

type TxFixture = {
  user: mongoose.Types.ObjectId;
  tokenType: 'prompt' | 'completion' | 'credits';
  rawAmount: number;
  tokenValue: number;
  model?: string;
  createdAt?: Date;
  tenantId?: string;
};

const insertTransactions = (docs: TxFixture[]) =>
  mongoose.models.Transaction.collection.insertMany(
    docs.map((doc) => ({ model: 'gpt-4o', createdAt: hoursAgo(1), ...doc })),
  );

const insertUser = async (fields: Record<string, unknown>) => {
  const _id = new mongoose.Types.ObjectId();
  await mongoose.models.User.collection.insertOne({ _id, ...fields });
  return _id;
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = [
    createTransactionModel(mongoose),
    createBalanceModel(mongoose),
    createUserModel(mongoose),
  ];
  await Promise.all(models.map((model) => model.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    mongoose.models.Transaction.deleteMany({}),
    mongoose.models.Balance.deleteMany({}),
    mongoose.models.User.deleteMany({}),
  ]);
});

describe('getUsageByUser', () => {
  it('totals absolute tokens and credits per user, ignoring refills and other tenants', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'alice@example.com' });
    const bob = await insertUser({ username: 'bob', email: 'bob@example.com' });
    await mongoose.models.Balance.collection.insertOne({ user: alice, tokenCredits: 4200.4 });
    await insertTransactions([
      { user: alice, tokenType: 'prompt', rawAmount: -100, tokenValue: -250 },
      { user: alice, tokenType: 'completion', rawAmount: -40, tokenValue: -600 },
      { user: alice, tokenType: 'prompt', rawAmount: -10, tokenValue: -25 },
      { user: alice, tokenType: 'credits', rawAmount: 5000, tokenValue: 5000 },
      { user: bob, tokenType: 'prompt', rawAmount: -20, tokenValue: -50 },
      { user: bob, tokenType: 'prompt', rawAmount: -999, tokenValue: -999, tenantId: 'other' },
    ]);

    const result = await methods.getUsageByUser({ now });

    expect(result.range).toBe('30d');
    expect(result.total).toBe(2);
    expect(result.summary).toEqual({
      users: 2,
      promptTokens: 130,
      completionTokens: 40,
      totalTokens: 170,
      credits: 925,
      requests: 3,
    });
    expect(result.users.map((row) => row.userId)).toEqual([alice.toString(), bob.toString()]);
    expect(result.users[0]).toMatchObject({
      name: 'Alice',
      email: 'alice@example.com',
      promptTokens: 110,
      completionTokens: 40,
      totalTokens: 150,
      credits: 875,
      requests: 2,
      balance: 4200,
    });
    expect(result.users[1]).toMatchObject({ name: 'bob', balance: null, totalTokens: 20 });
  });

  it('excludes transactions outside the range', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'alice@example.com' });
    await insertTransactions([
      { user: alice, tokenType: 'prompt', rawAmount: -10, tokenValue: -10, createdAt: hoursAgo(2) },
      {
        user: alice,
        tokenType: 'prompt',
        rawAmount: -90,
        tokenValue: -90,
        createdAt: hoursAgo(48),
      },
    ]);

    const day = await methods.getUsageByUser({ now, range: '24h' });
    const week = await methods.getUsageByUser({ now, range: '7d' });

    expect(day.summary.promptTokens).toBe(10);
    expect(week.summary.promptTokens).toBe(100);
  });

  it('scopes to the requested tenant', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'a@example.com', tenantId: 't1' });
    await insertTransactions([
      { user: alice, tokenType: 'prompt', rawAmount: -10, tokenValue: -10, tenantId: 't1' },
      { user: alice, tokenType: 'prompt', rawAmount: -50, tokenValue: -50 },
    ]);

    const result = await methods.getUsageByUser({ now, tenantId: 't1' });

    expect(result.summary.promptTokens).toBe(10);
    expect(result.users[0].name).toBe('Alice');
  });

  it('filters by name or email and returns an empty page when nothing matches', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'alice@example.com' });
    const bob = await insertUser({ name: 'Bob', email: 'bob@corp.test' });
    await insertTransactions([
      { user: alice, tokenType: 'prompt', rawAmount: -10, tokenValue: -10 },
      { user: bob, tokenType: 'prompt', rawAmount: -20, tokenValue: -20 },
    ]);

    const byEmail = await methods.getUsageByUser({ now, search: 'CORP.test' });
    const regexChars = await methods.getUsageByUser({ now, search: '.*' });

    expect(byEmail.users.map((row) => row.name)).toEqual(['Bob']);
    expect(regexChars).toMatchObject({ total: 0, users: [], pages: 1 });
  });

  it('sorts and paginates', async () => {
    const ids = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => insertUser({ name: `User ${n}`, email: `u${n}@example.com` })),
    );
    await insertTransactions(
      ids.map((user, index) => ({
        user,
        tokenType: 'prompt' as const,
        rawAmount: -(index + 1) * 10,
        tokenValue: -(6 - index),
        createdAt: hoursAgo(index + 1),
      })),
    );

    const byTokens = await methods.getUsageByUser({ now, pageSize: 5 });
    const secondPage = await methods.getUsageByUser({ now, pageSize: 5, page: 2 });
    const byCredits = await methods.getUsageByUser({ now, pageSize: 5, sort: 'credits' });
    const byRecent = await methods.getUsageByUser({ now, pageSize: 5, sort: 'lastActive' });

    expect(byTokens).toMatchObject({ total: 6, pages: 2, page: 1 });
    expect(byTokens.users[0].name).toBe('User 6');
    expect(secondPage.users.map((row) => row.name)).toEqual(['User 1']);
    expect(byCredits.users[0].name).toBe('User 1');
    expect(byRecent.users[0].name).toBe('User 1');
  });
});

describe('getUserUsageByModel', () => {
  it('groups one user by model, most tokens first', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'alice@example.com' });
    const bob = await insertUser({ name: 'Bob', email: 'bob@example.com' });
    await insertTransactions([
      { user: alice, tokenType: 'prompt', rawAmount: -10, tokenValue: -10, model: 'small' },
      { user: alice, tokenType: 'prompt', rawAmount: -100, tokenValue: -300, model: 'large' },
      { user: alice, tokenType: 'completion', rawAmount: -50, tokenValue: -400, model: 'large' },
      { user: bob, tokenType: 'prompt', rawAmount: -1000, tokenValue: -1000, model: 'small' },
    ]);

    const result = await methods.getUserUsageByModel({ userId: alice.toString(), now });

    expect(result.models).toEqual([
      {
        model: 'large',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        credits: 700,
        requests: 1,
      },
      {
        model: 'small',
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
        credits: 10,
        requests: 1,
      },
    ]);
    expect(result.totals).toEqual({
      promptTokens: 110,
      completionTokens: 50,
      totalTokens: 160,
      credits: 710,
      requests: 2,
    });
  });

  it('returns zero totals when the user has no usage in range', async () => {
    const alice = await insertUser({ name: 'Alice', email: 'alice@example.com' });
    await insertTransactions([
      {
        user: alice,
        tokenType: 'prompt',
        rawAmount: -10,
        tokenValue: -10,
        createdAt: hoursAgo(48),
      },
    ]);

    const result = await methods.getUserUsageByModel({
      userId: alice.toString(),
      range: '24h',
      now,
    });

    expect(result).toMatchObject({ range: '24h', models: [], totals: { totalTokens: 0 } });
  });

  it('returns no models for an invalid user id', async () => {
    const result = await methods.getUserUsageByModel({ userId: 'not-an-id', now });
    expect(result).toMatchObject({ models: [], totals: { totalTokens: 0, requests: 0 } });
  });
});
