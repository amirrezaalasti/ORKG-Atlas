/**
 * Streaming chat client.
 *
 * Speaks the SSE protocol implemented by `backend/src/routes/chat.ts`.
 * `streamChat` returns a callback-based interface so the chat page can wire
 * tokens and tool events directly into local React state without buffering.
 *
 * Conversations CRUD lives next to streaming so callers only import one file.
 */

import { getKeycloakToken as getKeycloakTokenFromStore } from '../auth/keycloakStore';
import { guestHeaders } from '../auth/guestIdentity';
import { AUTH_DISABLED } from '../auth/publicAccess';
import type {
  ChatMessage,
  ChatStreamEvent,
  Conversation,
  ToolDescriptor,
  ToolResultEnvelope,
} from '../types/chat';
import type { AIProvider } from '../store/slices/aiSlice';

const getBackendUrl = (): string => {
  const isVercel =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('.vercel.app') ||
      window.location.hostname.includes('.vercel'));
  if (isVercel) {
    return (
      import.meta.env.VITE_BACKEND_FEATURE_URL ||
      import.meta.env.VITE_BACKEND_URL ||
      'https://empirecompassbackend.vercel.app'
    );
  }
  return (
    import.meta.env.VITE_BACKEND_URL ||
    'https://empirecompassbackend.vercel.app'
  );
};

const BACKEND_URL = getBackendUrl();

const authHeaders = (): Record<string, string> => {
  const token = getKeycloakTokenFromStore();
  if (token) return { Authorization: `Bearer ${token}` };
  // Anonymous visitor: identify the browser so conversations stay separate.
  return AUTH_DISABLED ? guestHeaders() : {};
};

export interface StreamChatInput {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  conversationId?: string;
  templateId?: string;
  provider?: AIProvider;
  model?: string;
  systemContext?: string;
  attachments?: ChatMessage['attachments'];
  openRouterApiKey?: string;
}

export interface StreamChatHandlers {
  onStart?: (conversationId: string) => void;
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onToolCall?: (call: { id: string; name: string; args: unknown }) => void;
  onToolResult?: (result: { id: string; result: ToolResultEnvelope }) => void;
  onComplete?: (message: ChatMessage) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  signal?: AbortSignal;
}

/**
 * POST to `/api/chat/stream`, parse the SSE protocol, and dispatch events.
 *
 * Returns a Promise that resolves when the stream ends (normally or with
 * `error`). Pass `signal` to allow user-initiated cancellation.
 */
export async function streamChat(
  input: StreamChatInput,
  handlers: StreamChatHandlers
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...authHeaders(),
  };
  if (input.provider === 'openrouter' && input.openRouterApiKey) {
    headers['x-openrouter-api-key'] = input.openRouterApiKey;
  }

  const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: input.messages,
      conversationId: input.conversationId,
      templateId: input.templateId,
      provider: input.provider,
      model: input.model,
      systemContext: input.systemContext,
      attachments: input.attachments,
    }),
    signal: handlers.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    handlers.onError?.(text || `HTTP ${response.status}`);
    handlers.onEnd?.();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('data:')) return;
    const json = trimmed.slice(5).trim();
    if (!json) return;
    let evt: ChatStreamEvent;
    try {
      evt = JSON.parse(json) as ChatStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case 'start':
        handlers.onStart?.(evt.conversationId);
        break;
      case 'text':
        handlers.onText?.(evt.value);
        break;
      case 'reasoning':
        handlers.onReasoning?.(evt.value);
        break;
      case 'tool_call':
        handlers.onToolCall?.({ id: evt.id, name: evt.name, args: evt.args });
        break;
      case 'tool_result':
        handlers.onToolResult?.({ id: evt.id, result: evt.result });
        break;
      case 'message_complete':
        handlers.onComplete?.(evt.message);
        break;
      case 'error':
        handlers.onError?.(evt.error);
        break;
      case 'end':
        handlers.onEnd?.();
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        chunk.split('\n').forEach(dispatch);
      }
    }
    if (buffer.trim().length > 0) buffer.split('\n').forEach(dispatch);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      handlers.onError?.(err instanceof Error ? err.message : String(err));
    }
    handlers.onEnd?.();
  }
}

const apiJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
};

export const conversationsApi = {
  list: () => apiJson<{ items: Conversation[] }>('/api/conversations'),
  get: (id: string) =>
    apiJson<{ conversation: Conversation; messages: ChatMessage[] }>(
      `/api/conversations/${id}`
    ),
  getShared: (token: string) =>
    apiJson<{
      conversation: Conversation;
      messages: ChatMessage[];
      readonly: true;
    }>(`/api/conversations/share/${token}`),
  create: (body: {
    title?: string;
    templateId?: string;
    provider?: string;
    model?: string;
  }) =>
    apiJson<Conversation>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    patch: Partial<
      Pick<Conversation, 'title' | 'templateId' | 'provider' | 'model'>
    >
  ) =>
    apiJson<Conversation>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    apiJson<void>(`/api/conversations/${id}`, { method: 'DELETE' }),
  share: (id: string, enable: boolean) =>
    apiJson<{ shareToken: string | null; enabled: boolean }>(
      `/api/conversations/${id}/share`,
      { method: 'POST', body: JSON.stringify({ enable }) }
    ),
};

export interface BrowserFrame {
  sessionId: string;
  url: string;
  title: string;
  screenshot: string;
  viewport: { width: number; height: number };
}

export const browserApi = {
  status: () =>
    apiJson<{
      configured: boolean;
      available: boolean;
      hint: string;
    }>('/api/browser/status'),
  createSession: (url: string) =>
    apiJson<BrowserFrame>('/api/browser/sessions', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  getFrame: (sessionId: string) =>
    apiJson<BrowserFrame>(`/api/browser/sessions/${sessionId}`),
  navigate: (sessionId: string, url: string) =>
    apiJson<BrowserFrame>(`/api/browser/sessions/${sessionId}/navigate`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  click: (sessionId: string, x: number, y: number) =>
    apiJson<BrowserFrame>(`/api/browser/sessions/${sessionId}/click`, {
      method: 'POST',
      body: JSON.stringify({ x, y }),
    }),
  back: (sessionId: string) =>
    apiJson<BrowserFrame>(`/api/browser/sessions/${sessionId}/back`, {
      method: 'POST',
    }),
  forward: (sessionId: string) =>
    apiJson<BrowserFrame>(`/api/browser/sessions/${sessionId}/forward`, {
      method: 'POST',
    }),
  closeSession: (sessionId: string) =>
    apiJson<void>(`/api/browser/sessions/${sessionId}`, { method: 'DELETE' }),
};

export const mcpApi = {
  listTools: () =>
    apiJson<{ protocol: string; tools: ToolDescriptor[] }>(
      '/api/mcp/tools/list'
    ),
  callTool: (name: string, args: unknown, conversationId?: string) =>
    apiJson<ToolResultEnvelope>('/api/mcp/tools/call', {
      method: 'POST',
      body: JSON.stringify({ name, arguments: args, conversationId }),
    }),
};

export const compareApi = {
  run: (body: {
    messages: StreamChatInput['messages'];
    providers: Array<{
      provider: AIProvider;
      model?: string;
      openrouterKey?: string;
    }>;
    systemContext?: string;
    templateId?: string;
  }) =>
    apiJson<{
      results: Array<
        | { ok: true; provider: AIProvider; model?: string; text: string }
        | { ok: false; provider: AIProvider; model?: string; error: string }
      >;
    }>('/api/chat/compare', { method: 'POST', body: JSON.stringify(body) }),
};
