/**
 * Attach an ORKG resource (paper / resource / comparison / template) to the
 * next user message. The dialog supports two input modes:
 *
 *  - Direct ID: paste an ID like R186491 / P12 / C1 (we infer type by prefix
 *    or the user's selection).
 *  - Search: type a query and pick from the inline search results.
 *
 * The resolved attachment is sent to the parent via `onAttach`.
 */

import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Typography,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { useState } from 'react';
import { mcpApi } from '../../services/chatStreamClient';
import type { ChatAttachment, ToolResultEnvelope } from '../../types/chat';

type AttachKind =
  | 'orkg-resource'
  | 'orkg-paper'
  | 'orkg-comparison'
  | 'orkg-template';

interface SearchItem {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAttach: (a: ChatAttachment) => void;
}

const AttachResourceDialog = ({ open, onClose, onAttach }: Props) => {
  const [kind, setKind] = useState<AttachKind>('orkg-paper');
  const [mode, setMode] = useState<'id' | 'search'>('search');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);

  const reset = () => {
    setText('');
    setResults([]);
    setError(null);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const search = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      let envelope: ToolResultEnvelope;
      if (kind === 'orkg-paper') {
        envelope = await mcpApi.callTool('orkg_search_papers', {
          title: text.trim(),
          size: 15,
        });
      } else if (kind === 'orkg-comparison') {
        envelope = await mcpApi.callTool('orkg_search_comparisons', {
          title: text.trim(),
          size: 15,
        });
      } else if (kind === 'orkg-template') {
        envelope = await mcpApi.callTool('orkg_search_templates', {
          query: text.trim(),
          size: 15,
        });
      } else {
        envelope = await mcpApi.callTool('orkg_search_resources', {
          query: text.trim(),
          size: 15,
        });
      }
      if (!envelope.ok) {
        setError(envelope.error);
        return;
      }
      const data = envelope.data as {
        items?: Array<{ id: string; label?: string; title?: string }>;
      };
      const items: SearchItem[] = (data.items || []).map((r) => ({
        id: r.id,
        label: r.title ?? r.label ?? r.id,
      }));
      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const attachById = () => {
    const id = text.trim();
    if (!id) return;
    onAttach({ type: kind, id, label: id });
    close();
  };

  const attachItem = (item: SearchItem) => {
    onAttach({ type: kind, id: item.id, label: item.label });
    close();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>Attach an ORKG resource</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={kind}
            onChange={(_, v: AttachKind | null) => v && setKind(v)}
          >
            <ToggleButton value="orkg-paper">Paper</ToggleButton>
            <ToggleButton value="orkg-resource">Resource</ToggleButton>
            <ToggleButton value="orkg-comparison">Comparison</ToggleButton>
            <ToggleButton value="orkg-template">Template</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, v: 'id' | 'search' | null) => v && setMode(v)}
          >
            <ToggleButton value="search">Search</ToggleButton>
            <ToggleButton value="id">By ID</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            autoFocus
            fullWidth
            label={mode === 'id' ? 'ID (e.g. R186491)' : 'Search query'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (mode === 'id') attachById();
                else search();
              }
            }}
          />
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          {mode === 'search' && (
            <>
              <Stack direction="row" spacing={1}>
                <Button
                  onClick={search}
                  variant="outlined"
                  disabled={loading || !text.trim()}
                >
                  {loading ? <CircularProgress size={16} /> : 'Search'}
                </Button>
              </Stack>
              {results.length > 0 && (
                <List
                  dense
                  sx={{
                    maxHeight: 320,
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  {results.map((r) => (
                    <ListItemButton key={r.id} onClick={() => attachItem(r)}>
                      <ListItemText primary={r.label} secondary={r.id} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        {mode === 'id' && (
          <Button
            onClick={attachById}
            variant="contained"
            disabled={!text.trim()}
          >
            Attach
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AttachResourceDialog;
