/**
 * Per-browser guest identity used while authentication is disabled.
 *
 * Without it every anonymous visitor would hit the backend as the same user,
 * which would put all their chat conversations and contributions into one
 * shared bucket. The id is random, stored locally, and carries no personal
 * data; it only separates one browser's records from another's.
 */

const STORAGE_KEY = 'orkg-atlas-guest-id';

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

let cached: string | null = null;

/** Stable id for this browser, created on first use. */
export const getGuestId = (): string => {
  if (cached) return cached;

  if (typeof window === 'undefined') {
    cached = `guest-${randomId()}`;
    return cached;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const created = `guest-${randomId()}`;
    window.localStorage.setItem(STORAGE_KEY, created);
    cached = created;
    return created;
  } catch {
    // Private mode / storage disabled: fall back to a per-session id.
    cached = `guest-${randomId()}`;
    return cached;
  }
};

/** Header sent alongside (or instead of) a Keycloak bearer token. */
export const guestHeaders = (): Record<string, string> => ({
  'x-guest-id': getGuestId(),
});
