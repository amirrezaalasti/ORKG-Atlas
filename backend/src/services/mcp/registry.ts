/**
 * MCP-like tool registry.
 *
 * Provides a JSON-RPC inspired interface for AI tool-calling and for direct
 * client invocation. Tools accept a JSON `arguments` object validated by Zod
 * and return a JSON-serialisable result wrapped in a small envelope so the
 * chat UI can render structured cards (papers, comparisons, charts, etc.).
 */

import { z, type ZodTypeAny } from 'zod';

/**
 * Standard render hint that the client uses to pick an inline component
 * (resource card, paper card, chart, graph, table, etc.). Tools include a
 * single render hint at the top level; nested data may include further hints
 * via the `kind` discriminator on individual items.
 */
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

export interface ToolResultEnvelope<T = unknown> {
  ok: true;
  render: ToolRenderKind;
  /** Short summary string the LLM can use as text output. */
  summary?: string;
  data: T;
  /** Hints for the UI — links, ids, badges. */
  meta?: Record<string, unknown>;
}

export interface ToolErrorEnvelope {
  ok: false;
  error: string;
  details?: unknown;
}

export type ToolResult<T = unknown> = ToolResultEnvelope<T> | ToolErrorEnvelope;

export interface ToolDefinition<TInput extends ZodTypeAny = ZodTypeAny> {
  name: string;
  title: string;
  /** Short, human-readable description used by the LLM for tool selection. */
  description: string;
  /** Zod schema describing accepted arguments; converted to JSON Schema for clients. */
  schema: TInput;
  /** When `true`, tool is exposed in the public manifest but only callable for admins. */
  adminOnly?: boolean;
  /** Soft tag used by the UI to group tools (e.g. "ORKG", "Search", "Stats"). */
  category?: string;
  /**
   * Implementation. Should never throw; return ToolErrorEnvelope on failure
   * so callers receive a consistent shape.
   */
  handler: (args: z.infer<TInput>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId?: string;
  userEmail?: string;
  isAdmin?: boolean;
  /** Used by tools that want to attribute work back to a Firestore conversation. */
  conversationId?: string;
}

class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register<TInput extends ZodTypeAny>(def: ToolDefinition<TInput>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Duplicate MCP tool registered: ${def.name}`);
    }
    this.tools.set(def.name, def as ToolDefinition);
  }

  list(opts: { includeAdmin?: boolean } = {}): Array<{
    name: string;
    title: string;
    description: string;
    category?: string;
    adminOnly?: boolean;
    inputSchema: unknown;
  }> {
    const out: Array<{
      name: string;
      title: string;
      description: string;
      category?: string;
      adminOnly?: boolean;
      inputSchema: unknown;
    }> = [];
    for (const tool of this.tools.values()) {
      if (tool.adminOnly && !opts.includeAdmin) continue;
      out.push({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        adminOnly: tool.adminOnly,
        inputSchema: zodToJsonSchema(tool.schema),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async call(
    name: string,
    rawArgs: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }
    if (tool.adminOnly && !ctx.isAdmin) {
      return { ok: false, error: `Tool ${name} requires admin access` };
    }
    const parsed = tool.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        error: `Invalid arguments for ${name}`,
        details: parsed.error.issues,
      };
    }
    try {
      return await tool.handler(parsed.data, ctx);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();

/**
 * Lightweight Zod → JSON Schema converter (sufficient for the small subset
 * of types we use — string, number, boolean, enum, array, object, optional).
 *
 * We avoid a full library to keep the dependency surface minimal.
 */
export function zodToJsonSchema(schema: ZodTypeAny): unknown {
  const def = (
    schema as unknown as { _def: { typeName: string; [k: string]: unknown } }
  )._def;
  const t = def.typeName;

  if (t === 'ZodString') {
    const desc = (schema as { description?: string }).description;
    return { type: 'string', ...(desc ? { description: desc } : {}) };
  }
  if (t === 'ZodNumber') {
    const desc = (schema as { description?: string }).description;
    return { type: 'number', ...(desc ? { description: desc } : {}) };
  }
  if (t === 'ZodBoolean') {
    return { type: 'boolean' };
  }
  if (t === 'ZodEnum') {
    return { type: 'string', enum: (def as { values: string[] }).values };
  }
  if (t === 'ZodNativeEnum') {
    const values = Object.values(
      (def as { values: Record<string, unknown> }).values
    ).filter((v) => typeof v === 'string');
    return { type: 'string', enum: values };
  }
  if (t === 'ZodArray') {
    const items = zodToJsonSchema((def as { type: ZodTypeAny }).type);
    return { type: 'array', items };
  }
  if (t === 'ZodObject') {
    const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> })
      .shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const innerDef = (value as unknown as { _def: { typeName: string } })
        ._def;
      if (
        innerDef.typeName !== 'ZodOptional' &&
        innerDef.typeName !== 'ZodDefault'
      ) {
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  if (t === 'ZodOptional' || t === 'ZodNullable') {
    return zodToJsonSchema((def as { innerType: ZodTypeAny }).innerType);
  }
  if (t === 'ZodDefault') {
    return zodToJsonSchema((def as { innerType: ZodTypeAny }).innerType);
  }
  if (t === 'ZodUnion') {
    const options = (def as { options: ZodTypeAny[] }).options.map(
      zodToJsonSchema
    );
    return { anyOf: options };
  }
  if (t === 'ZodLiteral') {
    return { const: (def as { value: unknown }).value };
  }
  if (t === 'ZodRecord') {
    return { type: 'object', additionalProperties: true };
  }
  if (t === 'ZodAny' || t === 'ZodUnknown') {
    return {};
  }
  return {};
}

export const ok = <T>(
  render: ToolRenderKind,
  data: T,
  opts: { summary?: string; meta?: Record<string, unknown> } = {}
): ToolResultEnvelope<T> => ({
  ok: true,
  render,
  data,
  summary: opts.summary,
  meta: opts.meta,
});

export const fail = (error: string, details?: unknown): ToolErrorEnvelope => ({
  ok: false,
  error,
  details,
});
