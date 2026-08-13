import { useAuth } from './useAuth';
import { useState, useEffect } from 'react';
import UserSync, { FirebaseUser } from '../firestore/UserSync';
import { AUTH_DISABLED, GUEST_USER } from './publicAccess';

/**
 * Authentication hook that provides Keycloak state + Firebase user data
 * This is the single source of truth for authentication data
 *
 * While {@link AUTH_DISABLED} is on, visitors without a Keycloak session are
 * reported as authenticated guests so user-facing features stay open. Admin
 * checks must use `isRealAuthenticated`/`user.is_admin`, which never hold for
 * a guest.
 */
export const useAuthData = () => {
  const keycloakAuth = useAuth();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoadingFirebaseUser, setIsLoadingFirebaseUser] = useState(false);

  // Fetch Firebase user data when authenticated
  useEffect(() => {
    if (keycloakAuth.isAuthenticated && keycloakAuth.user?.id) {
      setIsLoadingFirebaseUser(true);
      UserSync.getFirebaseUser(keycloakAuth.user.id)
        .then((fbUser) => {
          setFirebaseUser(fbUser);
          setIsLoadingFirebaseUser(false);
        })
        .catch((err) => {
          console.error('Error fetching Firebase user:', err);
          setIsLoadingFirebaseUser(false);
        });
    } else {
      setFirebaseUser(null);
      setIsLoadingFirebaseUser(false);
    }
  }, [keycloakAuth.isAuthenticated, keycloakAuth.user?.id]);

  // Merge Keycloak user with Firebase user data
  const mergedUser = keycloakAuth.user
    ? {
        ...keycloakAuth.user,
        ...firebaseUser,
        is_admin: firebaseUser?.is_admin || false,
      }
    : null;

  const isRealAuthenticated = keycloakAuth.isAuthenticated;
  const isLoading = keycloakAuth.isLoading || isLoadingFirebaseUser;

  if (AUTH_DISABLED && !isRealAuthenticated) {
    return {
      isAuthenticated: true,
      /** True only for a verified Keycloak session; guards admin access. */
      isRealAuthenticated: false,
      // Keep the real loading flag: AdminGuard must wait for check-sso to
      // finish before deciding an admin is not signed in.
      isLoading,
      user: GUEST_USER,
      login: keycloakAuth.login,
      logout: keycloakAuth.logout,
      error: keycloakAuth.error,
    };
  }

  return {
    isAuthenticated: isRealAuthenticated,
    isRealAuthenticated,
    isLoading,
    user: mergedUser,
    login: keycloakAuth.login,
    logout: keycloakAuth.logout,
    error: keycloakAuth.error,
  };
};
