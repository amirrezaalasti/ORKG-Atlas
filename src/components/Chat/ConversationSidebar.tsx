/**
 * Conversation sidebar with search, date-grouped sections, and contextual
 * actions (rename / delete / share). Designed to feel quiet on first read but
 * give plenty of affordance on hover.
 */

import {
  Box,
  Button,
  IconButton,
  ListItem,
  Menu,
  MenuItem,
  Stack,
  Typography,
  Tooltip,
  CircularProgress,
  InputBase,
} from '@mui/material';
import {
  Add,
  MoreVert,
  Edit,
  Delete,
  Share,
  ContentCopy,
  Search,
  ChatBubbleOutline,
  Close,
} from '@mui/icons-material';
import { useEffect, useMemo, useState } from 'react';
import { conversationsApi } from '../../services/chatStreamClient';
import type { Conversation } from '../../types/chat';

interface ConversationSidebarProps {
  activeId?: string;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  refreshKey?: number;
}

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const groupKey = (ts: number): string => {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  const dayMs = 86_400_000;
  if (day === today) return 'Today';
  if (day === today - dayMs) return 'Yesterday';
  if (today - day < 7 * dayMs) return 'This week';
  if (today - day < 30 * dayMs) return 'This month';
  return 'Older';
};

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];

const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const ConversationSidebar = ({
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: ConversationSidebarProps) => {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuConv, setMenuConv] = useState<Conversation | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { items: list } = await conversationsApi.list();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const onRename = async (conv: Conversation) => {
    const name = window.prompt('New title', conv.title);
    if (!name) return;
    await conversationsApi.update(conv.id, { title: name });
    await load();
  };

  const onDelete = async (conv: Conversation) => {
    if (!window.confirm(`Delete "${conv.title}"?`)) return;
    await conversationsApi.remove(conv.id);
    await load();
    if (conv.id === activeId) onNew();
  };

  const onShare = async (conv: Conversation) => {
    const enable = !conv.shareToken;
    const result = await conversationsApi.share(conv.id, enable);
    await load();
    if (result.shareToken) {
      const url = `${window.location.origin}/chat/share/${result.shareToken}`;
      try {
        await navigator.clipboard.writeText(url);
        window.alert(`Share link copied:\n${url}`);
      } catch {
        window.prompt('Share link', url);
      }
    } else {
      window.alert('Sharing disabled.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.templateId && c.templateId.toLowerCase().includes(q))
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const out = new Map<string, Conversation[]>();
    for (const c of filtered) {
      const k = groupKey(c.updatedAt);
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(c);
    }
    return GROUP_ORDER.filter((k) => out.has(k)).map((k) => ({
      label: k,
      items: out.get(k)!,
    }));
  }, [filtered]);

  return (
    <Box
      sx={{
        width: { xs: '100%', md: 288 },
        flexShrink: 0,
        height: '100%',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
      }}
    >
      {/* Header: New chat + search */}
      <Stack spacing={1} sx={{ p: 1.5, pb: 1 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<Add />}
          onClick={onNew}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
          }}
        >
          New chat
        </Button>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.25,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.default',
            '&:focus-within': {
              borderColor: 'primary.main',
            },
          }}
        >
          <Search sx={{ fontSize: 16, color: 'text.disabled' }} />
          <InputBase
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              flex: 1,
              fontSize: '0.85rem',
              py: 0.6,
              '& input': { p: 0 },
            }}
          />
          {search && (
            <IconButton
              size="small"
              onClick={() => setSearch('')}
              sx={{ p: 0.25 }}
            >
              <Close sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
        {loading && items.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack
            alignItems="center"
            spacing={1.25}
            sx={{ py: 5, px: 2, textAlign: 'center' }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(232, 97, 97, 0.08)',
                color: 'primary.main',
              }}
            >
              <ChatBubbleOutline />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {search ? 'No matches' : 'No conversations yet'}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ maxWidth: 200 }}
            >
              {search
                ? 'Try a different search term.'
                : 'Start a new chat to ask the assistant about ORKG papers, templates, and graphs.'}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {grouped.map((group) => (
              <Box key={group.label}>
                <Typography
                  variant="caption"
                  sx={{
                    pl: 1.25,
                    pb: 0.5,
                    display: 'block',
                    color: 'text.disabled',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontWeight: 700,
                    fontSize: '0.66rem',
                  }}
                >
                  {group.label}
                </Typography>
                <Stack spacing={0.25}>
                  {group.items.map((c) => {
                    const isActive = c.id === activeId;
                    return (
                      <ListItem
                        key={c.id}
                        disablePadding
                        sx={{
                          position: 'relative',
                          borderRadius: 2,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          backgroundColor: isActive
                            ? 'rgba(232, 97, 97, 0.08)'
                            : 'transparent',
                          '&:hover': {
                            backgroundColor: isActive
                              ? 'rgba(232, 97, 97, 0.12)'
                              : 'action.hover',
                            '& .conv-actions': { opacity: 1 },
                          },
                        }}
                        onClick={() => onSelect(c)}
                      >
                        {isActive && (
                          <Box
                            sx={{
                              position: 'absolute',
                              left: 0,
                              top: 8,
                              bottom: 8,
                              width: 3,
                              borderRadius: '0 4px 4px 0',
                              backgroundColor: 'primary.main',
                            }}
                          />
                        )}
                        <Box
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            px: 1.25,
                            py: 1,
                            pl: 1.5,
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.75}
                          >
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{
                                flex: 1,
                                fontWeight: isActive ? 600 : 500,
                                fontSize: '0.86rem',
                                color: isActive
                                  ? 'primary.main'
                                  : 'text.primary',
                              }}
                            >
                              {c.title}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.disabled',
                                fontSize: '0.7rem',
                                flexShrink: 0,
                              }}
                            >
                              {formatRelative(c.updatedAt)}
                            </Typography>
                          </Stack>
                          <Stack
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                            sx={{ mt: 0.25 }}
                          >
                            {c.templateId && (
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: '0.68rem',
                                  fontFamily: 'monospace',
                                  color: 'text.disabled',
                                }}
                              >
                                {c.templateId}
                              </Typography>
                            )}
                            {c.shareToken && (
                              <Tooltip title="Shared">
                                <Share
                                  sx={{ fontSize: 12, color: 'text.disabled' }}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        </Box>
                        <Box
                          className="conv-actions"
                          sx={{
                            opacity: 0,
                            transition: 'opacity 160ms ease',
                            pr: 0.5,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuAnchor(e.currentTarget);
                              setMenuConv(c);
                            }}
                            sx={{ p: 0.4 }}
                          >
                            <MoreVert sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Box>
                      </ListItem>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuConv(null);
        }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem
          onClick={() => {
            if (menuConv) onRename(menuConv);
            setMenuAnchor(null);
          }}
        >
          <Edit fontSize="small" sx={{ mr: 1.25 }} /> Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuConv) onShare(menuConv);
            setMenuAnchor(null);
          }}
        >
          {menuConv?.shareToken ? (
            <>
              <ContentCopy fontSize="small" sx={{ mr: 1.25 }} /> Copy / disable
              share
            </>
          ) : (
            <>
              <Share fontSize="small" sx={{ mr: 1.25 }} /> Share read-only
            </>
          )}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuConv) onDelete(menuConv);
            setMenuAnchor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <Delete fontSize="small" sx={{ mr: 1.25 }} /> Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default ConversationSidebar;
