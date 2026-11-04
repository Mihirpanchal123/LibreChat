import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Gauge, MessagesSquare } from 'lucide-react';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import {
  Permissions,
  PermissionTypes,
  getConfigDefaults,
  getEndpointField,
} from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import {
  useUsageAccessQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
  useInsightsAccessQuery,
} from '~/data-provider';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useAuthContext, useHasAccess } from '~/hooks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  /** Selector instead of the full conversation atom: the links only depend on
   * the endpoint, so parameter edits and other conversation writes stay out. */
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(0)) ?? undefined;
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );
  const insightsFeatureEnabled = startupConfig?.insightsEnabled === true;
  const isInsightsRoute = location.pathname.startsWith('/insights');
  const { data: insightsAccess, isLoading: isInsightsAccessLoading } = useInsightsAccessQuery(
    user?.id,
    {
      enabled: !!user && insightsFeatureEnabled && !isInsightsRoute,
    },
  );
  const hasOwnUsageAccess = useHasAccess({
    permissionType: PermissionTypes.USAGE,
    permission: Permissions.USE,
  });
  /** Only asked when the role hides one's own usage: `read:usage` still opens the all-users view. */
  const { data: usageAccess } = useUsageAccessQuery(user?.id, {
    enabled: !!user && !hasOwnUsageAccess,
  });
  const showUsageLink = !!user && (hasOwnUsageAccess || usageAccess?.access === true);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const sideNavLinks = useSideNavLinks({
    keyProvided,
    endpoint,
    endpointType,
    interfaceConfig,
    endpointsConfig,
    includeHidePanel: false,
  });

  const links = useMemo(() => {
    const conversationLink: NavLink = {
      title: 'com_ui_chat_history',
      label: '',
      icon: MessagesSquare,
      id: 'conversations',
      Component: ConversationsSection,
    };

    const dashboardLinks: NavLink[] = [];
    if (
      insightsFeatureEnabled &&
      (isInsightsRoute || isInsightsAccessLoading || insightsAccess?.access === true)
    ) {
      dashboardLinks.push({
        title: 'com_insights_navigation',
        label: '',
        icon: BarChart3,
        id: 'insights',
        disabled: !isInsightsRoute && isInsightsAccessLoading,
        onClick: () => {
          if (!location.pathname.startsWith('/insights')) {
            navigate('/insights');
          }
        },
      });
    }
    if (showUsageLink) {
      dashboardLinks.push({
        title: 'com_usage_navigation',
        label: '',
        icon: Gauge,
        id: 'usage',
        onClick: () => {
          if (!location.pathname.startsWith('/usage')) {
            navigate('/usage');
          }
        },
      });
    }

    if (dashboardLinks.length === 0) {
      return [conversationLink, ...sideNavLinks];
    }
    const mcpIndex = sideNavLinks.findIndex((link) => link.id === 'mcp-builder');
    const nextLinks = [...sideNavLinks];
    nextLinks.splice(mcpIndex >= 0 ? mcpIndex + 1 : nextLinks.length, 0, ...dashboardLinks);

    return [conversationLink, ...nextLinks];
  }, [
    insightsAccess?.access,
    insightsFeatureEnabled,
    isInsightsAccessLoading,
    isInsightsRoute,
    location.pathname,
    navigate,
    showUsageLink,
    sideNavLinks,
  ]);

  return links;
}
