import { Box, Typography, useTheme } from '@mui/material';
import { fadeUp, MotionBox, staggerContainer } from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import { TemplateCoverageContent } from '../../firestore/CRUDHomeContent';
import SectionHeading from './SectionHeading';
import SafeHtml from './SafeHtml';
import { ATLAS_DISPLAY_FONT, plateSx } from './atlasTokens';

interface CoveragePlatesProps {
  content: TemplateCoverageContent;
}

const CoveragePlates = ({ content }: CoveragePlatesProps) => {
  const theme = useTheme();
  const reveal = useRevealMotion();

  if (!content.cards?.length) return null;

  return (
    <Box>
      <SectionHeading eyebrow="Lenses" title={content.title} />
      {content.subtitleHtml && (
        <SafeHtml
          html={content.subtitleHtml}
          sx={{
            color: 'text.secondary',
            mb: 3,
            maxWidth: 720,
            lineHeight: 1.7,
          }}
        />
      )}
      <MotionBox
        {...reveal}
        variants={staggerContainer}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
          },
          gap: 2,
        }}
      >
        {content.cards.map((card) => (
          <MotionBox
            key={card.title}
            variants={fadeUp}
            sx={{
              ...plateSx(theme.palette.mode),
              position: 'relative',
              minHeight: 180,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: 'primary.main',
                mb: 2,
              }}
            />
            <Typography
              sx={{
                fontFamily: ATLAS_DISPLAY_FONT,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                fontSize: '1.15rem',
                mb: 1.25,
              }}
            >
              {card.title}
            </Typography>
            <SafeHtml
              html={card.descriptionHtml}
              sx={{ color: 'text.secondary', lineHeight: 1.65 }}
            />
          </MotionBox>
        ))}
      </MotionBox>
    </Box>
  );
};

export default CoveragePlates;
