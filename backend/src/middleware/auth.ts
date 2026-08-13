import { Request, Response, NextFunction } from 'express';
import { db } from '../config/firebase.js';
import { isAdminEmail } from '../config/constants.js';
import { verifyKeycloakToken } from '../config/keycloak.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  isAdmin?: boolean;
  /** True when the caller was admitted without a token by public-access mode. */
  isGuest?: boolean;
}

/**
 * Public-access mode: requests without a token are admitted as guests instead
 * of being rejected with 401, so the site is usable without signing in.
 *
 * This never grants admin: `requireAdmin` still rejects guests, so admin routes
 * continue to demand a verified Keycloak token from an allowlisted account.
 * Set `DISABLE_AUTH=false` to restore the sign-in requirement.
 */
const isAuthDisabled = (): boolean => process.env.DISABLE_AUTH !== 'false';

/**
 * Identify an anonymous caller by the per-browser id the frontend generates.
 * Falls back to a shared id, which only affects users who strip the header.
 */
const guestIdentity = (req: Request): { userId: string; userEmail: string } => {
  const raw = req.headers['x-guest-id'];
  const headerId = Array.isArray(raw) ? raw[0] : raw;
  const safeId =
    typeof headerId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(headerId)
      ? headerId
      : 'guest';
  return { userId: safeId, userEmail: '' };
};

const admitGuest = (req: AuthenticatedRequest, next: NextFunction) => {
  const { userId, userEmail } = guestIdentity(req);
  req.userId = userId;
  req.userEmail = userEmail;
  req.isAdmin = false;
  req.isGuest = true;
  return next();
};

/**
 * Validate Keycloak token and extract user info
 * Always verifies tokens when provided (both production and development)
 * In development, allows header-based auth as fallback when no token is provided
 */
export const validateKeycloakToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const hasToken = authHeader && authHeader.startsWith('Bearer ');

    // If token is provided, always verify it (even in development)
    if (hasToken) {
      const token = authHeader!.substring(7);

      try {
        // Verify the token with Keycloak
        const verified = await verifyKeycloakToken(token);

        // Set user info from verified token
        req.userId = verified.userId;
        req.userEmail = verified.userEmail;
        req.isAdmin = isAdminEmail(verified.userEmail);

        return next();
      } catch (verifyError) {
        console.error('Token verification failed:', verifyError);
        // A bad token is still a failed sign-in attempt, not anonymous
        // browsing, so it is rejected even in public-access mode.
        return res.status(401).json({
          error: 'Invalid or expired token',
          ...(isDevelopment && {
            details:
              verifyError instanceof Error
                ? verifyError.message
                : String(verifyError),
          }),
        });
      }
    }

    // No token provided - check if we can use header-based auth (development only)
    if (isDevelopment) {
      const userId =
        (req.headers['x-user-id'] as string) ||
        (req.headers['X-User-Id'] as string);
      const userEmail =
        (req.headers['x-user-email'] as string) ||
        (req.headers['X-User-Email'] as string);

      if (userId && userEmail) {
        console.warn(
          '⚠️  Using header-based authentication (development mode fallback - no token provided)'
        );
        req.userId = userId;
        req.userEmail = userEmail;
        req.isAdmin = isAdminEmail(userEmail);
        return next();
      }
    }

    // Public-access mode: let anonymous visitors through as guests
    if (isAuthDisabled()) {
      return admitGuest(req, next);
    }

    // No token and no headers (or in production) - require authentication
    return res.status(401).json({
      error: 'Missing or invalid authorization header',
      ...(isDevelopment && {
        details:
          'Provide either a Bearer token in Authorization header or x-user-id/x-user-email headers (dev only)',
      }),
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional auth for ORKG Ask routes: allows requests when ORKG_ASK_API_KEY is configured,
 * even without Keycloak login. When a token is provided, it is still validated.
 */
export const validateKeycloakTokenOrOrkgAskConfigured = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const hasOrkgAskKey =
    process.env.ORKG_ASK_API_KEY &&
    process.env.ORKG_ASK_API_KEY.trim().length > 0;

  const authHeader = req.headers.authorization;
  const hasToken = authHeader && authHeader.startsWith('Bearer ');

  if (hasToken) {
    return validateKeycloakToken(req, res, next);
  }

  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (isDevelopment) {
    const userId =
      (req.headers['x-user-id'] as string) ||
      (req.headers['X-User-Id'] as string);
    const userEmail =
      (req.headers['x-user-email'] as string) ||
      (req.headers['X-User-Email'] as string);
    if (userId && userEmail) {
      req.userId = userId;
      req.userEmail = userEmail;
      req.isAdmin = isAdminEmail(userEmail);
      return next();
    }
  }

  if (hasOrkgAskKey) {
    return next();
  }

  if (isAuthDisabled()) {
    return admitGuest(req, next);
  }

  return res.status(401).json({
    error: 'Missing or invalid authorization header',
    ...(isDevelopment && {
      details:
        'Provide a Bearer token, or ensure ORKG_ASK_API_KEY is set in backend .env',
    }),
  });
};

export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Public-access guests are anonymous by construction: never treat the
    // guest id as an account that could be looked up and promoted.
    if (req.isGuest) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.isAdmin) {
      // Double-check against Firebase
      const userDoc = await db.collection('Users').doc(req.userId).get();
      const userData = userDoc.data();

      const isAdmin =
        userData?.is_admin === true ||
        (req.userEmail && isAdminEmail(req.userEmail));

      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      req.isAdmin = true;
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
};
