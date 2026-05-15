/**
 * Streaming chat route with multi-step tool calling.
 *
 * The endpoint speaks a small SSE protocol with the chat UI:
 *
 *   data: {"type":"start","conversationId":"..."}
 *   data: {"type":"text","value":"…token…"}
 *   data: {"type":"reasoning","value":"…"}
 *   data: {"type":"tool_call","id":"...","name":"orkg_search_papers","args":{...}}
 *   data: {"type":"tool_result","id":"...","result":{...}}
 *   data: {"type":"message_complete","message":{...}}
 *   data: {"type":"error","error":"..."}
 *   data: {"type":"end"}
 *
 * Tools are sourced from the MCP registry and adapted into Vercel AI SDK
 * tools so the model can call them across multiple steps. After streaming,
 * the full assistant message is persisted to Firestore alongside the user
 * message.
 */

import { Router, type Response } from 'express';
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  validateKeycloakToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { createUserRateLimiter } from '../middleware/aiRateLimit.js';
import {
  chatService,
  type ChatMessage,
  type ChatToolCall,
} from '../services/chatService.js';
import { toolRegistry } from '../services/mcp/tools.js';
import type { AIProvider } from '../aiService.js';

const router = Router();

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequestBody {
  messages: IncomingMessage[];
  conversationId?: string;
  templateId?: string;
  provider?: AIProvider;
  model?: string;
  systemContext?: string;
  /** When true, ignore the existing conversation history and start fresh. */
  fresh?: boolean;
  /** When set, the most recent user message arrives with these attachments. */
  attachments?: ChatMessage['attachments'];
}

const sanitizeEnvVar = (value: string | undefined): string =>
  (value ?? '').trim().replace(/^["']|["']$/g, '');

const createModel = (
  provider: AIProvider,
  model: string | undefined,
  openrouterKey?: string
) => {
  switch (provider) {
    case 'openai': {
      const apiKey = sanitizeEnvVar(process.env.OPENAI_API_KEY);
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
      return createOpenAI({ apiKey }).languageModel(model || 'gpt-4o-mini');
    }
    case 'groq': {
      const apiKey = sanitizeEnvVar(process.env.GROQ_API_KEY);
      if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');
      return createGroq({ apiKey }).languageModel(
        model || 'llama-3.3-70b-versatile'
      );
    }
    case 'mistral': {
      const apiKey = sanitizeEnvVar(process.env.MISTRAL_API_KEY);
      if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured.');
      return createMistral({ apiKey }).languageModel(
        model || 'mistral-large-latest'
      );
    }
    case 'google': {
      const apiKey =
        sanitizeEnvVar(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
        sanitizeEnvVar(process.env.GOOGLE_API_KEY);
      if (!apiKey)
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured.');
      return createGoogleGenerativeAI({ apiKey }).languageModel(
        model || 'gemini-2.5-flash'
      );
    }
    case 'openrouter': {
      const apiKey = (openrouterKey || '').trim();
      if (!apiKey) throw new Error('OpenRouter API key is required.');
      return createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer':
            sanitizeEnvVar(process.env.FRONTEND_URL) ||
            'https://empire-compass.tib.eu',
          'X-Title': 'ORKG Atlas',
        },
      }).languageModel(model || 'openai/gpt-4o-mini');
    }
  }
};

const buildSystemPrompt = (templateId?: string, extra?: string): string => {
  const base = `You are ORKG Atlas Chat, an expert research assistant grounded in the Open Research Knowledge Graph (ORKG).
Help researchers explore the ORKG triplestore, ORKG REST API, and ORKG Ask service to answer questions about templates, papers, statements, comparisons, statistics, and competency questions.

Tool-use guidance:
- Prefer ORKG tools (orkg_*) over inventing answers. Run SPARQL with orkg_sparql; fetch concrete entities with orkg_get_paper / orkg_get_resource / orkg_get_template / orkg_get_comparison.
- For literature discovery, use orkg_ask_search and (optionally) orkg_ask_synthesize.
- When the user asks for a chart or visualisation, call render_chart with a concrete data array derived from the previous tool results.
- When statements bundles or template structures should be visualised, call render_graph with explicit nodes and edges.
- Tools return structured envelopes; the chat UI renders them as cards. The user already sees those cards — keep your text replies focused on insight rather than re-listing what cards already show.
- Never fabricate ORKG IDs; if unsure, search first.

Citation guidance:
- Cite ORKG resources with markdown links of the form [Label](https://orkg.org/resource/<id>) or [Title](https://orkg.org/paper/<id>).
- Use markdown for formatting. Do not output HTML; the client renders markdown.
- Keep responses concise and analytical. Use bullet points when appropriate.`;
  const tplLine = templateId
    ? `\n\nThe user is currently working with template ${templateId}. Prefer this template's contributions/predicates when ambiguous.`
    : '';
  return base + tplLine + (extra ? `\n\nAdditional context:\n${extra}` : '');
};

/**
 * Build Vercel AI SDK tools from the MCP registry. Tool execute functions
 * call the MCP handler and emit events through the provided stream callbacks
 * so the UI sees a live tool-call timeline.
 */
const buildAiTools = (opts: {
  isAdmin?: boolean;
  userId?: string;
  userEmail?: string;
  emit: (evt: Record<string, unknown>) => void;
  toolCallSink: ChatToolCall[];
}) => {
  const tools: Record<string, ReturnType<typeof tool>> = {};
  const list = toolRegistry.list({ includeAdmin: !!opts.isAdmin });
  for (const meta of list) {
    const def = toolRegistry.get(meta.name);
    if (!def) continue;
    tools[meta.name] = tool({
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: def.schema as any,
      execute: async (args: unknown, options?: { toolCallId?: string }) => {
        const id = options?.toolCallId || `tc_${Date.now().toString(36)}`;
        const startedAt = Date.now();
        opts.emit({ type: 'tool_call', id, name: def.name, args });
        const result = await toolRegistry.call(def.name, args, {
          userId: opts.userId,
          userEmail: opts.userEmail,
          isAdmin: opts.isAdmin,
        });
        const finishedAt = Date.now();
        opts.toolCallSink.push({
          id,
          name: def.name,
          arguments: args,
          result,
          status: result.ok ? 'success' : 'error',
          startedAt,
          finishedAt,
        });
        opts.emit({ type: 'tool_result', id, result });
        return result;
      },
    });
  }
  return tools;
};

const writeSse = (res: Response, evt: Record<string, unknown>) => {
  res.write(`data: ${JSON.stringify(evt)}\n\n`);
};

router.post(
  '/stream',
  validateKeycloakToken,
  createUserRateLimiter(),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    const body = (req.body || {}) as ChatRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      res.status(400).json({ error: 'messages is required' });
      return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      res.status(400).json({ error: 'No user message found' });
      return;
    }

    const provider = (body.provider || 'openrouter') as AIProvider;
    const openrouterKey =
      provider === 'openrouter'
        ? (req.headers['x-openrouter-api-key'] as string | undefined)?.trim()
        : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let conversationId = body.conversationId;
    try {
      if (!conversationId) {
        const conv = await chatService.createConversation({
          ownerId: req.userId,
          title: lastUser.content.slice(0, 80),
          templateId: body.templateId,
          provider,
          model: body.model,
        });
        conversationId = conv.id;
      } else {
        const existing = await chatService.getConversation(conversationId);
        if (!existing || existing.ownerId !== req.userId) {
          writeSse(res, { type: 'error', error: 'Conversation not found' });
          res.end();
          return;
        }
      }
      writeSse(res, { type: 'start', conversationId });

      await chatService.appendMessage(conversationId, {
        role: 'user',
        content: lastUser.content,
        attachments: body.attachments,
      });

      const toolCallSink: ChatToolCall[] = [];
      const tools = buildAiTools({
        isAdmin: req.isAdmin,
        userId: req.userId,
        userEmail: req.userEmail,
        emit: (evt) => writeSse(res, evt),
        toolCallSink,
      });

      const model = createModel(provider, body.model, openrouterKey);
      const system = buildSystemPrompt(body.templateId, body.systemContext);

      const aiMessages: ModelMessage[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      let assistantText = '';
      let assistantReasoning = '';

      const stream = streamText({
        model,
        system,
        messages: aiMessages,
        tools,
        // Allow up to 6 rounds of tool-calling within a single user turn.
        stopWhen: stepCountIs(6),
        temperature: 0.3,
        maxOutputTokens: 4000,
      });

      const onClientClose = () => {
        // No public abort; relying on client-disconnect to stop the underlying request.
      };
      req.on('close', onClientClose);

      try {
        for await (const part of stream.fullStream) {
          switch (part.type) {
            case 'text-delta': {
              const delta = part.text;
              if (delta) {
                assistantText += delta;
                writeSse(res, { type: 'text', value: delta });
              }
              break;
            }
            case 'reasoning-delta': {
              const r = part.text;
              if (r) {
                assistantReasoning += r;
                writeSse(res, { type: 'reasoning', value: r });
              }
              break;
            }
            case 'tool-call':
            case 'tool-result':
            case 'tool-error':
              // Already emitted from inside the tool's execute function.
              break;
            case 'error': {
              const errMsg =
                part.error instanceof Error
                  ? part.error.message
                  : typeof part.error === 'string'
                    ? part.error
                    : 'Stream error';
              writeSse(res, { type: 'error', error: errMsg });
              break;
            }
            case 'finish':
              break;
            default:
              break;
          }
        }
      } catch (err) {
        writeSse(res, {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const persisted = await chatService.appendMessage(conversationId, {
        role: 'assistant',
        content: assistantText,
        reasoning: assistantReasoning || undefined,
        toolCalls: toolCallSink.length > 0 ? toolCallSink : undefined,
        provider,
        model: body.model,
      });

      writeSse(res, { type: 'message_complete', message: persisted });
      writeSse(res, { type: 'end' });
      res.end();
    } catch (err) {
      writeSse(res, {
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      writeSse(res, { type: 'end' });
      res.end();
    }
  }
);

/**
 * Non-streaming dual-model comparison endpoint.
 *
 * Runs two models on the same messages in parallel and returns both answers
 * (no tool-calling, no persistence). Used by the chat UI’s "Compare models"
 * dialog.
 */
router.post(
  '/compare',
  validateKeycloakToken,
  createUserRateLimiter(),
  async (req: AuthenticatedRequest, res) => {
    const { messages, providers, systemContext, templateId } = (req.body ||
      {}) as {
      messages: IncomingMessage[];
      providers: Array<{
        provider: AIProvider;
        model?: string;
        openrouterKey?: string;
      }>;
      systemContext?: string;
      templateId?: string;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' });
    }
    if (!Array.isArray(providers) || providers.length < 2) {
      return res
        .status(400)
        .json({ error: 'providers must contain at least 2 entries' });
    }

    const aiMessages: ModelMessage[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const system = buildSystemPrompt(templateId, systemContext);

    const results = await Promise.all(
      providers.map(async (entry) => {
        try {
          const model = createModel(
            entry.provider,
            entry.model,
            entry.openrouterKey
          );
          const stream = streamText({
            model,
            system,
            messages: aiMessages,
            temperature: 0.3,
            maxOutputTokens: 2000,
          });
          const text = await stream.text;
          return {
            ok: true as const,
            provider: entry.provider,
            model: entry.model,
            text,
          };
        } catch (err) {
          return {
            ok: false as const,
            provider: entry.provider,
            model: entry.model,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    res.json({ results });
  }
);

export default router;
