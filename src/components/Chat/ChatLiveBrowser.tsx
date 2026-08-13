/**
 * Live ORKG browser via backend Playwright (Browser Use–style side panel).
 * Renders screencast frames; clicks are forwarded to the headless session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  ArrowForward,
  Refresh,
  PlayArrow,
} from '@mui/icons-material';
import { browserApi, type BrowserFrame } from '../../services/chatStreamClient';

interface ChatLiveBrowserProps {
  url: string;
  onTitleChange?: (title: string) => void;
}

const ChatLiveBrowser = ({ url, onTitleChange }: ChatLiveBrowserProps) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [address, setAddress] = useState(url);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const applyFrame = useCallback(
    (f: BrowserFrame) => {
      setFrame(f);
      setAddress(f.url);
      onTitleChange?.(f.title || f.url);
    },
    [onTitleChange]
  );

  const startSession = useCallback(
    async (targetUrl: string) => {
      setLoading(true);
      setError(null);
      try {
        const f = await browserApi.createSession(targetUrl);
        setSessionId(f.sessionId);
        applyFrame(f);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [applyFrame]
  );

  useEffect(() => {
    void startSession(url);
    return () => {
      const id = sessionIdRef.current;
      if (id) void browserApi.closeSession(id).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new session per mount URL
  }, [url]);

  const withSession = async (
    fn: (id: string) => Promise<BrowserFrame>
  ): Promise<void> => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      applyFrame(await fn(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const onNavigate = () => {
    if (!sessionId) {
      void startSession(address);
      return;
    }
    void withSession((id) => browserApi.navigate(id, address));
  };

  const onRefresh = () => {
    if (!sessionId) return;
    void withSession((id) => browserApi.getFrame(id));
  };

  const onImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId || !frame || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * frame.viewport.width;
    const y = ((e.clientY - rect.top) / rect.height) * frame.viewport.height;
    void withSession((id) => browserApi.click(id, x, y));
  };

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tooltip title="Back">
          <span>
            <IconButton
              size="small"
              disabled={!sessionId || loading}
              onClick={() => void withSession((id) => browserApi.back(id))}
            >
              <ArrowBack fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Forward">
          <span>
            <IconButton
              size="small"
              disabled={!sessionId || loading}
              onClick={() => void withSession((id) => browserApi.forward(id))}
            >
              <ArrowForward fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small"
              disabled={!sessionId || loading}
              onClick={onRefresh}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          size="small"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onNavigate();
          }}
          placeholder="https://orkg.org/…"
          fullWidth
          sx={{
            '& input': { fontSize: '0.8rem', py: 0.75 },
          }}
        />
        <Tooltip title="Go">
          <IconButton
            size="small"
            color="primary"
            onClick={onNavigate}
            disabled={loading}
          >
            <PlayArrow fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ m: 1, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          bgcolor: 'action.hover',
          overflow: 'auto',
        }}
      >
        {loading && !frame && (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{ position: 'absolute', inset: 0, zIndex: 1 }}
          >
            <CircularProgress size={28} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Starting browser…
            </Typography>
          </Stack>
        )}
        {frame && (
          <Box
            component="img"
            ref={imgRef}
            src={`data:image/jpeg;base64,${frame.screenshot}`}
            alt={frame.title}
            onClick={onImageClick}
            sx={{
              width: '100%',
              height: 'auto',
              display: 'block',
              cursor: 'crosshair',
              opacity: loading ? 0.65 : 1,
              transition: 'opacity 0.15s',
            }}
          />
        )}
        {loading && frame && (
          <CircularProgress
            size={22}
            sx={{ position: 'absolute', top: 12, right: 12 }}
          />
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider' }}
      >
        Click the page to interact · Requires ENABLE_LIVE_BROWSER on the backend
      </Typography>
    </Stack>
  );
};

export default ChatLiveBrowser;
