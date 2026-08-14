import { Box, Typography } from '@mui/material';
import { FutureDevelopmentContent } from '../../firestore/CRUDHomeContent';
import {
  fadeUp,
  hoverLift,
  MotionBox,
  MotionPaper,
  staggerReveal,
} from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import { useReducedMotion } from 'motion/react';

interface FutureDevelopmentProps {
  content: FutureDevelopmentContent;
}

const FutureDevelopment = ({ content }: FutureDevelopmentProps) => {
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
      <MotionBox variants={fadeUp}>
        <Typography
          paragraph
          sx={{
            fontSize: { xs: '1rem', sm: '1.1rem' },
            lineHeight: 1.7,
            mb: 3,
          }}
        >
          {content.intro}
        </Typography>
      </MotionBox>
      <MotionBox variants={fadeUp} sx={{ pl: { xs: 2, sm: 3, md: 4 } }}>
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {content.phases.map((item, index) => (
            <Typography
              component="li"
              key={index}
              sx={{
                mb: 3,
                fontSize: { xs: '1rem', sm: '1.1rem' },
                lineHeight: 1.7,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                component="strong"
                sx={{
                  color: '#e86161',
                  mb: 1,
                  fontSize: { xs: '1.1rem', sm: '1.2rem' },
                }}
              >
                {item.phase}
              </Box>
              <Box dangerouslySetInnerHTML={{ __html: item.goal }} />
            </Typography>
          ))}
        </Box>
      </MotionBox>
    </MotionPaper>
  );
};

export default FutureDevelopment;
