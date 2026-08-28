import { Box, Typography, useTheme } from '@mui/material';
import { KeyFeaturesContent } from '../../firestore/CRUDHomeContent';
import {
  fadeUp,
  hoverLift,
  MotionBox,
  staggerReveal,
} from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import { useReducedMotion } from 'motion/react';
import SectionHeading from './SectionHeading';
import SafeHtml from './SafeHtml';
import { ATLAS_DISPLAY_FONT, plateSx } from './atlasTokens';

interface KeyFeaturesProps {
  content: KeyFeaturesContent;
}

const KeyFeatures = ({ content }: KeyFeaturesProps) => {
  const reveal = useRevealMotion();
  const reduceMotion = useReducedMotion();
  const theme = useTheme();

  return (
    <Box>
      <SectionHeading eyebrow="Why this map" title={content.title} />
      <MotionBox
        {...reveal}
        variants={staggerReveal}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          position: 'relative',
        }}
      >
        {content.features.map((feature) => (
          <MotionBox
            key={feature.title}
            variants={fadeUp}
            whileHover={reduceMotion ? undefined : hoverLift}
            sx={{
              ...plateSx(theme.palette.mode),
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                boxShadow: (t) => `0 0 0 6px ${t.palette.primary.main}22`,
                mb: 0.5,
              }}
            />
            <Typography
              sx={{
                fontFamily: ATLAS_DISPLAY_FONT,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                fontSize: '1.2rem',
                lineHeight: 1.25,
              }}
            >
              {feature.title}
            </Typography>
            <SafeHtml
              html={feature.description}
              sx={{ color: 'text.secondary', lineHeight: 1.7, flex: 1 }}
            />
          </MotionBox>
        ))}
      </MotionBox>
    </Box>
  );
};

export default KeyFeatures;
