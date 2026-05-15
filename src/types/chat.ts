/**
 * Shared chat / MCP type definitions used across the chat page and services.
 *
 * Mirrors the envelope shapes returned by `backend/src/services/mcp/registry.ts`
 * and `backend/src/services/chatService.ts`.
 */

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type ToolRenderKind =
  | 'resource'
  | 'resources'
  | 'paper'
  | 'papers'
  | 'comparison'
  | 'comparisons'
  | 'template'
  | 'statements'
  | 'sparql_results'
  | 'chart_spec'
  | 'graph'
  | 'stats'
  | 'dynamic_questions'
  | 'ask_synthesis'
  | 'text';

export interface ToolResultEnvelopeOk<T = unknown> {
  ok: true;
  render: ToolRenderKind;
  summary?: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ToolResultEnvelopeError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ToolResultEnvelope<T = unknown> =
  | ToolResultEnvelopeOk<T>
  | ToolResultEnvelopeError;

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: unknown;
  result?: ToolResultEnvelope;
  status?: 'pending' | 'success' | 'error';
  startedAt?: number;
  finishedAt?: number;
}

export interface ChatAttachment {
  type: 'orkg-resource' | 'orkg-paper' | 'orkg-comparison' | 'orkg-template';
  id: string;
  label?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolCalls?: ChatToolCall[];
  attachments?: ChatAttachment[];
  model?: string;
  provider?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  templateId?: string;
  provider?: string;
  model?: string;
  shareToken?: string;
  isPublic?: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  category?: string;
  adminOnly?: boolean;
  inputSchema: unknown;
}

export type ChatStreamEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; value: string }
  | { type: 'reasoning'; value: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; result: ToolResultEnvelope }
  | { type: 'message_complete'; message: ChatMessage }
  | { type: 'error'; error: string }
  | { type: 'end' };

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
  title?: string;
  xKey: string;
  yKeys: string[];
  data: Array<Record<string, string | number | boolean | null>>;
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;
}

export interface GraphSpec {
  rootId: string;
  rootLabel?: string;
  nodes: Array<{
    id: string;
    label?: string;
    kind?: 'resource' | 'literal' | 'class' | 'predicate';
  }>;
  edges: Array<{
    source: string;
    target: string;
    label?: string;
    predicateId?: string;
  }>;
}

export interface SparqlResults {
  vars: string[];
  rows: Array<Record<string, string>>;
  total: number;
  query: string;
}
