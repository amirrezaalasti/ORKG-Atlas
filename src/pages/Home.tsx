import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import Header from '../components/Home/Header';
import HighPriorityNews from '../components/Home/HighPriorityNews';
import AboutProject from '../components/Home/AboutProject';
import KeyFeatures from '../components/Home/KeyFeatures';
import FutureDevelopment from '../components/Home/FutureDevelopment';
import Contact from '../components/Home/Contact';
import Partners from '../components/Home/Partners';
import TemplateTerritories from '../components/Home/TemplateTerritories';
import CoveragePlates from '../components/Home/CoveragePlates';
import CRUDHomeContent, { HomeContentData } from '../firestore/CRUDHomeContent';
import { useBackupChange } from '../hooks/useBackupChange';
import Reveal from '../components/Reveal';
import { MotionBox } from '../constants/motion';
import { heroWashSx, homeContainerSx } from '../components/Home/atlasTokens';

const Home = () => {
  const [homeContent, setHomeContent] = useState<HomeContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backupVersion = useBackupChange();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        const content = await CRUDHomeContent.getHomeContent();
        setHomeContent(content);
        setError(null);
      } catch (err) {
        console.error('Error fetching home content:', err);
        setError('Failed to load page content. Using default content.');
        setHomeContent(CRUDHomeContent.defaultHomeContent);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [backupVersion]);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    if (!reduceMotion) root.style.scrollBehavior = 'smooth';
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, [reduceMotion]);

  if (loading) {
    return (
      <MotionBox
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        sx={{
          minHeight: '70vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
      </MotionBox>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        ...heroWashSx,
      }}
    >
      <Box sx={{ ...homeContainerSx, flex: 1, py: { xs: 1, md: 2 } }}>
        {error && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 1 }}>
            {error}
          </Alert>
        )}
        {homeContent && (
          <Stack spacing={{ xs: 6, md: 8 }} sx={{ pb: { xs: 6, md: 10 } }}>
            <Box>
              <Header
                content={homeContent.header}
                templates={homeContent.templates}
              />
              <HighPriorityNews />
            </Box>
            <Reveal>
              <TemplateTerritories
                templates={homeContent.templates}
                infoBoxes={homeContent.templateInfoBoxes}
              />
            </Reveal>
            {homeContent.templateCoverage && (
              <Reveal>
                <CoveragePlates content={homeContent.templateCoverage} />
              </Reveal>
            )}
            <Reveal>
              <AboutProject content={homeContent.aboutProject} />
            </Reveal>
            <KeyFeatures content={homeContent.keyFeatures} />
            <FutureDevelopment content={homeContent.futureDevelopment} />
            <Reveal>
              <Contact content={homeContent.contact} />
            </Reveal>
            <Partners content={homeContent.partners} />
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default Home;
