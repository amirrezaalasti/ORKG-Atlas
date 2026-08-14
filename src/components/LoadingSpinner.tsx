import { CircularProgress, useTheme } from '@mui/material';
import { useReducedMotion } from 'motion/react';
import { easeOutExpo, MotionBox } from '../constants/motion';

const LoadingSpinner = () => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <MotionBox
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: easeOutExpo }}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100%',
        backgroundColor: 'background.default',
      }}
    >
      <CircularProgress sx={{ color: theme.palette.primary.main }} />
    </MotionBox>
  );
};

export default LoadingSpinner;
