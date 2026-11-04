import { Spinner } from '@librechat/client';
import type { UsageRange } from 'librechat-data-provider';
import { formatCompact, formatCost, responseStatus } from './format';
import { ErrorPanel, LoadingPanel, Panel, StatCard } from './Panel';
import { useAuthContext, useLocalize } from '~/hooks';
import { useMyUsageQuery } from '~/data-provider';
import ModelsTable from './Models';
import Limit from './Limit';

/** The signed-in user's own usage and the token limit an admin set for them. */
export default function MyUsage({ range, locale }: { range: UsageRange; locale: string }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const usage = useMyUsageQuery(user?.id, range);
  const data = usage.data;

  if (usage.isLoading) {
    return <LoadingPanel />;
  }
  if (usage.isError || !data) {
    return <ErrorPanel status={responseStatus(usage.error)} onRetry={() => usage.refetch()} />;
  }

  const { totals } = data;

  return (
    <>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title={localize('com_usage_total_tokens')}
          value={formatCompact(totals.totalTokens, locale)}
          detail={localize('com_usage_tokens_split', {
            prompt: formatCompact(totals.promptTokens, locale),
            completion: formatCompact(totals.completionTokens, locale),
          })}
        />
        <StatCard
          title={localize('com_usage_credits_spent')}
          value={formatCompact(totals.credits, locale)}
          detail={formatCost(totals.credits, locale)}
        />
        <StatCard
          title={localize('com_usage_requests')}
          value={formatCompact(totals.requests, locale)}
          description={localize('com_usage_requests_definition')}
        />
      </div>
      <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold">{localize('com_usage_models_title')}</h2>
            {usage.isFetching && <Spinner tone="secondary" className="size-4" />}
          </div>
          {data.models.length === 0 ? (
            <div className="text-text-secondary flex min-h-40 items-center justify-center text-sm">
              {localize('com_usage_my_empty')}
            </div>
          ) : (
            <ModelsTable models={data.models} locale={locale} />
          )}
        </Panel>
        <Limit />
      </div>
    </>
  );
}
