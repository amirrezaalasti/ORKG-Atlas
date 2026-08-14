import { Box, Card, Paper, Stack, Typography } from '@mui/material';
import { motion, type Transition, type Variants } from 'motion/react';

/** Smooth decelerate — reads as precise, not playful. */
export const easeOutExpo: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
];

export const revealTransition: Transition = {
  duration: 0.45,
  ease: easeOutExpo,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: revealTransition,
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

/** Container fades up and staggers children. */
export const staggerReveal: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      ...revealTransition,
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

export const hoverLift = {
  y: -4,
  transition: { duration: 0.2, ease: easeOutExpo },
};

export const MotionBox = motion.create(Box);
export const MotionPaper = motion.create(Paper);
export const MotionTypography = motion.create(Typography);
export const MotionStack = motion.create(Stack);
export const MotionCard = motion.create(Card);
