import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Spinner } from '@librechat/client';
import { USAGE_SEARCH_MAX_LENGTH, USAGE_SEARCH_MIN_LENGTH } from 'librechat-data-provider';
import type { TUsageParams, UsageRange, UsageSort } from 'librechat-data-provider';
import { formatCompact, formatCost, formatExact, responseStatus } from './format';
import { ErrorPanel, LoadingPanel, Panel, StatCard } from './Panel';
import { useUsageQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import UsageTable from './Table';

const pageSize = 20;
const searchDelayMs = 350;

/** Every user's usage; rendered only for holders of `read:usage`. */
export default function AllUsers({ range, locale }: { range: UsageRange; locale: string }) {
  const localize = useLocalize();
  const [sort, setSort] = useState<UsageSort>('tokens');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [range]);

  useEffect(() => {
    const trimmed = searchInput.trim().slice(0, USAGE_SEARCH_MAX_LENGTH);
    const next = trimmed.length >= USAGE_SEARCH_MIN_LENGTH ? trimmed : '';
    if (next === search) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, searchDelayMs);
    return () => window.clearTimeout(timeout);
  }, [search, searchInput]);

  const params = useMemo<TUsageParams>(
    () => ({ range, sort, page, pageSize, ...(search ? { search } : {}) }),
    [page, range, search, sort],
  );
  const usage = useUsageQuery(params);
  const data = usage.data;

  const changeSort = (next: UsageSort) => {
    setSort(next);
    setPage(1);
  };

  if (usage.isLoading) {
    return <LoadingPanel />;
  }
  if (usage.isError || !data) {
    return <ErrorPanel status={responseStatus(usage.error)} onRetry={() => usage.refetch()} />;
  }

  return (
    <>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={localize('com_usage_active_users')}
          value={formatExact(data.summary.users, locale)}
        />
        <StatCard
          title={localize('com_usage_total_tokens')}
          value={formatCompact(data.summary.totalTokens, locale)}
          detail={localize('com_usage_tokens_split', {
            prompt: formatCompact(data.summary.promptTokens, locale),
            completion: formatCompact(data.summary.completionTokens, locale),
          })}
        />
        <StatCard
          title={localize('com_usage_credits_spent')}
          value={formatCompact(data.summary.credits, locale)}
          detail={formatCost(data.summary.credits, locale)}
        />
        <StatCard
          title={localize('com_usage_requests')}
          value={formatCompact(data.summary.requests, locale)}
          description={localize('com_usage_requests_definition')}
        />
      </div>
      <Panel className="overflow-hidden">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{localize('com_usage_users_title')}</h2>
            {usage.isFetching && <Spinner tone="secondary" className="size-4" />}
          </div>
          <div className="w-full sm:max-w-sm">
            <Input
              type="search"
              aria-label={localize('com_usage_search_placeholder')}
              maxLength={USAGE_SEARCH_MAX_LENGTH}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={localize('com_usage_search_placeholder')}
              value={searchInput}
            />
          </div>
        </div>
        {data.users.length === 0 ? (
          <div className="text-text-secondary flex min-h-40 items-center justify-center text-sm">
            {localize(search ? 'com_usage_no_matches' : 'com_usage_empty')}
          </div>
        ) : (
          <UsageTable
            rows={data.users}
            range={data.range}
            sort={sort}
            onSort={changeSort}
            locale={locale}
          />
        )}
        <div className="border-border-light text-text-secondary mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span>{localize('com_usage_page_of', { page: data.page, pages: data.pages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={usage.isFetching || data.page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              {localize('com_ui_prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={usage.isFetching || data.page >= data.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              {localize('com_ui_next')}
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
