import { Box, Typography } from '@mui/material';

interface SectionHeadingProps {
  id?: string;
  eyebrow: string;
  title: string;
  align?: 'left' | 'center';
}

const SectionHeading = ({
  id,
  eyebrow,
  title,
  align = 'left',
}: SectionHeadingProps) => {
  return (
    <Box
      id={id}
      sx={{
        mb: { xs: 2.5, md: 3.5 },
        textAlign: align,
        scrollMarginTop: 96,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          letterSpacing: '0.22em',
          color: 'primary.main',
          fontWeight: 700,
          fontSize: '0.68rem',
          display: 'block',
        }}
      >
        {eyebrow}
      </Typography>
      <Typography
        component="h2"
        sx={{
          fontWeight: 800,
          letterSpacing: '-0.03em',
          mt: 0.5,
          fontSize: { xs: '1.65rem', sm: '1.9rem', md: '2.15rem' },
          lineHeight: 1.15,
          color: 'text.primary',
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

export default SectionHeading;
