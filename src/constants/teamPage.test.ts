import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPIRE_TEAM_URL,
  getTeamPageHref,
  shouldRedirectToEmpireTeam,
} from './teamPage';

describe('teamPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the in-app team route on localhost', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    expect(shouldRedirectToEmpireTeam()).toBe(false);
    expect(getTeamPageHref('R186491')).toBe('/R186491/team');
  });

  it('uses the canonical EmpiRE Compass URL on that host', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'empire-compass.tib.eu' },
    });
    expect(shouldRedirectToEmpireTeam()).toBe(false);
    expect(getTeamPageHref()).toBe(EMPIRE_TEAM_URL);
  });

  it('sends Atlas hosts to the EmpiRE Compass team page', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'orkg-atlas.vercel.app' },
    });
    expect(shouldRedirectToEmpireTeam()).toBe(true);
    expect(getTeamPageHref()).toBe(EMPIRE_TEAM_URL);
  });
});
