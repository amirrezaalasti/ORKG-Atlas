import { Box, Button, Stack, Typography } from '@mui/material';
import { type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { HeaderContent, Template } from '../../firestore/CRUDHomeContent';
import { fadeUp, MotionBox, staggerContainer } from '../../constants/motion';
import KnowledgeConstellation from './KnowledgeConstellation';
import SafeHtml from './SafeHtml';

interface HeaderProps {
  content: HeaderContent;
  templates: Template[];
}

const isHashOrExternal = (href: string) =>
  href.startsWith('#') ||
  href.startsWith('http://') ||
  href.startsWith('https://');

const Header = ({ content, templates }: HeaderProps) => {
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
          md: 'minmax(0, 1.05fr) minmax(280px, 0.9fr)',
        },
        gap: { xs: 4, md: 6 },
        alignItems: 'center',
        py: { xs: 3, sm: 4, md: 6 },
      }}
    >
      <Box>
        <MotionBox variants={fadeUp}>
          <Typography
            variant="overline"
            sx={{
              letterSpacing: '0.18em',
              color: 'primary.main',
              fontWeight: 700,
            }}
          >
            Open Research Knowledge Graph
          </Typography>
        </MotionBox>
        <MotionBox variants={fadeUp}>
          <Typography
            variant="h1"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontSize: { xs: '2.5rem', sm: '3.25rem', md: '3.5rem' },
              lineHeight: 1.1,
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
              fontWeight: 500,
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
              lineHeight: 1.45,
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
        <KnowledgeConstellation templates={templates} />
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
