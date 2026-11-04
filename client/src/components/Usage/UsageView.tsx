import { useId, useMemo, useState } from 'react';
import { Radio } from '@librechat/client';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { UsageRange } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useAuthContext, useDocumentTitle, useHasAccess, useLocalize } from '~/hooks';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import useDrawerViewport from '~/hooks/Nav/useDrawerViewport';
import { useUsageAccessQuery } from '~/data-provider';
import { ErrorPanel, LoadingPanel } from './Panel';
import AllUsers from './AllUsers';
import MyUsage from './MyUsage';

type UsageViewMode = 'mine' | 'all';

/** `null` when the role hides one's own usage and the user lacks `read:usage`. */
function resolveView({
  hasOwnUsage,
  canViewAll,
  wantsAll,
}: {
  hasOwnUsage: boolean;
  canViewAll: boolean;
  wantsAll: boolean;
}): UsageViewMode | null {
  if (canViewAll && (wantsAll || !hasOwnUsage)) {
    return 'all';
  }
  return hasOwnUsage ? 'mine' : null;
}

const ranges: Array<{ value: UsageRange; labelKey: TranslationKeys }> = [
  { value: '24h', labelKey: 'com_usage_range_24h' },
  { value: '7d', labelKey: 'com_usage_range_7d' },
  { value: '30d', labelKey: 'com_usage_range_30d' },
  { value: '90d', labelKey: 'com_usage_range_90d' },
];

/** Every signed-in user sees their own usage; `read:usage` holders can switch to all users. */
export default function UsageView() {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const { user } = useAuthContext();
  const isSmallScreen = useDrawerViewport();
  const rangeLabelId = useId();
  const viewLabelId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<UsageRange>('30d');
  const access = useUsageAccessQuery(user?.id, { enabled: !!user });
  const hasOwnUsage = useHasAccess({
    permissionType: PermissionTypes.USAGE,
    permission: Permissions.USE,
  });
  const canViewAll = access.data?.access === true;
  const wantsAll = searchParams.get('view') === 'all';
  const view = resolveView({ hasOwnUsage, canViewAll, wantsAll });

  useDocumentTitle(`${localize('com_usage_title')} | LibreChat`);

  const rangeOptions = useMemo(
    () => ranges.map((item) => ({ value: item.value, label: localize(item.labelKey) })),
    [localize],
  );
  const viewOptions = useMemo(
    () => [
      { value: 'mine', label: localize('com_usage_view_mine') },
      { value: 'all', label: localize('com_usage_view_all') },
    ],
    [localize],
  );

  const changeRange = (value: string) => {
    const next = ranges.find((item) => item.value === value)?.value;
    if (next) {
      setRange(next);
    }
  };

  const changeView = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.set('view', 'all');
    } else {
      next.delete('view');
    }
    setSearchParams(next, { replace: true });
  };

  let content: React.ReactNode = <MyUsage range={range} locale={locale} />;
  if (access.isLoading && (wantsAll || !hasOwnUsage)) {
    content = <LoadingPanel />;
  } else if (view === 'all') {
    content = <AllUsers range={range} locale={locale} />;
  } else if (view === null) {
    content = <ErrorPanel status={403} />;
  }

  return (
    <div className="bg-surface-primary-alt text-text-primary flex h-full w-full min-w-0 flex-col">
      <header className="bg-surface-primary-alt z-20 flex min-h-14 w-full shrink-0 flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {isSmallScreen && <OpenSidebar />}
          <h1 className="text-base font-semibold">{localize('com_usage_title')}</h1>
          {canViewAll && hasOwnUsage && (
            <div>
              <span id={viewLabelId} className="sr-only">
                {localize('com_usage_view_label')}
              </span>
              <Radio
                size="sm"
                aria-labelledby={viewLabelId}
                options={viewOptions}
                value={view ?? 'mine'}
                onChange={changeView}
              />
            </div>
          )}
        </div>
        <div className="self-start md:self-auto">
          <span id={rangeLabelId} className="sr-only">
            {localize('com_usage_range_label')}
          </span>
          <Radio
            size="sm"
            aria-labelledby={rangeLabelId}
            options={rangeOptions}
            value={range}
            onChange={changeRange}
          />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col gap-3 px-4 pt-6 pb-4 sm:px-8">{content}</div>
      </main>
    </div>
  );
}
