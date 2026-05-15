/**
 * Vertical timeline visualisation of the tool calls the assistant is making.
 *
 * Each entry shows the tool name, arguments (JSON, collapsible), and current
 * status (pending → success / error) along with a subtle connector line and
 * an animated pulse on whichever step is currently in flight.
 */

import { useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Typography,
  Tooltip,
  alpha,
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  CheckCircleOutline,
  ErrorOutline,
  ExpandLess,
  ExpandMore,
  ContentCopy,
  Build,
} from '@mui/icons-material';
import type { ChatToolCall } from '../../types/chat';

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(3, 155, 229, 0.55); }
  70%  { box-shadow: 0 0 0 12px rgba(3, 155, 229, 0); }
  100% { box-shadow: 0 0 0 0 rgba(3, 155, 229, 0); }
`;

const formatDuration = (call: ChatToolCall): string | null => {
  if (call.startedAt && call.finishedAt) {
    const ms = call.finishedAt - call.startedAt;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return null;
};

type Status = 'pending' | 'success' | 'error';

const statusFor = (call: ChatToolCall): Status => {
  if (call.status === 'error' || (call.result && !call.result.ok))
    return 'error';
  if (call.status === 'success' || (call.result && call.result.ok))
    return 'success';
  return 'pending';
};

const ToolCallEntry = ({
  call,
  isLast,
}: {
  call: ChatToolCall;
  isLast: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const status = statusFor(call);
  const duration = formatDuration(call);
  const argsJson = JSON.stringify(call.arguments ?? {}, null, 2);
  const color =
    status === 'error'
      ? 'error.main'
      : status === 'pending'
        ? 'primary.main'
        : 'success.main';

  return (
    <Box sx={{ display: 'flex', gap: 1.5, position: 'relative' }}>
      {/* Timeline column */}
      <Box
        sx={{
          width: 28,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 0.25,
        }}
      >
        <Box
          sx={(theme) => ({
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: alpha(
              theme.palette[
                status === 'pending'
                  ? 'primary'
                  : status === 'error'
                    ? 'error'
                    : 'success'
              ].main,
              theme.palette.mode === 'dark' ? 0.2 : 0.12
            ),
            color,
            border: `1.5px solid ${
              theme.palette[
                status === 'pending'
                  ? 'primary'
                  : status === 'error'
                    ? 'error'
                    : 'success'
              ].main
            }`,
            animation: status === 'pending' ? `${pulse} 1.6s infinite` : 'none',
            transition: 'background-color 200ms ease, border-color 200ms ease',
          })}
        >
          {status === 'pending' ? (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'primary.main',
              }}
            />
          ) : status === 'error' ? (
            <ErrorOutline sx={{ fontSize: 14 }} />
          ) : (
            <CheckCircleOutline sx={{ fontSize: 14 }} />
          )}
        </Box>
        {!isLast && (
          <Box
            sx={(theme) => ({
              flex: 1,
              width: 2,
              mt: 0.25,
              backgroundColor: alpha(theme.palette.divider, 1),
              minHeight: 16,
            })}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 1.25 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, fontFamily: 'monospace', color }}
          >
            {call.name}
          </Typography>
          {duration && (
            <Chip
              size="small"
              label={duration}
              sx={{
                height: 18,
                fontSize: '0.7rem',
                fontWeight: 500,
                bgcolor: 'action.hover',
              }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Copy args">
            <IconButton
              size="small"
              onClick={() =>
                navigator.clipboard?.writeText(argsJson).catch(() => undefined)
              }
              sx={{ p: 0.25 }}
            >
              <ContentCopy sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={() => setOpen((v) => !v)}
            sx={{ p: 0.25 }}
          >
            {open ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </IconButton>
        </Stack>
        <Collapse in={open}>
          <Box
            component="pre"
            sx={(theme) => ({
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
              border: `1px solid ${theme.palette.divider}`,
              p: 1.25,
              borderRadius: 1.5,
              overflow: 'auto',
              fontSize: '0.72rem',
              lineHeight: 1.5,
              maxHeight: 240,
              m: 0,
              mt: 0.75,
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
            })}
          >
            {argsJson}
          </Box>
          {call.result && !call.result.ok && (
            <Typography
              variant="caption"
              color="error"
              sx={{ mt: 0.75, display: 'block', fontFamily: 'monospace' }}
            >
              {call.result.error}
            </Typography>
          )}
        </Collapse>
      </Box>
    </Box>
  );
};

interface ToolCallTraceProps {
  calls: ChatToolCall[];
  /** Hide the trace block when the assistant has produced text and the user can see cards. */
  collapsedByDefault?: boolean;
}

const ToolCallTrace = ({ calls, collapsedByDefault }: ToolCallTraceProps) => {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (calls.length === 0) return null;
  const okCount = calls.filter((c) => statusFor(c) === 'success').length;
  const errorCount = calls.filter((c) => statusFor(c) === 'error').length;
  const pendingCount = calls.filter((c) => statusFor(c) === 'pending').length;

  return (
    <Box
      sx={(theme) => ({
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        p: 1.5,
        mb: 1.5,
        background:
          theme.palette.mode === 'dark'
            ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(
                theme.palette.background.paper,
                0.6
              )} 100%)`
            : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.025)} 0%, ${
                theme.palette.background.paper
              } 100%)`,
        backdropFilter: 'blur(6px)',
      })}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Build sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography
          variant="caption"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 700,
            color: 'text.secondary',
          }}
        >
          Tool calls
        </Typography>
        <Chip
          size="small"
          label={calls.length}
          sx={{ height: 18, fontSize: '0.7rem', minWidth: 24 }}
        />
        {pendingCount > 0 && (
          <Chip
            size="small"
            color="primary"
            label={`${pendingCount} running`}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.7rem' }}
          />
        )}
        {okCount > 0 && (
          <Chip
            size="small"
            color="success"
            label={`${okCount} ok`}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.7rem' }}
          />
        )}
        {errorCount > 0 && (
          <Chip
            size="small"
            color="error"
            label={`${errorCount} error`}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.7rem' }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" sx={{ p: 0.25 }}>
          {open ? (
            <ExpandLess fontSize="small" />
          ) : (
            <ExpandMore fontSize="small" />
          )}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>
          {calls.map((c, i) => (
            <ToolCallEntry
              key={c.id}
              call={c}
              isLast={i === calls.length - 1}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

export default ToolCallTrace;
