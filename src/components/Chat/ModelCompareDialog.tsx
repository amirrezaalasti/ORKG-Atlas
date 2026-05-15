/**
 * Side-by-side dual-model comparison.
 *
 * Sends the current chat messages to two backend providers in parallel via
 * `/api/chat/compare` and renders the answers side by side. No tool-calling,
 * no persistence — purely an exploratory UX for picking the best model for a
 * task.
 */

import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  MenuItem,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useState } from 'react';
import { compareApi } from '../../services/chatStreamClient';
import ChatMarkdown from './ChatMarkdown';
import type { AIProvider } from '../../store/slices/aiSlice';

interface Props {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  templateId?: string;
  defaultProvider?: AIProvider;
  defaultModel?: string;
  openrouterKey?: string;
}

interface Pair {
  provider: AIProvider;
  model: string;
}

const PRESETS: Pair[] = [
  { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  { provider: 'mistral', model: 'mistral-large-latest' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
];

const ModelCompareDialog = ({
  open,
  onClose,
  messages,
  templateId,
  openrouterKey,
}: Props) => {
  const [a, setA] = useState<Pair>(PRESETS[0]);
  const [b, setB] = useState<Pair>(PRESETS[1]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<null | Array<
    | { ok: true; provider: AIProvider; model?: string; text: string }
    | { ok: false; provider: AIProvider; model?: string; error: string }
  >>(null);

  const run = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { results: list } = await compareApi.run({
        messages,
        templateId,
        providers: [
          {
            ...a,
            openrouterKey:
              a.provider === 'openrouter' ? openrouterKey : undefined,
          },
          {
            ...b,
            openrouterKey:
              b.provider === 'openrouter' ? openrouterKey : undefined,
          },
        ],
      });
      setResults(list);
    } catch (err) {
      setResults([
        {
          ok: false,
          provider: a.provider,
          model: a.model,
          error: err instanceof Error ? err.message : String(err),
        },
        { ok: false, provider: b.provider, model: b.model, error: 'see above' },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Compare models</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {[
            { label: 'A', pair: a, set: setA },
            { label: 'B', pair: b, set: setB },
          ].map(({ label, pair, set }) => (
            <Stack key={label} spacing={1} sx={{ flex: 1 }}>
              <Typography variant="subtitle2">{label}</Typography>
              <TextField
                label="Provider"
                value={pair.provider}
                onChange={(e) =>
                  set({ ...pair, provider: e.target.value as AIProvider })
                }
                select
                size="small"
              >
                <MenuItem value="openrouter">OpenRouter</MenuItem>
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="groq">Groq</MenuItem>
                <MenuItem value="mistral">Mistral</MenuItem>
                <MenuItem value="google">Google</MenuItem>
              </TextField>
              <TextField
                label="Model"
                value={pair.model}
                onChange={(e) => set({ ...pair, model: e.target.value })}
                size="small"
              />
            </Stack>
          ))}
        </Stack>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={run}
            disabled={running || messages.length === 0}
          >
            {running ? <CircularProgress size={16} /> : 'Run comparison'}
          </Button>
        </Box>
        {results && (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ mt: 2 }}
          >
            {results.map((r, idx) => (
              <Box
                key={idx}
                sx={{
                  flex: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  minWidth: 0,
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  {r.provider} · {r.model || '(default)'}
                </Typography>
                {r.ok ? (
                  <ChatMarkdown text={r.text} />
                ) : (
                  <Typography color="error">{r.error}</Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelCompareDialog;
