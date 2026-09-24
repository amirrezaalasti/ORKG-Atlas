/** Canonical public Team page with working EmpiRE Compass data. */
export const EMPIRE_TEAM_URL = 'https://empire-compass.tib.eu/R186491/team';

const isBrowser = () => typeof window !== 'undefined';

const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1';

const isEmpireCompassHost = (hostname: string) =>
  hostname === 'empire-compass.tib.eu';

/**
 * Atlas production API is currently failing for /api/team. Send visitors to
 * the EmpiRE Compass Team page unless we are already on that host or local.
 */
export const shouldRedirectToEmpireTeam = (): boolean => {
  if (!isBrowser()) return false;
  const { hostname } = window.location;
  return !isLocalHost(hostname) && !isEmpireCompassHost(hostname);
};

export const getTeamPageHref = (templateId = 'R186491'): string => {
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return `/${templateId}/team`;
  }
  return EMPIRE_TEAM_URL;
};
