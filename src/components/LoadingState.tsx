import { CircularProgress, Typography } from '@mui/material';
import { useReducedMotion } from 'motion/react';
import { easeOutExpo, MotionBox } from '../constants/motion';

const LoadingState = () => {
  const reduceMotion = useReducedMotion();

  return (
    <MotionBox
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: easeOutExpo }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: 2,
      }}
    >
      <CircularProgress sx={{ color: '#e86161' }} />
      <Typography color="text.secondary">Loading data...</Typography>
    </MotionBox>
  );
};

export default LoadingState;
