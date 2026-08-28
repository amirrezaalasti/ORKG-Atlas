import { Box, Stack, useTheme } from '@mui/material';
import { AboutProjectContent } from '../../firestore/CRUDHomeContent';
import SectionHeading from './SectionHeading';
import SafeHtml from './SafeHtml';
import { plateSx } from './atlasTokens';

interface AboutProjectProps {
  content: AboutProjectContent;
}

const AboutProject = ({ content }: AboutProjectProps) => {
  const theme = useTheme();

  return (
    <Box
      id="about"
      sx={{
        ...plateSx(theme.palette.mode),
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(200px, 0.42fr) 1fr' },
        gap: { xs: 2, md: 5 },
        scrollMarginTop: 96,
      }}
    >
      <SectionHeading eyebrow="The legend" title={content.title} />
      <Box>
        <SafeHtml
          html={content.content}
          sx={{
            fontSize: { xs: '1rem', sm: '1.05rem' },
            lineHeight: 1.75,
            color: 'text.primary',
          }}
        />
        {content.themes.length > 0 && (
          <Stack
            component="ul"
            spacing={1.25}
            sx={{ listStyle: 'none', p: 0, mt: 3 }}
          >
            {content.themes.map((themeItem) => (
              <Stack
                component="li"
                key={themeItem}
                direction="row"
                spacing={1.5}
                alignItems="flex-start"
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    mt: 0.9,
                    flexShrink: 0,
                  }}
                />
                <SafeHtml html={themeItem} sx={{ lineHeight: 1.6 }} />
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default AboutProject;
