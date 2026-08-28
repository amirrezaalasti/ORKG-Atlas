import { Box, useTheme } from '@mui/material';
import { plateSx } from './atlasTokens';
import SectionHeading from './SectionHeading';

const IntroVideo = () => {
  const theme = useTheme();
  const embedUrl = `https://av.tib.eu/player/72249`;

  return (
    <Box sx={plateSx(theme.palette.mode)}>
      <SectionHeading eyebrow="Demonstration" title="Watch the atlas" />
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          paddingTop: '56.25%',
          borderRadius: 1,
          overflow: 'hidden',
          border: '1px solid',
          borderColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(58,83,102,0.14)',
        }}
      >
        <Box
          component="iframe"
          src={embedUrl}
          title="ORKG Atlas tool demonstration"
          allow="autoplay; encrypted-media"
          allowFullScreen
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      </Box>
    </Box>
  );
};

export default IntroVideo;
