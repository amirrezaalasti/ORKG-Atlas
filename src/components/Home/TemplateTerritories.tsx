import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  fadeUp,
  hoverLift,
  MotionBox,
  staggerContainer,
} from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import { useReducedMotion } from 'motion/react';
import { Template, TemplateInfoBoxes } from '../../firestore/CRUDHomeContent';
import SectionHeading from './SectionHeading';
import SafeHtml from './SafeHtml';
import { plateSx } from './atlasTokens';

interface TemplateTerritoriesProps {
  templates: Template[];
  infoBoxes: TemplateInfoBoxes;
}

const TemplateTerritories = ({
  templates,
  infoBoxes,
}: TemplateTerritoriesProps) => {
  const theme = useTheme();
  const reveal = useRevealMotion();
  const reduceMotion = useReducedMotion();
  const { templateId } = useParams<{ templateId: string }>();

  if (!templates.length) return null;

  return (
    <Box id="templates" sx={{ scrollMarginTop: 96 }}>
      <SectionHeading eyebrow="The territories" title="Choose a template" />
      <MotionBox
        {...reveal}
        variants={staggerContainer}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 2.5,
        }}
      >
        {templates.map((tpl) => {
          const info = infoBoxes[tpl.id];
          const here = tpl.id === templateId;
          return (
            <MotionBox
              key={tpl.id}
              variants={fadeUp}
              whileHover={reduceMotion ? undefined : hoverLift}
              sx={{
                ...plateSx(theme.palette.mode),
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                borderColor: here ? 'primary.main' : undefined,
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Typography
                  sx={{
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    fontSize: '1.25rem',
                  }}
                >
                  {info?.title || tpl.title}
                </Typography>
                {here && (
                  <Typography
                    variant="caption"
                    sx={{
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'primary.main',
                      fontWeight: 700,
                    }}
                  >
                    You are here
                  </Typography>
                )}
              </Stack>
              {info?.description && (
                <SafeHtml
                  html={info.description}
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.65,
                    flex: 1,
                    fontSize: '1rem',
                  }}
                />
              )}
              <Button
                component={RouterLink}
                to={`/${tpl.id}/allquestions`}
                variant={here ? 'contained' : 'outlined'}
                color="primary"
                sx={{
                  alignSelf: 'flex-start',
                  fontWeight: 700,
                  mt: 1,
                  boxShadow: 'none',
                }}
              >
                Open this map
              </Button>
            </MotionBox>
          );
        })}
      </MotionBox>
    </Box>
  );
};

export default TemplateTerritories;
