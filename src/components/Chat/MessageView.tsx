/**
 * Renders a single chat message.
 *
 * - User messages: right-aligned bubble with attachments.
 * - Assistant messages: left-aligned card containing the tool-call trace, all
 *   tool result cards, the markdown content, and an optional reasoning collapse.
 *   While streaming, an animated "thinking" pulse is shown until tokens arrive.
 */

import { useState } from 'react';
import {
  Avatar,
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
  ContentCopy,
  ExpandLess,
  ExpandMore,
  Person,
  AutoAwesome,
  Psychology,
} from '@mui/icons-material';
import ChatMarkdown from './ChatMarkdown';
import ToolCallTrace from './ToolCallTrace';
import ToolResultRenderer from './ToolResultRenderer';
import type { ChatMessage, ChatToolCall } from '../../types/chat';

interface MessageViewProps {
  message: ChatMessage;
  /** When true, hide controls that don't make sense for the streaming-in-flight bubble. */
  isStreaming?: boolean;
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0);   }
`;

const blink = keyframes`
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-2px); }
`;

const ThinkingDots = () => (
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ pl: 0.5 }}>
    {[0, 1, 2].map((i) => (
      <Box
        key={i}
        sx={(theme) => ({
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: theme.palette.primary.main,
          animation: `${blink} 1.2s infinite`,
          animationDelay: `${i * 0.18}s`,
        })}
      />
    ))}
    <Typography variant="caption" sx={{ ml: 0.75, color: 'text.secondary' }}>
      Thinking…
    </Typography>
  </Stack>
);

const MessageView = ({ message, isStreaming }: MessageViewProps) => {
  const [showReasoning, setShowReasoning] = useState(false);

  if (message.role === 'user') {
    return (
      <Stack
        direction="row"
        spacing={1.25}
        alignItems="flex-start"
        justifyContent="flex-end"
        sx={{ mb: 2.5, animation: `${fadeIn} 200ms ease-out` }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            maxWidth: { xs: '90%', sm: '78%' },
          }}
        >
          <Box
            sx={(theme) => ({
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: theme.palette.primary.contrastText,
              px: 2,
              py: 1.25,
              borderRadius: 2.5,
              borderTopRightRadius: 4,
              boxShadow: `0 4px 14px -4px ${alpha(theme.palette.primary.main, 0.5)}`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.95rem',
              lineHeight: 1.55,
            })}
          >
            {message.content}
          </Box>
          {message.attachments && message.attachments.length > 0 && (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ mt: 0.75 }}
              flexWrap="wrap"
            >
              {message.attachments.map((a) => (
                <Chip
                  key={`${a.type}-${a.id}`}
                  size="small"
                  label={`${a.type.replace('orkg-', '')} · ${a.label || a.id}`}
                  sx={{ height: 22, fontSize: '0.72rem' }}
                />
              ))}
            </Stack>
          )}
        </Box>
        <Avatar
          sx={(theme) => ({
            width: 32,
            height: 32,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            boxShadow: `0 2px 8px -2px ${alpha(theme.palette.primary.main, 0.5)}`,
          })}
        >
          <Person sx={{ fontSize: 18 }} />
        </Avatar>
      </Stack>
    );
  }

  const calls = message.toolCalls ?? [];
  const successfulResults = calls
    .filter(
      (
        c
      ): c is ChatToolCall & { result: NonNullable<ChatToolCall['result']> } =>
        !!c.result
    )
    .map((c) => ({ id: c.id, name: c.name, result: c.result }));
  const showThinking =
    isStreaming && !message.content && !message.reasoning && calls.length === 0;

  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="flex-start"
      sx={{ mb: 2.5, animation: `${fadeIn} 220ms ease-out` }}
    >
      <Avatar
        sx={(theme) => ({
          width: 32,
          height: 32,
          background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.dark} 100%)`,
          boxShadow: `0 2px 8px -2px ${alpha(theme.palette.secondary.main, 0.5)}`,
        })}
      >
        <AutoAwesome sx={{ fontSize: 18 }} />
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {showThinking && (
          <Box
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.5,
              py: 1,
              borderRadius: 2,
              borderTopLeftRadius: 4,
              backgroundColor: alpha(theme.palette.primary.main, 0.06),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              mb: 1,
            })}
          >
            <ThinkingDots />
          </Box>
        )}
        {calls.length > 0 && (
          <ToolCallTrace calls={calls} collapsedByDefault={!!message.content} />
        )}
        {successfulResults.length > 0 && (
          <Stack spacing={0}>
            {successfulResults.map((r) => (
              <ToolResultRenderer
                key={r.id}
                result={r.result}
                toolName={r.name}
              />
            ))}
          </Stack>
        )}
        {message.content ? (
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2.5,
              borderTopLeftRadius: 4,
              p: 2,
              backgroundColor: theme.palette.background.paper,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? `0 1px 3px ${alpha('#000', 0.4)}`
                  : `0 1px 3px ${alpha('#000', 0.04)}`,
              '& a': {
                color: theme.palette.primary.main,
                textDecorationThickness: '1px',
                textUnderlineOffset: 2,
              },
              '& code': {
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
                fontSize: '0.86em',
                px: 0.5,
                py: 0.125,
                borderRadius: 0.75,
                backgroundColor: alpha(theme.palette.text.primary, 0.06),
              },
              '& pre': {
                backgroundColor: alpha(theme.palette.text.primary, 0.05),
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1.5,
                p: 1.25,
                fontSize: '0.85rem',
                overflow: 'auto',
              },
            })}
          >
            <ChatMarkdown text={message.content} />
            {message.reasoning && (
              <Box sx={{ mt: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    icon={<Psychology sx={{ fontSize: 14 }} />}
                    label="Reasoning"
                    variant="outlined"
                    onClick={() => setShowReasoning((v) => !v)}
                    sx={{ cursor: 'pointer', height: 22 }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => setShowReasoning((v) => !v)}
                  >
                    {showReasoning ? (
                      <ExpandLess fontSize="small" />
                    ) : (
                      <ExpandMore fontSize="small" />
                    )}
                  </IconButton>
                </Stack>
                <Collapse in={showReasoning}>
                  <Box
                    sx={(theme) => ({
                      mt: 1,
                      p: 1.5,
                      backgroundColor: alpha(theme.palette.text.primary, 0.04),
                      borderLeft: `3px solid ${theme.palette.primary.main}`,
                      borderRadius: '0 8px 8px 0',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 320,
                      overflow: 'auto',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                    })}
                  >
                    {message.reasoning}
                  </Box>
                </Collapse>
              </Box>
            )}
            {!isStreaming && (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mt: 1.5,
                  pt: 1.25,
                  borderTop: '1px dashed',
                  borderColor: 'divider',
                }}
                alignItems="center"
              >
                {message.model && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {message.provider} · {message.model}
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Copy answer">
                  <IconButton
                    size="small"
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(message.content)
                        .catch(() => undefined)
                    }
                    sx={{ p: 0.25 }}
                  >
                    <ContentCopy sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Box>
        ) : null}
      </Box>
    </Stack>
  );
};

export default MessageView;
