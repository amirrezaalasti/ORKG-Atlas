import { Box } from '@mui/material';
import { motion, useReducedMotion } from 'motion/react';

const MotionBox = motion.create(Box);

interface RotateProps {
  size?: number;
}

const Rotate = ({ size = 100 }: RotateProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      animate={shouldReduceMotion ? undefined : { rotate: 360 }}
      transition={{ duration: 1 }}
      sx={{
        width: size,
        height: size,
        bgcolor: 'primary.main',
        borderRadius: 1,
      }}
    />
  );
};

export default Rotate;
