import type { TUserUsageModel } from 'librechat-data-provider';
import { formatCost, formatExact } from './format';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Per-model totals; `compact` is the nested breakdown inside a user row. */
export default function ModelsTable({
  models,
  locale,
  compact = false,
}: {
  models: TUserUsageModel[];
  locale: string;
  compact?: boolean;
}) {
  const localize = useLocalize();
  const cell = cn('text-end tabular-nums', compact ? 'py-1' : 'px-2 py-3');
  const head = cn('font-medium', compact ? 'py-1' : 'px-2 py-2');

  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-start', compact ? 'text-xs' : 'min-w-xl text-sm')}>
        <caption className="sr-only">{localize('com_usage_models_title')}</caption>
        <thead
          className={cn(!compact && 'border-border-medium text-text-secondary border-b text-xs')}
        >
          <tr>
            <th scope="col" className={head}>
              {localize('com_usage_model')}
            </th>
            <th scope="col" className={cn(head, 'text-end')}>
              {localize('com_usage_prompt_tokens')}
            </th>
            <th scope="col" className={cn(head, 'text-end')}>
              {localize('com_usage_completion_tokens')}
            </th>
            <th scope="col" className={cn(head, 'text-end')}>
              {localize('com_usage_credits_spent')}
            </th>
            <th scope="col" className={cn(head, 'text-end')}>
              {localize('com_usage_requests')}
            </th>
          </tr>
        </thead>
        <tbody className={cn(!compact && 'divide-border-light divide-y')}>
          {models.map((row) => (
            <tr key={row.model} className={cn(!compact && 'hover:bg-surface-hover')}>
              <td className={cn('text-text-primary truncate', compact ? 'py-1' : 'px-2 py-3')}>
                {row.model || localize('com_usage_unknown_model')}
              </td>
              <td className={cell}>{formatExact(row.promptTokens, locale)}</td>
              <td className={cell}>{formatExact(row.completionTokens, locale)}</td>
              <td className={cell}>
                {formatExact(row.credits, locale)}
                <span className="text-text-secondary ms-1">
                  ({formatCost(row.credits, locale)})
                </span>
              </td>
              <td className={cell}>{formatExact(row.requests, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
