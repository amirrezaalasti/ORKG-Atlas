import { Box, Typography } from '@mui/material';
import { ReactElement } from 'react';
import { useReducedMotion } from 'motion/react';
import { fadeUp, hoverLift, MotionPaper } from '../constants/motion';

interface StatCardProps {
  children: ReactElement;
  value?: number;
  label: string;
  link?: string;
}

export default function StatCard({
  children,
  value,
  label,
  link,
}: StatCardProps): ReactElement {
  const reduceMotion = useReducedMotion();

  const handleClick = () => {
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <MotionPaper
      elevation={3}
      variants={fadeUp}
      whileHover={link && !reduceMotion ? hoverLift : undefined}
      sx={{
        p: 3,
        borderRadius: 4,
        width: { xs: '100%', sm: 168, md: 184 },
        maxWidth: 240,
        textAlign: 'center',
        backgroundColor: '#ffffff',
        color: '#c0392b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: { xs: 168, sm: 'auto' },
        boxSizing: 'border-box',
        cursor: link ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      <Box
        sx={{
          backgroundColor: '#f5f6fa',
          borderRadius: '50%',
          p: 2,
          mb: 2,
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
        }}
      >
        {children}
      </Box>

      {value !== undefined && (
        <Typography variant="h6" fontWeight={700}>
          {value.toLocaleString()}
        </Typography>
      )}
      <Typography
        variant="subtitle2"
        fontWeight={600}
        color="text.primary"
        sx={{ mt: 1 }}
      >
        {label}
      </Typography>
    </MotionPaper>
  );
}
