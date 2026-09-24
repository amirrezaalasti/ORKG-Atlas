import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPIRE_BACKEND_URL,
  LOCAL_BACKEND_URL,
  PRODUCTION_BACKEND_URL,
  getBackendUrl,
} from './client';

describe('getBackendUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses VITE_BACKEND_URL when set', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', 'https://example.test');
    expect(getBackendUrl()).toBe('https://example.test');
  });

  it('prefers VITE_BACKEND_FEATURE_URL on Vercel hosts', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', 'https://preview-api.test');
    vi.stubEnv('VITE_BACKEND_URL', 'https://example.test');
    vi.stubGlobal('window', {
      location: { hostname: 'orkg-atlas.vercel.app' },
    });
    expect(getBackendUrl()).toBe('https://preview-api.test');
  });

  it('ignores a localhost VITE_BACKEND_URL on Vercel hosts', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:5001');
    vi.stubGlobal('window', {
      location: { hostname: 'orkg-atlas.vercel.app' },
    });
    expect(getBackendUrl()).toBe(PRODUCTION_BACKEND_URL);
    expect(getBackendUrl()).not.toContain('localhost');
  });

  it('ignores the EmpiRE Compass Vercel API URL on Atlas hosts', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', 'https://empirecompassbackend.vercel.app');
    vi.stubGlobal('window', {
      location: { hostname: 'orkg-atlas.vercel.app' },
    });
    expect(getBackendUrl()).toBe(PRODUCTION_BACKEND_URL);
    expect(getBackendUrl()).toBe('https://orkg-atlas-backend.vercel.app');
  });

  it('ignores the EmpiRE Compass TIB API URL on Atlas hosts', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', 'https://empire-compass-backend.tib.eu');
    vi.stubGlobal('window', {
      location: { hostname: 'orkg-atlas.vercel.app' },
    });
    expect(getBackendUrl()).toBe(PRODUCTION_BACKEND_URL);
    expect(getBackendUrl()).not.toContain('empire-compass');
  });

  it('uses the EmpiRE Compass API on empire-compass.tib.eu', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', 'https://empire-compass-backend.tib.eu');
    vi.stubGlobal('window', {
      location: { hostname: 'empire-compass.tib.eu' },
    });
    expect(getBackendUrl()).toBe(EMPIRE_BACKEND_URL);
  });

  it('defaults to the EmpiRE Compass API on that host', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', '');
    vi.stubGlobal('window', {
      location: { hostname: 'empire-compass.tib.eu' },
    });
    expect(getBackendUrl()).toBe(EMPIRE_BACKEND_URL);
  });

  it('allows localhost only in local development', () => {
    vi.stubEnv('VITE_BACKEND_FEATURE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', '');
    vi.stubEnv('DEV', true);
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    expect(getBackendUrl()).toBe(LOCAL_BACKEND_URL);
  });
});
