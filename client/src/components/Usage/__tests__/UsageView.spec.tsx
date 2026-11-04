import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import type {
  UsageRange,
  TUsageTotals,
  TUsageParams,
  TUsageResponse,
  TUserUsageResponse,
} from 'librechat-data-provider';
import UsageView from '../UsageView';

const totals: TUsageTotals = {
  promptTokens: 1200,
  completionTokens: 400,
  totalTokens: 1600,
  credits: 2_000_000,
  requests: 9,
};

const usageData: TUsageResponse = {
  range: '30d',
  from: '2026-10-05T12:00:00.000Z',
  to: '2026-11-04T12:00:00.000Z',
  summary: { ...totals, users: 2 },
  users: [
    {
      ...totals,
      userId: 'a'.repeat(24),
      name: 'Alice',
      email: 'alice@example.com',
      balance: 750,
      lastActive: '2026-11-04T10:00:00.000Z',
    },
    {
      ...totals,
      userId: 'b'.repeat(24),
      name: '',
      email: 'bob@example.com',
      balance: null,
      lastActive: '2026-11-03T10:00:00.000Z',
    },
  ],
  page: 1,
  pages: 1,
  total: 2,
};

const modelsFor = (userId: string, range: UsageRange): TUserUsageResponse => ({
  userId,
  range,
  totals,
  models: [{ ...totals, model: 'gpt-4o' }],
});

type QueryState<T> = {
  data?: T;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: jest.Mock;
};

const ready = <T,>(data: T): QueryState<T> => ({
  data,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});

let mockCanViewAll = true;
let mockHasOwnUsage = true;
type MockBalanceSummary = {
  display: 'credits' | 'currency' | 'percent';
  credits: number;
  allotment: number | null;
  refillAmount: number | null;
};
let mockBalance: {
  enabled: boolean;
  state: { status: string; summary?: MockBalanceSummary };
} = { enabled: false, state: { status: 'loading' } };
const mockUseUsageQuery = jest.fn((_params: TUsageParams) => ready(usageData));
const mockUseMyUsageQuery = jest.fn((userId: string | undefined, range: UsageRange) =>
  ready(modelsFor(userId ?? '', range)),
);
const mockUseUserUsageQuery = jest.fn((userId: string, range: UsageRange) =>
  ready(modelsFor(userId, range)),
);

jest.mock('~/data-provider', () => ({
  useUsageQuery: (params: TUsageParams) => mockUseUsageQuery(params),
  useMyUsageQuery: (userId: string | undefined, range: UsageRange) =>
    mockUseMyUsageQuery(userId, range),
  useUserUsageQuery: (userId: string, range: UsageRange) => mockUseUserUsageQuery(userId, range),
  useUsageAccessQuery: () => ({
    data: mockCanViewAll ? { access: true } : undefined,
    isLoading: false,
  }),
}));

jest.mock('~/hooks/useBalanceSummary', () => ({
  __esModule: true,
  default: () => mockBalance,
}));

/** Covered by the Settings balance tests; here only their placement matters. */
jest.mock('~/components/Nav/Settings/BillingControls', () => ({
  TokenCredits: () => <div data-testid="token-credits" />,
  AutoRefill: () => <div data-testid="auto-refill" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options?.name != null ? `${key}:${String(options.name)}` : key,
  useAuthContext: () => ({ user: { id: 'me-1' } }),
  useDocumentTitle: () => undefined,
  useHasAccess: () => mockHasOwnUsage,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

jest.mock('~/hooks/Nav/useDrawerViewport', () => ({ __esModule: true, default: () => false }));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => null,
}));

const lastParams = (): TUsageParams =>
  mockUseUsageQuery.mock.calls[mockUseUsageQuery.mock.calls.length - 1][0];

function renderView(path = '/usage') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UsageView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCanViewAll = true;
  mockHasOwnUsage = true;
  mockBalance = { enabled: false, state: { status: 'loading' } };
  mockUseUsageQuery.mockReset();
  mockUseUsageQuery.mockImplementation(() => ready(usageData));
  mockUseMyUsageQuery.mockClear();
  mockUseUserUsageQuery.mockClear();
});

describe('UsageView: my usage', () => {
  beforeEach(() => {
    mockCanViewAll = false;
  });

  it('shows only the signed-in user, with no switch to all users', () => {
    renderView('/usage?view=all');

    expect(mockUseMyUsageQuery).toHaveBeenCalledWith('me-1', '30d');
    expect(mockUseUsageQuery).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio', { name: 'com_usage_view_all' })).not.toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getAllByText('$2.00').length).toBeGreaterThan(0);
  });

  it('says no limit is set when balances are off', () => {
    renderView();

    expect(screen.getByText('com_usage_limit_title')).toBeInTheDocument();
    expect(screen.getByText('com_usage_limit_none')).toBeInTheDocument();
    expect(screen.queryByTestId('token-credits')).not.toBeInTheDocument();
  });

  it('names the per-period limit an admin set, with the balance and refill schedule', () => {
    mockBalance = {
      enabled: true,
      state: {
        status: 'success',
        summary: { display: 'credits', credits: 5_000, allotment: 20_000, refillAmount: 20_000 },
      },
    };
    renderView();

    expect(screen.getByText('com_usage_limit_per_period')).toBeInTheDocument();
    expect(screen.getByText('20,000')).toBeInTheDocument();
    expect(screen.getByTestId('token-credits')).toBeInTheDocument();
    expect(screen.getByTestId('auto-refill')).toBeInTheDocument();
    expect(screen.queryByText('com_usage_limit_none')).not.toBeInTheDocument();
  });

  it('calls a one-time allowance a starting allowance and hides figures in percent mode', () => {
    mockBalance = {
      enabled: true,
      state: {
        status: 'success',
        summary: { display: 'credits', credits: 5_000, allotment: 20_000, refillAmount: null },
      },
    };
    const { unmount } = renderView();
    expect(screen.getByText('com_usage_limit_starting')).toBeInTheDocument();
    unmount();

    mockBalance = {
      enabled: true,
      state: {
        status: 'success',
        summary: { display: 'percent', credits: 5_000, allotment: 20_000, refillAmount: 20_000 },
      },
    };
    renderView();
    expect(screen.queryByText('20,000')).not.toBeInTheDocument();
    expect(screen.getByTestId('token-credits')).toBeInTheDocument();
  });

  it('re-queries for the chosen range', async () => {
    renderView();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'com_usage_range_7d' }));
    expect(mockUseMyUsageQuery).toHaveBeenLastCalledWith('me-1', '7d');
  });

  it('shows an empty state', () => {
    mockUseMyUsageQuery.mockImplementationOnce((userId, range) =>
      ready({ ...modelsFor(userId ?? '', range), models: [] }),
    );
    renderView();
    expect(screen.getByText('com_usage_my_empty')).toBeInTheDocument();
  });

  it('shows loading and a retryable error', async () => {
    mockUseMyUsageQuery.mockImplementationOnce(() => ({
      ...ready(modelsFor('', '30d')),
      data: undefined,
      isLoading: true,
    }));
    const { unmount } = renderView();
    expect(screen.getByText('com_usage_loading')).toBeInTheDocument();
    unmount();

    const failed = { ...ready(modelsFor('', '30d')), data: undefined, isError: true };
    mockUseMyUsageQuery.mockImplementation(() => failed);
    renderView();
    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_load_error');
    await userEvent.setup().click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(failed.refetch).toHaveBeenCalled();
    mockUseMyUsageQuery.mockImplementation((userId, range) =>
      ready(modelsFor(userId ?? '', range)),
    );
  });
});

describe('UsageView: role USAGE permission off', () => {
  beforeEach(() => {
    mockHasOwnUsage = false;
  });

  it('refuses without loading anything when the user also lacks read:usage', () => {
    mockCanViewAll = false;
    renderView();

    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_forbidden');
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
    expect(mockUseMyUsageQuery).not.toHaveBeenCalled();
    expect(mockUseUsageQuery).not.toHaveBeenCalled();
  });

  it('opens straight on all users, without the switch, for a read:usage holder', () => {
    renderView();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(mockUseMyUsageQuery).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio', { name: 'com_usage_view_mine' })).not.toBeInTheDocument();
  });
});

describe('UsageView: all users', () => {
  it('opens on my usage and switches to all users for a read:usage holder', async () => {
    renderView();
    expect(mockUseUsageQuery).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'com_usage_view_all' }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ range: '30d', sort: 'tokens', page: 1 });
  });

  it('renders per-user totals, cost, balance and a fallback name', () => {
    renderView('/usage?view=all');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByText('1,600')).toHaveLength(2);
    expect(screen.getByText('750')).toBeInTheDocument();
    expect(screen.getByText('com_usage_balance_none')).toBeInTheDocument();
    expect(screen.getByText('com_usage_unknown_user')).toBeInTheDocument();
  });

  it('explains a 403 without offering a retry', () => {
    mockUseUsageQuery.mockImplementation(() => ({
      ...ready(usageData),
      data: undefined,
      isError: true,
      error: { response: { status: 403 } },
    }));
    renderView('/usage?view=all');

    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_forbidden');
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
  });

  it('shows an empty state', () => {
    mockUseUsageQuery.mockImplementation(() =>
      ready({ ...usageData, users: [], total: 0, summary: { ...usageData.summary, users: 0 } }),
    );
    renderView('/usage?view=all');
    expect(screen.getByText('com_usage_empty')).toBeInTheDocument();
  });

  it('changes range and sort, resetting to the first page', async () => {
    const user = userEvent.setup();
    renderView('/usage?view=all');

    await user.click(screen.getByRole('radio', { name: 'com_usage_range_7d' }));
    expect(lastParams()).toMatchObject({ range: '7d', page: 1 });

    const sortButtons = screen.getAllByRole('button', { name: 'com_usage_sort_by' });
    await user.click(sortButtons[1]);
    expect(lastParams()).toMatchObject({ sort: 'credits', page: 1 });
  });

  it('debounces search into the query', async () => {
    const user = userEvent.setup();
    renderView('/usage?view=all');

    await user.type(
      screen.getByRole('searchbox', { name: 'com_usage_search_placeholder' }),
      'alice',
    );

    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'alice', page: 1 }));
  });

  it('expands a user into the per-model breakdown', async () => {
    renderView('/usage?view=all');

    const toggle = screen.getByRole('button', { name: 'com_usage_show_models:Alice' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(toggle);

    expect(mockUseUserUsageQuery).toHaveBeenCalledWith('a'.repeat(24), '30d');
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_usage_hide_models:Alice' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
