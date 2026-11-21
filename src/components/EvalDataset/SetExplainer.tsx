import { Box, Typography } from '@mui/material';
import { explainKind, explainSet } from './glossary';

interface SetExplainerProps {
  setId: string;
  fallback: string | undefined;
  tags: string[];
}

export function SetExplainer({ setId, fallback, tags }: SetExplainerProps) {
  const text = explainSet(setId) || fallback;
  const explained = tags.filter((tag) => explainKind(tag));

  return (
    <Box sx={{ maxWidth: 820 }}>
      {text && <Typography variant="body1">{text}</Typography>}
      {explained.length > 0 && (
        <Box
          sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}
        >
          {explained.map((tag) => (
            <Typography key={tag} variant="body2" color="text.secondary">
              <Box
                component="span"
                sx={{ fontWeight: 700, color: 'text.primary' }}
              >
                {tag}.{' '}
              </Box>
              {explainKind(tag)}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
