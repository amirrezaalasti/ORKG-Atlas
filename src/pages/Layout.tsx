import { Box, Fab } from '@mui/material';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import Header from '../components/Header';
import MenuDrawer from '../components/MenuDrawer';
import ScrollTop from '../components/ScrollTop';
import Footer from '../components/Home/Footer';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { fetchQuestionsFromFirebase } from '../store/slices/questionSlice';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';
import BackupWarningBanner from '../components/BackupWarningBanner';
import { easeOutExpo, MotionBox } from '../constants/motion';

const Layout = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const handleDrawerOpen = () => {
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
  };
  const { templateId } = useParams();
  const dispatch = useDispatch<AppDispatch>();
  const isChatRoute =
    location.pathname === '/chat' || location.pathname.startsWith('/chat/');

  useEffect(() => {
    if (templateId) {
      dispatch(fetchQuestionsFromFirebase(templateId));
    }
  }, [templateId, dispatch]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: '100vh',
        backgroundColor: 'background.default',
        ...(isChatRoute && { height: '100vh', overflow: 'hidden' }),
      }}
    >
      <Header handleDrawerOpen={handleDrawerOpen} />
      <MenuDrawer open={drawerOpen} handleDrawerClose={handleDrawerClose} />
      <BackupWarningBanner />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          ...(isChatRoute && { minHeight: 0, overflow: 'hidden' }),
          transition: (theme) =>
            theme.transitions.create('margin', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          ...(drawerOpen && {
            transition: (theme) =>
              theme.transitions.create('margin', {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
            marginLeft: '280px',
          }),
        }}
      >
        <MotionBox
          key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: easeOutExpo }}
          sx={{
            flexGrow: 1,
            ...(isChatRoute && {
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }),
          }}
        >
          <Outlet />
        </MotionBox>
        {!isChatRoute && <Footer />}
      </Box>

      {!isChatRoute && (
        <ScrollTop>
          <Fab
            size="small"
            aria-label="scroll back to top"
            sx={{
              backgroundColor: '#e86161',
              color: 'white',
              '&:hover': {
                backgroundColor: '#d45555',
              },
            }}
          >
            <KeyboardArrowUpIcon />
          </Fab>
        </ScrollTop>
      )}
    </Box>
  );
};

export default Layout;
