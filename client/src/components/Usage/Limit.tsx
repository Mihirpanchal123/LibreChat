import { TokenCredits, AutoRefill } from '~/components/Nav/Settings/BillingControls';
import useBalanceSummary from '~/hooks/useBalanceSummary';
import { formatBalanceAmount } from '~/utils';
import { useLocalize } from '~/hooks';
import { Panel } from './Panel';

/**
 * The token limit an admin set for the signed-in user: the same balance reading and
 * refill schedule as Settings, plus the allotment itself so the limit is named outright.
 */
export default function Limit() {
  const localize = useLocalize();
  const { enabled, state, currency } = useBalanceSummary();

  if (!enabled) {
    return (
      <Panel>
        <h2 className="text-base font-semibold">{localize('com_usage_limit_title')}</h2>
        <p className="text-text-secondary mt-2 text-sm">{localize('com_usage_limit_none')}</p>
      </Panel>
    );
  }

  const summary = state.status === 'success' ? state.summary : null;
  const allotment =
    summary?.allotment != null && summary.display !== 'percent'
      ? formatBalanceAmount(summary.allotment, summary.display, currency)
      : null;

  return (
    <Panel className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{localize('com_usage_limit_title')}</h2>
      {allotment != null && (
        <div className="flex justify-between gap-3 text-sm">
          <span>
            {localize(
              summary?.refillAmount != null
                ? 'com_usage_limit_per_period'
                : 'com_usage_limit_starting',
            )}
          </span>
          <span className="text-text-primary font-medium tabular-nums">{allotment}</span>
        </div>
      )}
      <TokenCredits />
      <AutoRefill />
    </Panel>
  );
}
