import { Fragment, useState } from 'react';
import { Spinner } from '@librechat/client';
import { ArrowDown, ChevronRight } from 'lucide-react';
import type { TUserUsage, UsageRange, UsageSort } from 'librechat-data-provider';
import { formatCost, formatDateTime, formatExact } from './format';
import { useUserUsageQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import ModelsTable from './Models';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;

const columnCount = 7;

function SortHeader({
  sort,
  label,
  activeSort,
  onSort,
  localize,
}: {
  sort: UsageSort;
  label: string;
  activeSort: UsageSort;
  onSort: (sort: UsageSort) => void;
  localize: Localize;
}) {
  const active = sort === activeSort;
  return (
    <th className="px-2 py-2 text-end font-medium" aria-sort={active ? 'descending' : 'none'}>
      <button
        type="button"
        className={cn(
          'hover:text-text-primary inline-flex items-center gap-1 rounded',
          active && 'text-text-primary',
        )}
        aria-label={localize('com_usage_sort_by', { column: label })}
        onClick={() => onSort(sort)}
      >
        {label}
        <ArrowDown className={cn('size-3', !active && 'invisible')} aria-hidden="true" />
      </button>
    </th>
  );
}

function ModelBreakdown({
  id,
  userId,
  range,
  locale,
  localize,
}: {
  id: string;
  userId: string;
  range: UsageRange;
  locale: string;
  localize: Localize;
}) {
  const { data, isLoading, isError } = useUserUsageQuery(userId, range);

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div className="flex items-center gap-2 py-2">
        <Spinner tone="secondary" className="size-4" />
        <span>{localize('com_usage_loading')}</span>
      </div>
    );
  } else if (isError || !data) {
    content = <p className="text-status-error py-2">{localize('com_usage_load_error')}</p>;
  } else if (data.models.length === 0) {
    content = <p className="py-2">{localize('com_usage_no_models')}</p>;
  } else {
    content = <ModelsTable models={data.models} locale={locale} compact />;
  }

  return (
    <tr id={id} className="bg-surface-secondary">
      <td colSpan={columnCount} className="text-text-secondary px-10 py-2 text-xs">
        {content}
      </td>
    </tr>
  );
}

export default function UsageTable({
  rows,
  range,
  sort,
  onSort,
  locale,
}: {
  rows: TUserUsage[];
  range: UsageRange;
  sort: UsageSort;
  onSort: (sort: UsageSort) => void;
  locale: string;
}) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-start text-sm">
        <thead className="border-border-medium text-text-secondary border-b text-xs">
          <tr>
            <th className="px-2 py-2 font-medium">{localize('com_usage_user')}</th>
            <th className="px-2 py-2 text-end font-medium">
              {localize('com_usage_prompt_tokens')}
            </th>
            <th className="px-2 py-2 text-end font-medium">
              {localize('com_usage_completion_tokens')}
            </th>
            <SortHeader
              sort="tokens"
              label={localize('com_usage_total_tokens')}
              activeSort={sort}
              onSort={onSort}
              localize={localize}
            />
            <SortHeader
              sort="credits"
              label={localize('com_usage_credits_spent')}
              activeSort={sort}
              onSort={onSort}
              localize={localize}
            />
            <th className="px-2 py-2 text-end font-medium">{localize('com_usage_balance')}</th>
            <SortHeader
              sort="lastActive"
              label={localize('com_usage_last_active')}
              activeSort={sort}
              onSort={onSort}
              localize={localize}
            />
          </tr>
        </thead>
        <tbody className="divide-border-light divide-y">
          {rows.map((row) => {
            const isOpen = expanded === row.userId;
            const name = row.name || localize('com_usage_unknown_user');
            const detailId = `usage-models-${row.userId}`;
            return (
              <Fragment key={row.userId}>
                <tr className="hover:bg-surface-hover">
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 text-start"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? detailId : undefined}
                      aria-label={localize(
                        isOpen ? 'com_usage_hide_models' : 'com_usage_show_models',
                        { name },
                      )}
                      onClick={() => setExpanded(isOpen ? null : row.userId)}
                    >
                      <ChevronRight
                        className={cn(
                          'text-text-secondary size-4 shrink-0 transition-transform motion-reduce:transition-none',
                          isOpen && 'rotate-90',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="text-text-primary block truncate">{name}</span>
                        <span className="text-text-secondary block truncate text-xs">
                          {row.email}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatExact(row.promptTokens, locale)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatExact(row.completionTokens, locale)}
                  </td>
                  <td className="text-text-primary px-2 py-3 text-end font-medium tabular-nums">
                    {formatExact(row.totalTokens, locale)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    <div>{formatExact(row.credits, locale)}</div>
                    <div className="text-text-secondary text-xs">
                      {formatCost(row.credits, locale)}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {row.balance == null ? (
                      <span className="text-text-secondary">
                        {localize('com_usage_balance_none')}
                      </span>
                    ) : (
                      formatExact(row.balance, locale)
                    )}
                  </td>
                  <td className="text-text-secondary px-2 py-3 text-end text-xs">
                    {formatDateTime(row.lastActive, locale)}
                  </td>
                </tr>
                {isOpen && (
                  <ModelBreakdown
                    id={detailId}
                    userId={row.userId}
                    range={range}
                    locale={locale}
                    localize={localize}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
