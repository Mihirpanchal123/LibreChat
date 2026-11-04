import { matchPath } from 'react-router-dom';

const matchesRouteStart = (pathname: string, pattern: string) =>
  matchPath({ path: pattern, end: false }, pathname) != null;

export const isArtifactRoute = (pathname: string) =>
  matchesRouteStart(pathname, '/c/*') || matchesRouteStart(pathname, '/share/*');

/** Full-page dashboards: each owns a sidebar link with the same id and collapses the panel. */
const dashboardRouteIds = ['insights', 'usage'] as const;
export type DashboardRouteId = (typeof dashboardRouteIds)[number];

export const getDashboardRouteId = (pathname: string): DashboardRouteId | undefined =>
  dashboardRouteIds.find((id) => matchesRouteStart(pathname, `/${id}/*`));

export const isDashboardRouteId = (id: string): id is DashboardRouteId =>
  (dashboardRouteIds as readonly string[]).includes(id);
