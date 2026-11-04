import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  UsageRange,
  TUsageParams,
  TUsageResponse,
  TUserUsageResponse,
  TUsageAccessResponse,
} from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';

export const useUsageQuery = (
  params: TUsageParams,
  config?: UseQueryOptions<TUsageResponse>,
): QueryObserverResult<TUsageResponse> =>
  useQuery<TUsageResponse>([QueryKeys.usage, params], () => dataService.getUsage(params), {
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: false,
    ...config,
  });

export const useUserUsageQuery = (
  userId: string,
  range: UsageRange,
  config?: UseQueryOptions<TUserUsageResponse>,
): QueryObserverResult<TUserUsageResponse> =>
  useQuery<TUserUsageResponse>(
    [QueryKeys.userUsage, userId, range],
    () => dataService.getUserUsage(userId, { range }),
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/** Keyed by the signed-in user so a later sign-in never reads the previous user's cache. */
export const useMyUsageQuery = (
  userId: string | undefined,
  range: UsageRange,
  config?: UseQueryOptions<TUserUsageResponse>,
): QueryObserverResult<TUserUsageResponse> =>
  useQuery<TUserUsageResponse>(
    [QueryKeys.myUsage, userId ?? 'anonymous', range],
    () => dataService.getMyUsage({ range }),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      enabled: !!userId,
      ...config,
    },
  );

export const useUsageAccessQuery = (
  userId?: string,
  config?: UseQueryOptions<TUsageAccessResponse>,
): QueryObserverResult<TUsageAccessResponse> =>
  useQuery<TUsageAccessResponse>(
    [QueryKeys.usageAccess, userId ?? 'anonymous'],
    () => dataService.getUsageAccess(),
    {
      retry: false,
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
