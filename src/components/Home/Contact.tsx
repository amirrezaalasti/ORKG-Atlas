import { Box, Link, Typography, useTheme } from '@mui/material';
import { ContactContent } from '../../firestore/CRUDHomeContent';
import SectionHeading from './SectionHeading';
import { ATLAS_DISPLAY_FONT, plateSx } from './atlasTokens';

interface ContactProps {
  content: ContactContent;
}

const Contact = ({ content }: ContactProps) => {
  const theme = useTheme();

  return (
    <Box sx={plateSx(theme.palette.mode)}>
      <SectionHeading eyebrow="Colophon" title={content.title} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
          gap: { xs: 2, sm: 4 },
          alignItems: 'start',
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: 'primary.main',
            position: 'relative',
            '&:before': {
              content: '""',
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            },
          }}
        />
        <Box>
          <Typography
            sx={{
              fontFamily: ATLAS_DISPLAY_FONT,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontSize: '1.35rem',
              mb: 0.75,
            }}
          >
            {content.name}
          </Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
            {content.position}
            <br />
            {content.organization}
            <br />
            {content.address.join(', ')}
          </Typography>
          <Link
            href={`mailto:${content.email}`}
            underline="hover"
            sx={{
              display: 'inline-block',
              mt: 1.5,
              color: 'primary.main',
              fontWeight: 600,
            }}
          >
            {content.email}
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Contact;
