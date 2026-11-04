import { AlertCircle, Info } from 'lucide-react';
import { Button, Spinner, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'border-chart-widget-stroke bg-chart-widget-surface min-w-0 rounded-lg border p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function StatCard({
  title,
  value,
  detail,
  description,
}: {
  title: string;
  value: string;
  detail?: string;
  description?: string;
}) {
  return (
    <Panel>
      <h2 className="text-text-muted inline-flex items-center gap-1.5 text-sm font-normal">
        {title}
        {description && (
          <TooltipAnchor
            description={description}
            render={
              <button
                type="button"
                aria-label={description}
                className="text-text-muted hover:text-text-secondary"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            }
          />
        )}
      </h2>
      <div className="text-text-primary mt-3 text-4xl leading-none font-semibold tabular-nums">
        {value}
      </div>
      {detail && <div className="text-text-secondary mt-2 text-sm tabular-nums">{detail}</div>}
    </Panel>
  );
}

export function LoadingPanel() {
  const localize = useLocalize();
  return (
    <Panel className="flex min-h-52 flex-col items-center justify-center gap-3">
      <Spinner tone="secondary" className="size-7" />
      <span className="text-text-secondary text-sm">{localize('com_usage_loading')}</span>
    </Panel>
  );
}

/** A 403 cannot be fixed by retrying, so it explains itself without the retry action. */
export function ErrorPanel({ status, onRetry }: { status?: number; onRetry?: () => void }) {
  const localize = useLocalize();
  const forbidden = status === 403;
  return (
    <Panel className="flex flex-wrap items-center gap-3">
      <AlertCircle className="text-status-error size-4" aria-hidden="true" />
      <span role="alert" className="text-sm">
        {localize(forbidden ? 'com_usage_forbidden' : 'com_usage_load_error')}
      </span>
      {!forbidden && onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {localize('com_ui_retry')}
        </Button>
      )}
    </Panel>
  );
}
