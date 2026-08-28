/**
 * Empty-state for a new conversation: page heading plus starter prompts.
 * Visual language matches other Atlas pages (coral heading + outlined cards).
 */

import {
  AutoStories,
  Code,
  Hub,
  Insights,
  TipsAndUpdates,
} from '@mui/icons-material';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface StarterPrompt {
  prompt: string;
  category:
    | 'Templates'
    | 'Papers'
    | 'SPARQL'
    | 'Stats'
    | 'Graphs'
    | 'Synthesis';
  icon: ReactNode;
}

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    prompt:
      'Summarize what template R186491 represents and its main predicates.',
    category: 'Templates',
    icon: <AutoStories sx={{ fontSize: 18 }} />,
  },
  {
    prompt:
      'Find papers in ORKG about "requirements engineering empirical study".',
    category: 'Papers',
    icon: <AutoStories sx={{ fontSize: 18 }} />,
  },
  {
    prompt: 'Show statements bundle for paper R186492 as an interactive graph.',
    category: 'Graphs',
    icon: <Hub sx={{ fontSize: 18 }} />,
  },
  {
    prompt:
      'Run a SPARQL query that lists all papers contributing to template R1544125.',
    category: 'SPARQL',
    icon: <Code sx={{ fontSize: 18 }} />,
  },
  {
    prompt:
      'Show Atlas template statistics for R186491 and chart the contribution counts.',
    category: 'Stats',
    icon: <Insights sx={{ fontSize: 18 }} />,
  },
  {
    prompt:
      'Compare two ORKG comparisons about NLP4RE and synthesise findings.',
    category: 'Synthesis',
    icon: <TipsAndUpdates sx={{ fontSize: 18 }} />,
  },
];

interface ChatHeroProps {
  onPick: (prompt: string) => void;
}

const ChatHero = ({ onPick }: ChatHeroProps) => (
  <Box
    sx={{
      maxWidth: 880,
      mx: 'auto',
      px: { xs: 2, sm: 3 },
      pt: { xs: 3, sm: 5 },
      pb: 3,
    }}
  >
    <Box sx={{ mb: 4 }}>
      <Typography
        variant="h3"
        sx={{
          color: 'primary.main',
          fontWeight: 700,
          fontSize: { xs: '1.75rem', sm: '2rem' },
          lineHeight: 1.3,
          position: 'relative',
          display: 'inline-block',
          mb: 2,
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: -8,
            left: 0,
            width: '100%',
            height: '4px',
            backgroundColor: 'primary.main',
            borderRadius: '2px',
          },
        }}
      >
        AI Chat
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2.5 }}>
        Ask about papers, templates, SPARQL, statements, and graphs in the Open
        Research Knowledge Graph. The assistant picks the best matching template
        for each question.
      </Typography>
    </Box>

    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, 1fr)',
          md: 'repeat(3, 1fr)',
        },
        gap: 1.5,
      }}
    >
      {STARTER_PROMPTS.map((sp) => (
        <Paper
          key={sp.prompt}
          elevation={0}
          onClick={() => onPick(sp.prompt)}
          sx={{
            p: 2,
            cursor: 'pointer',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
            '&:hover': {
              borderColor: 'primary.main',
              backgroundColor: 'action.hover',
            },
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="flex-start">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: 'rgba(232, 97, 97, 0.08)',
                color: 'primary.main',
              }}
            >
              {sp.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'primary.main',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.65rem',
                }}
              >
                {sp.category}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.25,
                  color: 'text.primary',
                  fontWeight: 500,
                  lineHeight: 1.45,
                }}
              >
                {sp.prompt}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      ))}
    </Box>
  </Box>
);

export default ChatHero;
