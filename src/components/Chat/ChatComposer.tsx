/**
 * Modern, floating chat composer.
 *
 * - Auto-grows up to 8 rows.
 * - Enter sends, Shift+Enter inserts a newline.
 * - Cmd/Ctrl + Enter also sends (works in any focus state).
 * - Live attachment chips, inline char counter, and kbd hint footer.
 * - Send button gradient + disabled state styling.
 */

import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Chip,
  Paper,
  alpha,
  Typography,
} from '@mui/material';
import {
  Send,
  Stop,
  AttachFile,
  CompareArrows,
  ArrowUpward,
} from '@mui/icons-material';
import { useEffect, useRef } from 'react';
import { keyframes } from '@mui/system';
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
    sx={(theme) => ({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
      fontSize: '0.7rem',
      px: 0.6,
      py: 0.1,
      borderRadius: 0.6,
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: alpha(theme.palette.text.primary, 0.04),
      color: 'text.secondary',
      lineHeight: 1.4,
    })}
  >
    {children}
  </Box>
);

const sendPulse = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(1.06); }
  100% { transform: scale(1); }
`;

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
      sx={(theme) => ({
        background: `linear-gradient(180deg, ${alpha(theme.palette.background.default, 0)} 0%, ${
          theme.palette.background.default
        } 35%)`,
        px: { xs: 1.5, sm: 2.5 },
        pt: 2,
        pb: 1.5,
      })}
    >
      {/* Suggestion chips */}
      {suggestions.length > 0 && !value && (
        <Stack
          direction="row"
          spacing={0.75}
          flexWrap="wrap"
          sx={{ mb: 1.5, maxWidth: 880, mx: 'auto', justifyContent: 'center' }}
        >
          {suggestions.slice(0, 4).map((s) => (
            <Chip
              key={s}
              size="small"
              label={s.length > 64 ? `${s.slice(0, 60)}…` : s}
              clickable
              onClick={() => onChange(s)}
              sx={(theme) => ({
                mb: 0.75,
                fontSize: '0.78rem',
                borderRadius: 999,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
                color: 'text.primary',
                transition: 'all 180ms ease',
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  borderColor: alpha(theme.palette.primary.main, 0.4),
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 12px -4px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
              })}
            />
          ))}
        </Stack>
      )}

      {/* Attachment chips above textarea */}
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
              sx={(theme) => ({
                height: 24,
                fontSize: '0.75rem',
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                color: 'text.primary',
              })}
            />
          ))}
        </Stack>
      )}

      <Paper
        elevation={0}
        sx={(theme) => ({
          maxWidth: 880,
          mx: 'auto',
          p: 1,
          borderRadius: 4,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          boxShadow:
            theme.palette.mode === 'dark'
              ? `0 8px 32px -8px ${alpha('#000', 0.6)}`
              : `0 8px 32px -8px ${alpha(theme.palette.primary.main, 0.18)}`,
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
          '&:focus-within': {
            borderColor: alpha(theme.palette.primary.main, 0.6),
            boxShadow:
              theme.palette.mode === 'dark'
                ? `0 8px 32px -8px ${alpha('#000', 0.7)}, 0 0 0 4px ${alpha(
                    theme.palette.primary.main,
                    0.1
                  )}`
                : `0 8px 32px -8px ${alpha(theme.palette.primary.main, 0.25)}, 0 0 0 4px ${alpha(
                    theme.palette.primary.main,
                    0.08
                  )}`,
          },
        })}
      >
        <Stack direction="row" spacing={0.5} alignItems="flex-end">
          <Stack
            direction="row"
            spacing={0}
            alignItems="center"
            sx={{ pl: 0.25 }}
          >
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
                fontSize: '0.96rem',
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

          {/* Send / Stop */}
          {isStreaming ? (
            <Tooltip title="Stop generating">
              <span>
                <IconButton
                  onClick={onStop}
                  disabled={!onStop}
                  sx={(theme) => ({
                    width: 36,
                    height: 36,
                    backgroundColor: alpha(theme.palette.error.main, 0.1),
                    color: theme.palette.error.main,
                    border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.error.main, 0.2),
                    },
                  })}
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
                  sx={(theme) => ({
                    width: 36,
                    height: 36,
                    background: canSend
                      ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
                      : alpha(theme.palette.text.primary, 0.08),
                    color: canSend ? '#fff' : theme.palette.text.disabled,
                    boxShadow: canSend
                      ? `0 4px 12px -2px ${alpha(theme.palette.primary.main, 0.55)}`
                      : 'none',
                    transition: 'all 180ms ease',
                    '&:hover': {
                      animation: canSend ? `${sendPulse} 600ms ease` : 'none',
                      filter: canSend ? 'brightness(1.05)' : undefined,
                    },
                    '&.Mui-disabled': {
                      color: theme.palette.text.disabled,
                    },
                  })}
                >
                  {canSend ? (
                    <ArrowUpward sx={{ fontSize: 20 }} />
                  ) : (
                    <Send sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Paper>

      {/* Footer hints */}
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
          <>
            <Box sx={{ flex: 1 }} />
            <Typography
              variant="caption"
              sx={{
                color: charCount > 4000 ? 'error.main' : 'text.disabled',
                fontFamily: 'monospace',
              }}
            >
              {charCount.toLocaleString()} chars
            </Typography>
          </>
        )}
      </Stack>
    </Box>
  );
};

export default ChatComposer;
