/* eslint-disable @typescript-eslint/no-explicit-any */

import { getKeycloakToken as getKeycloakTokenFromStore } from '../../auth/keycloakStore';
import { guestHeaders } from '../../auth/guestIdentity';
import { AUTH_DISABLED } from '../../auth/publicAccess';

/** Canonical production API for ORKG Atlas (TIB). Never fall back to localhost on a deployed host. */
export const PRODUCTION_BACKEND_URL = 'https://empire-compass-backend.tib.eu';
export const LOCAL_BACKEND_URL = 'http://localhost:5001';

const isLocalBackendUrl = (url: string) => /localhost|127\.0\.0\.1/i.test(url);

const isEmpiRECompassVercelBackend = (url: string) =>
  /empirecompassbackend\.vercel\.app/i.test(url);

const isVercelHost = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('.vercel.app') ||
    window.location.hostname.includes('.vercel'));

const isLocalBrowser = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

const usable = (url: string | undefined): string | undefined => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  // A localhost API URL baked into the Vercel bundle must not be used
  // when the page is served from a public host.
  if (isLocalBackendUrl(trimmed) && !isLocalBrowser()) return undefined;
  // ORKG Atlas must not call the EmpiRE Compass Vercel API.
  if (isEmpiRECompassVercelBackend(trimmed) && !isLocalBrowser()) {
    return undefined;
  }
  return trimmed;
};

export const getBackendUrl = (): string => {
  const feature = usable(import.meta.env.VITE_BACKEND_FEATURE_URL);
  const configured = usable(import.meta.env.VITE_BACKEND_URL);

  if (isVercelHost()) {
    return feature || configured || PRODUCTION_BACKEND_URL;
  }

  return (
    configured ||
    (import.meta.env.DEV ? LOCAL_BACKEND_URL : PRODUCTION_BACKEND_URL)
  );
};

export const BACKEND_URL = getBackendUrl();

export interface ApiRequestOptions extends RequestInit {
  userId?: string;
  userEmail?: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  keycloakToken?: string;
}

export const getKeycloakToken = (): string | null => {
  try {
    return getKeycloakTokenFromStore();
  } catch (error) {
    console.warn('Failed to get Keycloak token:', error);
    return null;
  }
};

export const apiRequest = async <T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const {
    userId,
    userEmail,
    requiresAuth = false,
    requiresAdmin = false,
    keycloakToken,
    headers = {},
    ...fetchOptions
  } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  const token = keycloakToken || getKeycloakToken();
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  } else if (AUTH_DISABLED) {
    // Keeps anonymous visitors' records separate from each other.
    Object.assign(requestHeaders, guestHeaders());
  }

  if (requiresAuth || requiresAdmin) {
    if (userId) {
      requestHeaders['x-user-id'] = userId;
    }
    if (userEmail) {
      requestHeaders['x-user-email'] = userEmail;
    }
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
};
