import { Box, Typography } from '@mui/material';
import { KeyFeaturesContent } from '../../firestore/CRUDHomeContent';
import {
  fadeUp,
  hoverLift,
  MotionBox,
  MotionPaper,
  staggerReveal,
} from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import { useReducedMotion } from 'motion/react';

interface KeyFeaturesProps {
  content: KeyFeaturesContent;
}

const KeyFeatures = ({ content }: KeyFeaturesProps) => {
  const reveal = useRevealMotion();
  const reduceMotion = useReducedMotion();

  return (
    <MotionPaper
      elevation={2}
      {...reveal}
      variants={staggerReveal}
      whileHover={reduceMotion ? undefined : hoverLift}
      sx={{
        p: { xs: 3, sm: 4, md: 5 },
        borderRadius: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
      }}
    >
      <MotionBox variants={fadeUp}>
        <Typography
          variant="h4"
          gutterBottom
          sx={{
            color: '#e86161',
            fontWeight: 700,
            mb: 3,
            fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
          }}
        >
          {content.title}
        </Typography>
      </MotionBox>
      <MotionBox variants={fadeUp} sx={{ pl: { xs: 2, sm: 3, md: 4 } }}>
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {content.features.map((feature, index) => (
            <Typography
              component="li"
              key={index}
              sx={{
                mb: 3,
                fontSize: { xs: '1rem', sm: '1.1rem' },
                lineHeight: 1.7,
              }}
            >
              <Box
                component="strong"
                sx={{
                  color: '#e86161',
                  display: 'block',
                  mb: 1,
                  fontSize: { xs: '1.1rem', sm: '1.2rem' },
                }}
              >
                {feature.title}
              </Box>
              <Box dangerouslySetInnerHTML={{ __html: feature.description }} />
            </Typography>
          ))}
        </Box>
      </MotionBox>
    </MotionPaper>
  );
};

export default KeyFeatures;
