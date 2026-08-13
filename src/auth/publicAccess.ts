import type { UserData } from './AuthContextTypes';
import { getGuestId } from './guestIdentity';

/**
 * Public-access mode.
 *
 * The site is browsable and fully usable without signing in: every visitor is
 * treated as an authenticated "guest" for user-facing features (AI assistant,
 * dynamic questions, chat, SciD-QuESt). Admin areas are NOT covered by this —
 * they still require a real Keycloak session whose account is an admin, see
 * `AdminGuard` and the backend `requireAdmin` middleware.
 *
 * Set `VITE_DISABLE_AUTH=false` to restore the sign-in requirement.
 */
export const AUTH_DISABLED = import.meta.env.VITE_DISABLE_AUTH !== 'false';

/**
 * Synthetic identity used while `AUTH_DISABLED` and nobody is signed in.
 *
 * Created once per page load so its object identity is stable across renders
 * (consumers put `user` in effect dependency arrays). The id matches the
 * `x-guest-id` header the API clients send, so records written through the
 * frontend and the backend agree on who the guest is.
 */
export const GUEST_USER: UserData = {
  id: getGuestId(),
  display_name: 'Guest',
  email: '',
  created_at: '',
  is_admin: false,
  is_curation_allowed: false,
  observatory_id: null,
  organization_id: null,
};
