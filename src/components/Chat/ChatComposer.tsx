/**
 * Chat message composer: auto-growing textarea, attachments, and send/stop.
 * Enter sends, Shift+Enter inserts a newline.
 */

import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Chip,
  Paper,
  Typography,
} from '@mui/material';
import { Send, Stop, AttachFile, CompareArrows } from '@mui/icons-material';
import { useEffect, useRef } from 'react';
import type { ChatAttachment } from '../../types/chat';

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  attachments: ChatAttachment[];
  onAttachClick: () => void;
  onCompareClick: () => void;
  onRemoveAttachment: (a: ChatAttachment) => void;
  suggestions?: string[];
  disabled?: boolean;
}

const KbdHint = ({ children }: { children: React.ReactNode }) => (
  <Box
    component="kbd"
    sx={{
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
      fontSize: '0.7rem',
      px: 0.6,
      py: 0.1,
      borderRadius: 0.5,
      border: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'action.hover',
      color: 'text.secondary',
      lineHeight: 1.4,
    }}
  >
    {children}
  </Box>
);

const ChatComposer = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  attachments,
  onAttachClick,
  onCompareClick,
  onRemoveAttachment,
  suggestions = [],
  disabled,
}: ChatComposerProps) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const canSend = !disabled && !isStreaming && value.trim().length > 0;
  const send = () => {
    if (canSend) onSend();
  };

  const charCount = value.length;
  const showCharCount = charCount > 200;

  return (
    <Box
      sx={{
        px: { xs: 1.5, sm: 2.5 },
        pt: 1.5,
        pb: 1.5,
        borderTop: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      {suggestions.length > 0 && !value && (
        <Stack
          direction="row"
          spacing={0.75}
          flexWrap="wrap"
          sx={{ mb: 1.5, maxWidth: 880, mx: 'auto' }}
        >
          {suggestions.slice(0, 4).map((s) => (
            <Chip
              key={s}
              size="small"
              variant="outlined"
              label={s.length > 64 ? `${s.slice(0, 60)}…` : s}
              clickable
              onClick={() => onChange(s)}
              sx={{ mb: 0.75, fontSize: '0.78rem' }}
            />
          ))}
        </Stack>
      )}

      {attachments.length > 0 && (
        <Stack
          direction="row"
          spacing={0.5}
          flexWrap="wrap"
          sx={{ mb: 1, maxWidth: 880, mx: 'auto' }}
        >
          {attachments.map((a) => (
            <Chip
              key={`${a.type}-${a.id}`}
              size="small"
              label={`${a.type.replace('orkg-', '')} · ${a.label || a.id}`}
              onDelete={() => onRemoveAttachment(a)}
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          ))}
        </Stack>
      )}

      <Paper
        elevation={0}
        sx={{
          maxWidth: 880,
          mx: 'auto',
          p: 1,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.default',
          '&:focus-within': {
            borderColor: 'primary.main',
          },
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="flex-end">
          <Stack direction="row" spacing={0} alignItems="center">
            <Tooltip title="Attach ORKG resource">
              <span>
                <IconButton
                  onClick={onAttachClick}
                  disabled={disabled || isStreaming}
                  size="small"
                  sx={{ color: 'text.secondary' }}
                >
                  <AttachFile fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Compare two models side-by-side">
              <span>
                <IconButton
                  onClick={onCompareClick}
                  disabled={disabled || isStreaming}
                  size="small"
                  sx={{ color: 'text.secondary' }}
                >
                  <CompareArrows fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Box sx={{ flex: 1, minWidth: 0, py: 0.5 }}>
            <Box
              component="textarea"
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ask about templates, papers, statements, comparisons…"
              disabled={disabled}
              rows={Math.min(8, Math.max(1, value.split('\n').length))}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  (e.metaKey || e.ctrlKey || !e.shiftKey)
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              sx={(theme) => ({
                width: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: theme.typography.body1.fontFamily,
                fontSize: '0.95rem',
                lineHeight: 1.55,
                color: theme.palette.text.primary,
                py: 0.75,
                px: 0.5,
                minHeight: 28,
                maxHeight: 200,
                overflowY: 'auto',
                '&::placeholder': {
                  color: theme.palette.text.disabled,
                },
                '&:disabled': {
                  cursor: 'not-allowed',
                  opacity: 0.6,
                },
              })}
            />
          </Box>

          {isStreaming ? (
            <Tooltip title="Stop generating">
              <span>
                <IconButton
                  onClick={onStop}
                  disabled={!onStop}
                  color="error"
                  sx={{ width: 36, height: 36 }}
                >
                  <Stop fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              title={canSend ? 'Send (Enter)' : 'Type something to send'}
            >
              <span>
                <IconButton
                  onClick={send}
                  disabled={!canSend}
                  color="primary"
                  sx={{
                    width: 36,
                    height: 36,
                    backgroundColor: canSend ? 'primary.main' : 'action.hover',
                    color: canSend ? 'primary.contrastText' : 'text.disabled',
                    '&:hover': {
                      backgroundColor: canSend
                        ? 'primary.dark'
                        : 'action.hover',
                    },
                    '&.Mui-disabled': {
                      color: 'text.disabled',
                    },
                  }}
                >
                  <Send sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Paper>

      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        justifyContent="center"
        sx={{ mt: 0.75, maxWidth: 880, mx: 'auto', flexWrap: 'wrap' }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center">
          <KbdHint>Enter</KbdHint>
          <Typography variant="caption" color="text.secondary">
            send
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <KbdHint>Shift</KbdHint>
          <KbdHint>Enter</KbdHint>
          <Typography variant="caption" color="text.secondary">
            new line
          </Typography>
        </Stack>
        {showCharCount && (
          <Typography
            variant="caption"
            sx={{
              color: charCount > 4000 ? 'error.main' : 'text.disabled',
              fontFamily: 'monospace',
            }}
          >
            {charCount.toLocaleString()} chars
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

export default ChatComposer;
