import { useMemo, useState, useEffect, useDeferredValue } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  InputAdornment,
  Stack,
  Divider,
  Tooltip,
  CircularProgress,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedIcon from '@mui/icons-material/Verified';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import type { Template } from '../firestore/CRUDHomeContent';
import {
  checkOrkgTemplatesReachable,
  getOrkgApiBase,
} from '../services/orkgTemplatesApi';
import { getBuiltinTemplateConfig } from '../constants/template_config';
import { toast } from 'react-hot-toast';

export type TemplateCatalogSource = 'orkg' | 'home_content' | 'default';

interface TemplatePickerDialogProps {
  open: boolean;
  onClose: () => void;
  items: Template[];
  selectedId: string;
  onConfirm: (templateId: string) => void;
  catalogSource: TemplateCatalogSource;
  /** From ORKG list API pagination total (when catalog was loaded from ORKG). */
  orkgApiTotalElements: number | null;
}

function sourceLabel(src: TemplateCatalogSource): string {
  switch (src) {
    case 'orkg':
      return 'ORKG live catalog';
    case 'home_content':
      return 'Home content list';
    default:
      return 'Default bundled list';
  }
}

export default function TemplatePickerDialog({
  open,
  onClose,
  items,
  selectedId,
  onConfirm,
  catalogSource,
  orkgApiTotalElements,
}: TemplatePickerDialogProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    status?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setVerifyResult(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!deferredQuery) return items;

    const q = deferredQuery;
    const idMatch = q.replace(/\s+/g, '');
    return items.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const id = (t.id || '').toLowerCase();
      return title.includes(q) || id.includes(q) || id.includes(idMatch);
    });
  }, [items, deferredQuery]);

  const highlightId = /^R\d+$/.test(selectedId) ? selectedId : null;

  const handleVerifyOrkg = async () => {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const r = await checkOrkgTemplatesReachable();
      setVerifyResult(r);
      if (r.ok) {
        toast.success(
          `ORKG responded in ${r.latencyMs ?? '—'} ms (HTTP ${r.status ?? '200'})`
        );
      } else {
        toast.error(
          `ORKG unreachable${r.status != null ? ` (${r.status})` : ''} — ${r.latencyMs ?? '?'} ms`
        );
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const endpoint = `${getOrkgApiBase()}/templates`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            maxHeight: 'min(90vh, 640px)',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          pr: 1,
        }}
      >
        <Box>
          <Typography variant="h6" component="span" fontWeight={700}>
            Template
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, maxWidth: 520 }}
          >
            Search the list by title or ORKG id. Curated ORKG Atlas themes are
            marked; all other entries follow the public ORKG template catalog.
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          py: 1.5,
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          <Chip
            size="small"
            color={catalogSource === 'orkg' ? 'success' : 'warning'}
            variant="outlined"
            label={sourceLabel(catalogSource)}
          />
          {catalogSource === 'orkg' &&
            typeof orkgApiTotalElements === 'number' && (
              <Typography variant="caption" color="text.secondary">
                API reports {orkgApiTotalElements.toLocaleString()} templates ·
                loaded {items.length.toLocaleString()}
              </Typography>
            )}
          {catalogSource !== 'orkg' && (
            <Typography variant="caption" color="text.secondary">
              ORKG listing failed — using a shorter local list ({items.length})
            </Typography>
          )}
          <Tooltip title={endpoint}>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                verifyLoading ? (
                  <CircularProgress size={14} thickness={6} />
                ) : (
                  <WifiTetheringIcon sx={{ fontSize: 18 }} />
                )
              }
              disabled={verifyLoading}
              onClick={handleVerifyOrkg}
              sx={{
                ml: { sm: 'auto' },
                borderColor:
                  verifyResult?.ok === true ? 'success.main' : undefined,
              }}
            >
              Check ORKG API
            </Button>
          </Tooltip>
          {verifyResult && (
            <Chip
              size="small"
              icon={
                verifyResult.ok ? (
                  <VerifiedIcon sx={{ fontSize: 18 }} />
                ) : undefined
              }
              color={verifyResult.ok ? 'success' : 'error'}
              label={
                verifyResult.ok
                  ? `${verifyResult.latencyMs ?? '—'} ms`
                  : `Failed${verifyResult.status != null ? ` · ${verifyResult.status}` : ''}`
              }
            />
          )}
        </Stack>

        <TextField
          size="small"
          fullWidth
          placeholder="Search by name or id (e.g. R186491, empirical)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="caption" color="text.secondary">
            {filtered.length.toLocaleString()} match
            {filtered.length === 1 ? '' : 'es'}
            {items.length > 0 && deferredQuery
              ? ` · of ${items.length.toLocaleString()}`
              : ''}
          </Typography>
          <Button
            size="small"
            href="https://orkg.org/templates"
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none' }}
          >
            Browse on orkg.org
          </Button>
        </Stack>

        <Divider />

        <List
          dense
          sx={{
            flex: 1,
            minHeight: 240,
            maxHeight: { xs: 360, sm: 400 },
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            py: 0,
          }}
        >
          {filtered.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" variant="body2">
                No templates match your search.
              </Typography>
            </Box>
          ) : (
            filtered.map((t) => {
              const curated = !!getBuiltinTemplateConfig(t.id);
              const active = t.id === highlightId;
              return (
                <ListItemButton
                  key={t.id}
                  selected={active}
                  onClick={() => onConfirm(t.id)}
                  alignItems="flex-start"
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 'none' },
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(232, 97, 97, 0.12)',
                      borderLeft: '3px solid #039be5',
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          component="span"
                          variant="body2"
                          fontWeight={active ? 600 : 500}
                        >
                          {t.title || t.id}
                        </Typography>
                        {curated && (
                          <Chip
                            label="Curated"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: 'rgba(232, 97, 97, 0.12)',
                              color: '#c94a4a',
                            }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {t.id}
                      </Typography>
                    }
                  />
                </ListItemButton>
              );
            })
          )}
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
