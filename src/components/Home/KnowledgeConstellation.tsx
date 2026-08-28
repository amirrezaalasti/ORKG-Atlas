import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { Template } from '../../firestore/CRUDHomeContent';
import { fadeUp, MotionBox, staggerContainer } from '../../constants/motion';
import { plateSx } from './atlasTokens';
import { ATLAS_STEPS } from './constellationLayout';

interface KnowledgeConstellationProps {
  templates: Template[];
}

const KnowledgeConstellation = ({ templates }: KnowledgeConstellationProps) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { templateId } = useParams<{ templateId: string }>();
  const shown = templates.slice(0, 4);

  return (
    <MotionBox
      initial={reduceMotion ? false : 'hidden'}
      animate="show"
      variants={staggerContainer}
      sx={{
        ...plateSx(theme.palette.mode),
        p: { xs: 2.5, sm: 3 },
      }}
    >
      <Typography
        variant="overline"
        sx={{
          letterSpacing: '0.16em',
          color: 'primary.main',
          fontWeight: 700,
          display: 'block',
          mb: 2,
        }}
      >
        How Atlas works
      </Typography>

      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          mb: 3,
          pl: 0.5,
          '&:before': {
            content: '""',
            position: 'absolute',
            left: 15,
            top: 12,
            bottom: 12,
            width: 2,
            bgcolor: 'primary.main',
            opacity: 0.2,
          },
        }}
      >
        {ATLAS_STEPS.map((step, index) => (
          <MotionBox
            key={step.title}
            variants={fadeUp}
            sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}
          >
            <Box
              aria-hidden
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {index + 1}
            </Box>
            <Box sx={{ pt: 0.25 }}>
              <Typography fontWeight={700} sx={{ lineHeight: 1.3 }}>
                {step.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ lineHeight: 1.55, mt: 0.25 }}
              >
                {step.body}
              </Typography>
            </Box>
          </MotionBox>
        ))}
      </Box>

      {shown.length > 0 && (
        <Box>
          <Typography
            variant="overline"
            sx={{
              letterSpacing: '0.16em',
              color: 'text.secondary',
              fontWeight: 700,
              display: 'block',
              mb: 1.5,
            }}
          >
            Open a template
          </Typography>
          <Stack spacing={1.25}>
            {shown.map((tpl) => {
              const here = tpl.id === templateId;
              return (
                <Box
                  key={tpl.id}
                  sx={{
                    border: '1px solid',
                    borderColor: here ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 1.75,
                    bgcolor: here ? 'action.hover' : 'transparent',
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap={1}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={700} sx={{ lineHeight: 1.3 }}>
                        {tpl.title}
                      </Typography>
                      {here && (
                        <Typography
                          variant="caption"
                          color="primary"
                          fontWeight={700}
                          sx={{ letterSpacing: '0.06em' }}
                        >
                          Viewing now
                        </Typography>
                      )}
                    </Box>
                    <Button
                      component={RouterLink}
                      to={`/${tpl.id}/allquestions`}
                      size="small"
                      variant={here ? 'contained' : 'outlined'}
                      color="primary"
                      sx={{ flexShrink: 0, boxShadow: 'none' }}
                    >
                      Open
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </MotionBox>
  );
};

export default KnowledgeConstellation;
