import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { browserApi } from '../services/chatStreamClient';
import {
  canOpenInChatPreview,
  normalizePreviewUrl,
  previewTitleFromUrl,
} from '../utils/chatPreview';

export type ChatPreviewMode = 'live' | 'summary';

export interface ChatPreviewState {
  url: string;
  title?: string;
}

interface ChatPreviewContextValue {
  preview: ChatPreviewState | null;
  isOpen: boolean;
  previewMode: ChatPreviewMode;
  setPreviewMode: (mode: ChatPreviewMode) => void;
  liveBrowserAvailable: boolean;
  openPreview: (url: string, title?: string) => void;
  closePreview: () => void;
  updatePreviewTitle: (title: string) => void;
  tryOpenPreviewFromClick: (
    e: React.MouseEvent,
    url: string,
    title?: string
  ) => boolean;
}

const ChatPreviewContext = createContext<ChatPreviewContextValue | null>(null);

export function ChatPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ChatPreviewState | null>(null);
  const [previewMode, setPreviewMode] = useState<ChatPreviewMode>('summary');
  const [liveBrowserAvailable, setLiveBrowserAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    browserApi
      .status()
      .then((s) => {
        if (!cancelled) setLiveBrowserAvailable(s.available);
      })
      .catch(() => {
        if (!cancelled) setLiveBrowserAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPreview = useCallback(
    (url: string, title?: string) => {
      const normalized = normalizePreviewUrl(url);
      if (!canOpenInChatPreview(normalized)) {
        window.open(normalized, '_blank', 'noopener,noreferrer');
        return;
      }
      setPreview({
        url: normalized,
        title: title?.trim() || previewTitleFromUrl(normalized),
      });
      setPreviewMode(liveBrowserAvailable ? 'live' : 'summary');
    },
    [liveBrowserAvailable]
  );

  const closePreview = useCallback(() => setPreview(null), []);

  const updatePreviewTitle = useCallback((title: string) => {
    setPreview((p) => (p ? { ...p, title } : p));
  }, []);

  const tryOpenPreviewFromClick = useCallback(
    (e: React.MouseEvent, url: string, title?: string) => {
      if (e.defaultPrevented) return false;
      if (e.button !== 0) return false;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      const normalized = normalizePreviewUrl(url);
      if (!canOpenInChatPreview(normalized)) return false;
      e.preventDefault();
      openPreview(normalized, title);
      return true;
    },
    [openPreview]
  );

  const value = useMemo(
    () => ({
      preview,
      isOpen: preview != null,
      previewMode,
      setPreviewMode,
      liveBrowserAvailable,
      openPreview,
      closePreview,
      updatePreviewTitle,
      tryOpenPreviewFromClick,
    }),
    [
      preview,
      previewMode,
      liveBrowserAvailable,
      openPreview,
      closePreview,
      updatePreviewTitle,
      tryOpenPreviewFromClick,
    ]
  );

  return (
    <ChatPreviewContext.Provider value={value}>
      {children}
    </ChatPreviewContext.Provider>
  );
}

export function useChatPreview(): ChatPreviewContextValue {
  const ctx = useContext(ChatPreviewContext);
  if (!ctx) {
    throw new Error('useChatPreview must be used within ChatPreviewProvider');
  }
  return ctx;
}

/** Safe when used outside chat (e.g. stories) — returns no-op handlers. */
export function useChatPreviewOptional(): ChatPreviewContextValue {
  const ctx = useContext(ChatPreviewContext);
  return useMemo(
    () =>
      ctx ?? {
        preview: null,
        isOpen: false,
        previewMode: 'summary' as ChatPreviewMode,
        setPreviewMode: () => undefined,
        liveBrowserAvailable: false,
        openPreview: (url) => {
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        closePreview: () => undefined,
        updatePreviewTitle: () => undefined,
        tryOpenPreviewFromClick: () => false,
      },
    [ctx]
  );
}
