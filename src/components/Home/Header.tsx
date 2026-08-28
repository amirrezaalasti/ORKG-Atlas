import { Box, Button, Stack, Typography } from '@mui/material';
import { type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import {
  HeaderContent,
  Template,
  TemplateCoverageCard,
} from '../../firestore/CRUDHomeContent';
import { fadeUp, MotionBox, staggerContainer } from '../../constants/motion';
import { ATLAS_DISPLAY_FONT } from './atlasTokens';
import KnowledgeConstellation from './KnowledgeConstellation';
import SafeHtml from './SafeHtml';

interface HeaderProps {
  content: HeaderContent;
  templates: Template[];
  coverageCards?: TemplateCoverageCard[];
}

const isHashOrExternal = (href: string) =>
  href.startsWith('#') ||
  href.startsWith('http://') ||
  href.startsWith('https://');

const Header = ({ content, templates, coverageCards }: HeaderProps) => {
  const reduceMotion = useReducedMotion();
  const { templateId } = useParams<{ templateId: string }>();
  const primary = content.ctaPrimary ?? {
    label: 'Explore templates',
    href: '#templates',
  };
  const secondary = content.ctaSecondary ?? {
    label: 'Learn more',
    href: '#about',
  };

  return (
    <MotionBox
      initial={reduceMotion ? false : 'hidden'}
      animate="show"
      variants={staggerContainer}
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          md: 'minmax(0, 1.05fr) minmax(0, 1fr)',
        },
        gap: { xs: 4, md: 6 },
        alignItems: 'center',
        py: { xs: 3, sm: 5, md: 7 },
      }}
    >
      <Box>
        <MotionBox variants={fadeUp}>
          <Typography
            variant="overline"
            sx={{
              letterSpacing: '0.24em',
              color: 'primary.main',
              fontWeight: 700,
              fontSize: '0.7rem',
            }}
          >
            Open Research Knowledge Graph
          </Typography>
        </MotionBox>
        <MotionBox variants={fadeUp}>
          <Typography
            variant="h1"
            sx={{
              fontFamily: ATLAS_DISPLAY_FONT,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              fontSize: { xs: '3rem', sm: '4.25rem', md: '5rem' },
              lineHeight: 0.92,
              color: 'primary.main',
              mt: 1,
              mb: 2,
            }}
          >
            {content.title}
          </Typography>
        </MotionBox>
        <MotionBox variants={fadeUp}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: ATLAS_DISPLAY_FONT,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.15rem', sm: '1.35rem' },
              lineHeight: 1.35,
              color: 'text.primary',
              maxWidth: 540,
              mb: 2,
            }}
          >
            {content.subtitle}
          </Typography>
        </MotionBox>
        {content.descriptionHtml && (
          <MotionBox variants={fadeUp}>
            <SafeHtml
              html={content.descriptionHtml}
              sx={{
                color: 'text.secondary',
                fontSize: { xs: '1rem', sm: '1.05rem' },
                lineHeight: 1.7,
                maxWidth: 560,
                mb: 3,
              }}
            />
          </MotionBox>
        )}
        <MotionBox variants={fadeUp}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <AtlasCta
              href={primary.href}
              templateId={templateId}
              variant="contained"
            >
              {primary.label}
            </AtlasCta>
            <AtlasCta
              href={secondary.href}
              templateId={templateId}
              variant="outlined"
            >
              {secondary.label}
            </AtlasCta>
          </Stack>
        </MotionBox>
      </Box>
      <MotionBox variants={fadeUp}>
        <KnowledgeConstellation
          templates={templates}
          coverageCards={coverageCards}
        />
      </MotionBox>
    </MotionBox>
  );
};

interface AtlasCtaProps {
  href: string;
  templateId?: string;
  variant: 'contained' | 'outlined';
  children: ReactNode;
}

const ctaSx = {
  fontFamily: ATLAS_DISPLAY_FONT,
  fontWeight: 700,
  px: 2.5,
  boxShadow: 'none',
} as const;

const AtlasCta = ({ href, templateId, variant, children }: AtlasCtaProps) => {
  if (isHashOrExternal(href)) {
    return (
      <Button
        variant={variant}
        size="large"
        color="primary"
        href={href}
        sx={ctaSx}
      >
        {children}
      </Button>
    );
  }

  const to = href.startsWith('/') ? href : `/${templateId || ''}/${href}`;

  return (
    <Button
      variant={variant}
      size="large"
      color="primary"
      component={RouterLink}
      to={to}
      sx={ctaSx}
    >
      {children}
    </Button>
  );
};

export default Header;
