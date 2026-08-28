import { Box, Typography, useTheme } from '@mui/material';
import { FutureDevelopmentContent } from '../../firestore/CRUDHomeContent';
import { fadeUp, MotionBox, staggerReveal } from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import SectionHeading from './SectionHeading';
import SafeHtml from './SafeHtml';
import { plateSx } from './atlasTokens';

interface FutureDevelopmentProps {
  content: FutureDevelopmentContent;
}

const FutureDevelopment = ({ content }: FutureDevelopmentProps) => {
  const reveal = useRevealMotion();
  const theme = useTheme();
  const count = content.phases.length || 1;

  return (
    <Box sx={plateSx(theme.palette.mode)}>
      <SectionHeading eyebrow="Horizons" title={content.title} />
      <Typography
        sx={{
          fontSize: { xs: '1rem', sm: '1.05rem' },
          lineHeight: 1.7,
          color: 'text.secondary',
          mb: 4,
          maxWidth: 720,
        }}
      >
        {content.intro}
      </Typography>
      <MotionBox {...reveal} variants={staggerReveal}>
        <Box
          aria-hidden
          sx={{
            position: 'relative',
            height: 4,
            mb: { xs: 3, md: 4 },
            mx: { md: 2 },
            borderRadius: 99,
            bgcolor:
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(58,83,102,0.12)',
            display: { xs: 'none', sm: 'block' },
            '&:after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              width: `${100 / count}%`,
              borderRadius: 99,
              bgcolor: 'primary.main',
            },
          }}
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: `repeat(${Math.min(count, 3)}, 1fr)`,
            },
            gap: { xs: 3, sm: 3, md: 4 },
          }}
        >
          {content.phases.map((item, index) => (
            <MotionBox key={item.phase} variants={fadeUp}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: index === 0 ? 'primary.main' : 'transparent',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  mb: 1.5,
                  display: { xs: 'none', sm: 'block' },
                }}
              />
              <Typography
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  fontSize: '1.1rem',
                  color: 'primary.main',
                  mb: 1,
                }}
              >
                {item.phase}
              </Typography>
              <SafeHtml
                html={item.goal}
                sx={{ color: 'text.secondary', lineHeight: 1.7 }}
              />
            </MotionBox>
          ))}
        </Box>
      </MotionBox>
    </Box>
  );
};

export default FutureDevelopment;
