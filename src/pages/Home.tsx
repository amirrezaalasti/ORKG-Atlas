import {
  Container,
  Stack,
  Divider,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import theme from '../utils/theme';
import Header from '../components/Home/Header';
import HighPriorityNews from '../components/Home/HighPriorityNews';
import AboutProject from '../components/Home/AboutProject';
import KeyFeatures from '../components/Home/KeyFeatures';
import FutureDevelopment from '../components/Home/FutureDevelopment';
import Contact from '../components/Home/Contact';
import Partners from '../components/Home/Partners';
import CRUDHomeContent, { HomeContentData } from '../firestore/CRUDHomeContent';
import { useBackupChange } from '../hooks/useBackupChange';
import Reveal from '../components/Reveal';
import { MotionBox } from '../constants/motion';
import { useReducedMotion } from 'motion/react';

const Home = () => {
  const [homeContent, setHomeContent] = useState<HomeContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backupVersion = useBackupChange(); // Listen for backup changes
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
        // Use default content on error
        setHomeContent(CRUDHomeContent.defaultHomeContent);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [backupVersion]); // Re-fetch when backup changes

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <MotionBox
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          sx={{
            minHeight: '100vh',
            width: '100%',
            bgcolor: 'background.default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress sx={{ color: '#e86161' }} />
        </MotionBox>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          minHeight: '100vh',
          width: '100%',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            py: { xs: 1, sm: 2, md: 3 },
            px: { xs: 1, sm: 1, md: 2 },
          }}
        >
          <Stack spacing={2} sx={{ flex: 1 }}>
            {error && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {homeContent && (
              <>
                <Header content={homeContent.header} />
                <Reveal>
                  <HighPriorityNews />
                </Reveal>
                <Divider sx={{ my: { xs: 3, sm: 4, md: 5 } }} />
                <Stack spacing={4}>
                  <Reveal>
                    <AboutProject content={homeContent.aboutProject} />
                  </Reveal>
                  <KeyFeatures content={homeContent.keyFeatures} />
                  <FutureDevelopment content={homeContent.futureDevelopment} />
                  <Reveal>
                    <Contact content={homeContent.contact} />
                  </Reveal>
                </Stack>
                <Partners content={homeContent.partners} />
              </>
            )}
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default Home;
