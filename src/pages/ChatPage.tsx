/**
 * Main `/chat` page: a dedicated, full-screen ORKG Atlas chat experience.
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────┬─────────────┐
 *   │ Conversations│  Chat (messages, input) │ ORKG preview│
 *   │  sidebar     │                         │  (iframe)   │
 *   └──────────────┴─────────────────────────┴─────────────┘
 *   ORKG / ORKG Ask links open in the preview panel (modifier-click → new tab).
 *
 * Streams responses from `/api/chat/stream`, persists every turn to Firestore
 * via the backend, and renders all tool outputs as inline cards / charts /
 * graphs / SPARQL runners.
 */

import {
  Box,
  Stack,
  IconButton,
  Tooltip,
  Typography,
  Button,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  TextField,
  Chip,
  Paper,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Add,
  Login,
  AutoAwesome,
  AutoStories,
  Hub,
  Code,
  Insights,
  EditOutlined,
  TipsAndUpdates,
  Lock,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { useAuthData } from '../auth/useAuthData';
import { conversationsApi, streamChat } from '../services/chatStreamClient';
import type {
  ChatMessage,
  ChatToolCall,
  Conversation,
  ChatAttachment,
} from '../types/chat';
import ConversationSidebar from '../components/Chat/ConversationSidebar';
import MessageView from '../components/Chat/MessageView';
import ChatComposer from '../components/Chat/ChatComposer';
import ChatPreviewPanel from '../components/Chat/ChatPreviewPanel';
import { ChatPreviewProvider } from '../context/ChatPreviewContext';
import AttachResourceDialog from '../components/Chat/AttachResourceDialog';
import ModelCompareDialog from '../components/Chat/ModelCompareDialog';
import {
  PROVIDER_LIST,
  PROVIDERS,
  resolveModelForProvider,
} from '../components/Chat/modelDefaults';
import type { AIProvider } from '../store/slices/aiSlice';

interface StarterPrompt {
  prompt: string;
  category:
    | 'Templates'
    | 'Papers'
    | 'SPARQL'
    | 'Stats'
    | 'Graphs'
    | 'Synthesis';
  icon: React.ReactNode;
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

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const ChatPage = () => {
  const params = useParams<{ shareToken?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    login,
  } = useAuthData();
  const aiConfig = useAppSelector((s) => s.ai);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(
    null
  );
  const [streamingToolCalls, setStreamingToolCalls] = useState<ChatToolCall[]>(
    []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [provider, setProvider] = useState<AIProvider>(
    (aiConfig.provider as AIProvider) || 'openrouter'
  );
  const initialModel = useMemo(
    () =>
      resolveModelForProvider(
        (aiConfig.provider as AIProvider) || 'openrouter',
        aiConfig.openrouterModel || undefined
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [model, setModel] = useState<string>(initialModel);
  const [attachOpen, setAttachOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [readonlyShared, setReadonlyShared] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Auto-scroll to bottom on new content ───────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingMessage, streamingToolCalls]);

  // ── Read-only shared conversation route ────────────────────────────────────
  useEffect(() => {
    if (params.shareToken) {
      setReadonlyShared(true);
      conversationsApi
        .getShared(params.shareToken)
        .then(({ conversation, messages: msgs }) => {
          setActiveConv(conversation);
          setMessages(msgs);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : String(err))
        );
    } else {
      setReadonlyShared(false);
    }
  }, [params.shareToken]);

  // ── Sync template/provider/model when conversation changes ─────────────────
  const loadConversation = useCallback(async (conv: Conversation) => {
    setError(null);
    setStreamingMessage(null);
    setStreamingToolCalls([]);
    try {
      const detail = await conversationsApi.get(conv.id);
      setActiveConv(detail.conversation);
      setMessages(detail.messages);
      if (detail.conversation.provider) {
        const p = detail.conversation.provider as AIProvider;
        setProvider(p);
        setModel(resolveModelForProvider(p, detail.conversation.model));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const startNewChat = useCallback(() => {
    setActiveConv(null);
    setMessages([]);
    setStreamingMessage(null);
    setStreamingToolCalls([]);
    setComposer('');
    setAttachments([]);
    setError(null);
    if (location.pathname !== '/chat') navigate('/chat');
  }, [navigate, location.pathname]);

  // When provider changes, snap the model to a sensible default for that provider.
  const onProviderChange = useCallback((next: AIProvider) => {
    setProvider(next);
    setModel((current) => resolveModelForProvider(next, current));
  }, []);

  // ── Send message + stream response ─────────────────────────────────────────
  const send = useCallback(async () => {
    if (!composer.trim() || isStreaming) return;
    const text = composer.trim();
    setComposer('');
    setError(null);

    const optimisticUser: ChatMessage = {
      id: `tmp_${Date.now()}`,
      conversationId: activeConv?.id ?? '',
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    const placeholder: ChatMessage = {
      id: `streaming_${Date.now()}`,
      conversationId: activeConv?.id ?? '',
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      provider,
      model,
    };
    setStreamingMessage(placeholder);
    setStreamingToolCalls([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const sentAttachments = attachments;
    setAttachments([]);

    const transcript: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }> = [
      ...messages.map((m) => ({
        role:
          m.role === 'tool'
            ? 'assistant'
            : (m.role as 'user' | 'assistant' | 'system'),
        content: m.content,
      })),
      { role: 'user', content: text },
    ];

    let liveText = '';
    let liveReasoning = '';

    try {
      await streamChat(
        {
          messages: transcript,
          conversationId: activeConv?.id,
          provider,
          model,
          attachments: sentAttachments,
          openRouterApiKey:
            provider === 'openrouter'
              ? aiConfig.openrouterApiKey || undefined
              : undefined,
        },
        {
          signal: controller.signal,
          onStart: (id) => {
            if (!activeConv) {
              setActiveConv({
                id,
                ownerId: user?.id ?? '',
                title: text.slice(0, 80),
                provider,
                model,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messageCount: 1,
              });
            }
            setRefreshKey((k) => k + 1);
          },
          onText: (delta) => {
            liveText += delta;
            setStreamingMessage((m) => (m ? { ...m, content: liveText } : m));
          },
          onReasoning: (delta) => {
            liveReasoning += delta;
            setStreamingMessage((m) =>
              m ? { ...m, reasoning: liveReasoning } : m
            );
          },
          onToolCall: ({ id, name, args }) => {
            const call: ChatToolCall = {
              id,
              name,
              arguments: args,
              status: 'pending',
              startedAt: Date.now(),
            };
            setStreamingToolCalls((calls) => [...calls, call]);
          },
          onToolResult: ({ id, result }) => {
            setStreamingToolCalls((calls) =>
              calls.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      result,
                      status: result.ok ? 'success' : 'error',
                      finishedAt: Date.now(),
                    }
                  : c
              )
            );
          },
          onComplete: (msg) => {
            setMessages((prev) => [...prev, msg]);
            setStreamingMessage(null);
            setStreamingToolCalls([]);
            setRefreshKey((k) => k + 1);
          },
          onError: (e) => setError(e),
          onEnd: () => {
            setIsStreaming(false);
            abortRef.current = null;
          },
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsStreaming(false);
      setStreamingMessage(null);
    }
  }, [
    composer,
    isStreaming,
    attachments,
    messages,
    activeConv,
    provider,
    model,
    aiConfig,
    user?.id,
  ]);

  const onStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    if (streamingMessage && streamingMessage.content) {
      setMessages((prev) => [...prev, { ...streamingMessage }]);
    }
    setStreamingMessage(null);
  };

  const onSaveTitle = async () => {
    if (!activeConv) return;
    const title = draftTitle.trim();
    if (!title || title === activeConv.title) {
      setTitleEditing(false);
      return;
    }
    try {
      const updated = await conversationsApi.update(activeConv.id, { title });
      setActiveConv(updated);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTitleEditing(false);
    }
  };

  // ── Derived UI state ───────────────────────────────────────────────────────
  const allMessages: ChatMessage[] = useMemo(() => {
    if (!streamingMessage) return messages;
    const trace = streamingToolCalls;
    return [
      ...messages,
      { ...streamingMessage, toolCalls: trace.length > 0 ? trace : undefined },
    ];
  }, [messages, streamingMessage, streamingToolCalls]);

  const providerInfo = PROVIDERS[provider];
  const providerModels = providerInfo?.models ?? [];

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ height: '70vh' }}
      >
        <CircularProgress />
      </Stack>
    );
  }

  if (!isAuthenticated && !readonlyShared) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ height: '80vh' }}
        spacing={3}
      >
        <Box
          sx={(theme) => ({
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            boxShadow: `0 12px 40px -12px ${alpha(theme.palette.primary.main, 0.6)}`,
          })}
        >
          <AutoAwesome sx={{ fontSize: 40, color: '#fff' }} />
        </Box>
        <Stack spacing={1} alignItems="center">
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            ORKG Atlas Chat
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 480, textAlign: 'center' }}
          >
            Sign in to start a conversation grounded in the Open Research
            Knowledge Graph. The assistant can search papers, run SPARQL, fetch
            templates, and draw inline graphs.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          size="large"
          startIcon={<Login />}
          onClick={() => login()}
          sx={(theme) => ({
            px: 3,
            py: 1.25,
            borderRadius: 3,
            textTransform: 'none',
            fontWeight: 600,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            boxShadow: `0 6px 20px -6px ${alpha(theme.palette.primary.main, 0.6)}`,
          })}
        >
          Sign in
        </Button>
      </Stack>
    );
  }

  return (
    <ChatPreviewProvider>
      <Box
        sx={(theme) => ({
          display: 'flex',
          height: 'calc(100vh - 64px)',
          minHeight: 500,
          background: isDark
            ? `radial-gradient(circle at 0% 0%, ${alpha(theme.palette.primary.main, 0.06)} 0%, transparent 40%), radial-gradient(circle at 100% 100%, ${alpha(theme.palette.primary.dark, 0.04)} 0%, transparent 40%), ${theme.palette.background.default}`
            : `radial-gradient(circle at 0% 0%, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 40%), radial-gradient(circle at 100% 100%, ${alpha(theme.palette.primary.dark, 0.03)} 0%, transparent 40%), ${theme.palette.background.default}`,
        })}
      >
        {!readonlyShared && (
          <ConversationSidebar
            activeId={activeConv?.id}
            onSelect={loadConversation}
            onNew={startNewChat}
            refreshKey={refreshKey}
          />
        )}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}
          >
            {/* Sticky header */}
            <Box
              sx={(theme) => ({
                position: 'sticky',
                top: 0,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                borderBottom: `1px solid ${theme.palette.divider}`,
                backgroundColor: alpha(theme.palette.background.paper, 0.7),
                backdropFilter: 'blur(14px)',
              })}
            >
              {/* Title block */}
              <Stack
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Box
                  sx={(theme) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    boxShadow: `0 2px 8px -2px ${alpha(theme.palette.primary.main, 0.5)}`,
                  })}
                >
                  <AutoAwesome sx={{ fontSize: 18, color: '#fff' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {titleEditing && activeConv ? (
                    <TextField
                      size="small"
                      value={draftTitle}
                      autoFocus
                      variant="standard"
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={onSaveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSaveTitle();
                        if (e.key === 'Escape') setTitleEditing(false);
                      }}
                      fullWidth
                      sx={{ '& input': { fontSize: '1rem', fontWeight: 600 } }}
                    />
                  ) : (
                    <Stack
                      direction="row"
                      spacing={0.75}
                      alignItems="center"
                      sx={{ minWidth: 0 }}
                    >
                      <Typography
                        variant="subtitle1"
                        noWrap
                        sx={{
                          fontWeight: 600,
                          cursor:
                            activeConv && !readonlyShared ? 'text' : 'default',
                          flex: '0 1 auto',
                          minWidth: 0,
                        }}
                        onClick={() => {
                          if (activeConv && !readonlyShared) {
                            setDraftTitle(activeConv.title);
                            setTitleEditing(true);
                          }
                        }}
                      >
                        {activeConv?.title ?? 'New conversation'}
                      </Typography>
                      {activeConv && !readonlyShared && (
                        <Tooltip title="Rename">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setDraftTitle(activeConv.title);
                              setTitleEditing(true);
                            }}
                            sx={{
                              p: 0.25,
                              opacity: 0.5,
                              '&:hover': { opacity: 1 },
                            }}
                          >
                            <EditOutlined sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {readonlyShared && (
                        <Chip
                          size="small"
                          icon={<Lock sx={{ fontSize: 12 }} />}
                          label="Read-only"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem', ml: 0.5 }}
                        />
                      )}
                    </Stack>
                  )}
                </Box>
              </Stack>

              {/* Pickers (hidden in read-only mode) */}
              {!readonlyShared && (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexShrink: 0 }}
                >
                  <Select
                    size="small"
                    value={provider}
                    onChange={(e) =>
                      onProviderChange(e.target.value as AIProvider)
                    }
                    disabled={isStreaming}
                    sx={{ minWidth: 130, height: 34, fontSize: '0.82rem' }}
                    renderValue={(v) => {
                      const info = PROVIDERS[v as AIProvider];
                      return (
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: info?.accent ?? '#888',
                            }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {info?.label ?? v}
                          </Typography>
                        </Stack>
                      );
                    }}
                  >
                    {PROVIDER_LIST.map((p) => (
                      <MenuItem
                        key={p.id}
                        value={p.id}
                        sx={{ fontSize: '0.85rem' }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: p.accent,
                            }}
                          />
                          {p.label}
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                  {provider === 'openrouter' ? (
                    <TextField
                      size="small"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="vendor/model"
                      disabled={isStreaming}
                      sx={{
                        width: { xs: 150, sm: 220 },
                        '& input': {
                          fontSize: '0.82rem',
                          fontFamily: 'monospace',
                          height: 18,
                        },
                        '& .MuiOutlinedInput-root': { height: 34 },
                      }}
                    />
                  ) : (
                    <Select
                      size="small"
                      value={
                        providerModels.includes(model)
                          ? model
                          : (providerInfo?.defaultModel ?? '')
                      }
                      onChange={(e) => setModel(e.target.value)}
                      disabled={isStreaming}
                      sx={{
                        minWidth: { xs: 150, sm: 220 },
                        height: 34,
                        fontSize: '0.82rem',
                        fontFamily: 'monospace',
                      }}
                    >
                      {providerModels.map((m) => (
                        <MenuItem
                          key={m}
                          value={m}
                          sx={{ fontSize: '0.82rem', fontFamily: 'monospace' }}
                        >
                          {m}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                  <Tooltip title="New chat">
                    <span>
                      <IconButton
                        onClick={startNewChat}
                        disabled={isStreaming}
                        sx={(theme) => ({
                          width: 34,
                          height: 34,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1.5,
                          '&:hover': {
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.08
                            ),
                            borderColor: alpha(theme.palette.primary.main, 0.5),
                          },
                        })}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              )}
            </Box>

            {/* Messages */}
            <Box
              ref={scrollRef}
              sx={{
                flex: 1,
                overflowY: 'auto',
                scrollBehavior: 'smooth',
              }}
            >
              {allMessages.length === 0 ? (
                <ChatHero onPick={(p) => setComposer(p)} />
              ) : (
                <Box
                  sx={{
                    maxWidth: 920,
                    mx: 'auto',
                    px: { xs: 1.5, sm: 3 },
                    pt: 3,
                    pb: 2,
                  }}
                >
                  {allMessages.map((m) => (
                    <MessageView
                      key={m.id}
                      message={m}
                      isStreaming={isStreaming && m.id === streamingMessage?.id}
                    />
                  ))}
                </Box>
              )}
              {error && (
                <Box sx={{ maxWidth: 920, mx: 'auto', px: 2, pb: 2 }}>
                  <Alert
                    severity="error"
                    onClose={() => setError(null)}
                    sx={{ borderRadius: 2 }}
                  >
                    {error}
                  </Alert>
                </Box>
              )}
            </Box>

            {/* Composer */}
            {!readonlyShared && (
              <ChatComposer
                value={composer}
                onChange={setComposer}
                onSend={send}
                onStop={onStop}
                isStreaming={isStreaming}
                attachments={attachments}
                onAttachClick={() => setAttachOpen(true)}
                onCompareClick={() => setCompareOpen(true)}
                onRemoveAttachment={(a) =>
                  setAttachments((prev) =>
                    prev.filter((p) => !(p.type === a.type && p.id === a.id))
                  )
                }
                suggestions={
                  allMessages.length === 0
                    ? STARTER_PROMPTS.map((s) => s.prompt)
                    : []
                }
              />
            )}

            <AttachResourceDialog
              open={attachOpen}
              onClose={() => setAttachOpen(false)}
              onAttach={(a) => {
                setAttachments((prev) =>
                  prev.some((p) => p.type === a.type && p.id === a.id)
                    ? prev
                    : [...prev, a]
                );
              }}
            />
            <ModelCompareDialog
              open={compareOpen}
              onClose={() => setCompareOpen(false)}
              messages={allMessages.map((m) => ({
                role:
                  m.role === 'tool'
                    ? 'assistant'
                    : (m.role as 'user' | 'assistant' | 'system'),
                content: m.content,
              }))}
              defaultProvider={provider}
              defaultModel={model}
              openrouterKey={aiConfig.openrouterApiKey || undefined}
            />
          </Box>
          <ChatPreviewPanel />
        </Box>
      </Box>
    </ChatPreviewProvider>
  );
};

interface ChatHeroProps {
  onPick: (p: string) => void;
}

const CATEGORY_COLORS: Record<StarterPrompt['category'], string> = {
  Templates: '#e86161',
  Papers: '#7c4dff',
  SPARQL: '#10a37f',
  Stats: '#f59e0b',
  Graphs: '#e86161',
  Synthesis: '#5b8def',
};

const ChatHero = ({ onPick }: ChatHeroProps) => (
  <Box
    sx={{
      maxWidth: 880,
      mx: 'auto',
      px: { xs: 2, sm: 3 },
      pt: { xs: 4, sm: 7 },
      pb: 3,
      animation: `${fadeInUp} 380ms ease-out`,
    }}
  >
    {/* Hero icon */}
    <Stack alignItems="center" spacing={2.5} sx={{ mb: 5 }}>
      <Box
        sx={(theme) => ({
          width: 72,
          height: 72,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          boxShadow: `0 16px 50px -12px ${alpha(theme.palette.primary.main, 0.5)}`,
        })}
      >
        <AutoAwesome sx={{ fontSize: 36, color: '#fff' }} />
      </Box>
      <Stack alignItems="center" spacing={1}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            textAlign: 'center',
            background: (t) =>
              `linear-gradient(135deg, ${t.palette.text.primary} 0%, ${alpha(
                t.palette.primary.main,
                0.85
              )} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          What do you want to explore today?
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ textAlign: 'center', maxWidth: 560 }}
        >
          The assistant can search papers, fetch templates, run SPARQL,
          summarise statements, and visualise the Open Research Knowledge Graph.
        </Typography>
        <Chip
          size="small"
          label="Explores all ORKG templates · picks the best match per question"
          variant="outlined"
          sx={{ mt: 0.5, fontSize: '0.72rem' }}
        />
      </Stack>
    </Stack>

    {/* Starter cards */}
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
      {STARTER_PROMPTS.map((sp) => {
        const accent = CATEGORY_COLORS[sp.category];
        return (
          <Paper
            key={sp.prompt}
            elevation={0}
            onClick={() => onPick(sp.prompt)}
            sx={(theme) => ({
              p: 2,
              cursor: 'pointer',
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              transition: 'all 200ms ease',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, ${alpha(accent, 0.06)} 0%, transparent 60%)`,
                opacity: 0,
                transition: 'opacity 200ms ease',
              },
              '&:hover': {
                transform: 'translateY(-2px)',
                borderColor: alpha(accent, 0.45),
                boxShadow: `0 12px 28px -12px ${alpha(accent, 0.4)}`,
                '&::before': { opacity: 1 },
              },
            })}
          >
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="flex-start"
              sx={{ position: 'relative' }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: alpha(accent, 0.12),
                  color: accent,
                }}
              >
                {sp.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: accent,
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
        );
      })}
    </Box>
  </Box>
);

export default ChatPage;
