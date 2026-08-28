import Keycloak from 'keycloak-js';

let keycloakInstance: Keycloak | null = null;

/**
 * Return the process-wide Keycloak adapter.
 * keycloak-js and ReactKeycloakProvider require a single instance; creating a
 * new client on every AuthProvider render leaves authClient unassigned and
 * makes useKeycloak() throw.
 */
export const createKeycloak = (): Keycloak => {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: import.meta.env.VITE_KEYCLOAK_URL,
      realm: import.meta.env.VITE_KEYCLOAK_REALM,
      clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
    });
  }
  return keycloakInstance;
};
