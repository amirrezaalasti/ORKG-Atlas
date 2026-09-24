import { useEffect } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  EMPIRE_TEAM_URL,
  shouldRedirectToEmpireTeam,
} from '../constants/teamPage';
import Team from './Team';

/**
 * Team lives on EmpiRE Compass. Atlas hosts hard-navigate there because the
 * Atlas /api/team backend is down; EmpiRE Compass and local keep the in-app page.
 */
const TeamRoute = () => {
  const redirect = shouldRedirectToEmpireTeam();

  useEffect(() => {
    if (redirect) {
      window.location.replace(EMPIRE_TEAM_URL);
    }
  }, [redirect]);

  if (redirect) {
    return <LoadingSpinner />;
  }

  return <Team />;
};

export default TeamRoute;
