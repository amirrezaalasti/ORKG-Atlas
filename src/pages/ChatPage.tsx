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
  Drawer,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add,
  Login,
  Home,
  Menu as MenuIcon,
  EditOutlined,
  Lock,
} from '@mui/icons-material';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Link as RouterLink,
  useParams,
  useNavigate,
  useLocation,
} from 'react-router-dom';
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
import ChatHero from '../components/Chat/ChatHero';
import { ChatPreviewProvider } from '../context/ChatPreviewContext';
import AttachResourceDialog from '../components/Chat/AttachResourceDialog';
import ModelCompareDialog from '../components/Chat/ModelCompareDialog';
import {
  PROVIDER_LIST,
  PROVIDERS,
  resolveModelForProvider,
} from '../components/Chat/modelDefaults';
import type { AIProvider } from '../store/slices/aiSlice';

const ChatPage = () => {
  const params = useParams<{ shareToken?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const sidebar = !readonlyShared ? (
    <ConversationSidebar
      activeId={activeConv?.id}
      onSelect={(conv) => {
        loadConversation(conv);
        setSidebarOpen(false);
      }}
      onNew={() => {
        startNewChat();
        setSidebarOpen(false);
      }}
      refreshKey={refreshKey}
    />
  ) : null;

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ flex: 1, minHeight: 360 }}
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
        sx={{ flex: 1, px: 2, py: 6 }}
        spacing={2.5}
      >
        <Typography
          variant="h3"
          sx={{
            color: 'primary.main',
            fontWeight: 700,
            fontSize: { xs: '1.75rem', sm: '2rem' },
          }}
        >
          AI Chat
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
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<Home />}
            component={RouterLink}
            to="/"
            sx={{ textTransform: 'none' }}
          >
            Back to home
          </Button>
          <Button
            variant="contained"
            startIcon={<Login />}
            onClick={() => login()}
            sx={{ textTransform: 'none' }}
          >
            Sign in
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <ChatPreviewProvider>
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          height: '100%',
          backgroundColor: 'background.default',
        }}
      >
        {isMdUp && sidebar}
        {!isMdUp && sidebar && (
          <Drawer
            anchor="left"
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            slotProps={{
              paper: {
                sx: { width: 288, backgroundColor: 'background.paper' },
              },
            }}
          >
            {sidebar}
          </Drawer>
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
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: { xs: 1.5, sm: 2 },
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
              }}
            >
              <Tooltip title="Back to home">
                <IconButton
                  component={RouterLink}
                  to="/"
                  size="small"
                  aria-label="Back to home"
                  sx={{ color: 'text.primary' }}
                >
                  <Home fontSize="small" />
                </IconButton>
              </Tooltip>
              {!isMdUp && !readonlyShared && (
                <Tooltip title="Conversations">
                  <IconButton
                    size="small"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open conversations"
                    sx={{ color: 'text.primary' }}
                  >
                    <MenuIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
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
                          sx={{ p: 0.25, color: 'text.secondary' }}
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
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    )}
                  </Stack>
                )}
              </Box>

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
                    sx={{
                      minWidth: { xs: 110, sm: 130 },
                      height: 34,
                      fontSize: '0.82rem',
                      display: { xs: 'none', sm: 'inline-flex' },
                    }}
                    renderValue={(v) => {
                      const info = PROVIDERS[v as AIProvider];
                      return (
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {info?.label ?? v}
                        </Typography>
                      );
                    }}
                  >
                    {PROVIDER_LIST.map((p) => (
                      <MenuItem
                        key={p.id}
                        value={p.id}
                        sx={{ fontSize: '0.85rem' }}
                      >
                        {p.label}
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
                        width: { xs: 140, sm: 220 },
                        display: { xs: 'none', md: 'block' },
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
                        minWidth: { xs: 140, sm: 220 },
                        height: 34,
                        fontSize: '0.82rem',
                        fontFamily: 'monospace',
                        display: { xs: 'none', md: 'inline-flex' },
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
                        sx={{
                          width: 34,
                          height: 34,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            borderColor: 'primary.main',
                          },
                        }}
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

export default ChatPage;
