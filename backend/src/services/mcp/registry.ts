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
  | 'templates'
  | 'statements'
  | 'sparql_results'
  | 'chart_spec'
  | 'graph'
  | 'stats'
  | 'dynamic_questions'
  | 'ask_synthesis'
  | 'ask_paper_related'
  | 'ask_answer'
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
  /** Server-controlled by the external policy, never taken from tool arguments. */
  externalMcp?: boolean;
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
    this.tools.set(def.name, def as unknown as ToolDefinition);
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
      if (ctx.externalMcp) return externalToolExecutionFailure();
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();

/**
 * Zod 3 → JSON Schema for tool inputs: primitives, enums, arrays, objects,
 * records, unions, literals, and optional/nullable/default wrappers. Preserves
 * number and length bounds. Strip objects accept extra input fields; Zod still
 * removes them during execution. Defaults are discovery-time annotations only.
 *
 * Not a general Zod converter: refinements, transforms, coercion, formats,
 * constrained record keys, and recursive schemas are not represented. The
 * existing fallback for unsupported types remains an unconstrained schema.
 */
export function zodToJsonSchema(schema: ZodTypeAny): unknown {
  const def = (schema as z.ZodFirstPartySchemaTypes)._def;

  if (def.typeName === 'ZodString') {
    const out: Record<string, unknown> = {
      type: 'string',
      ...(schema.description ? { description: schema.description } : {}),
    };
    for (const check of def.checks) {
      if (check.kind === 'min' || check.kind === 'length') {
        out.minLength = Math.max((out.minLength as number) ?? 0, check.value);
      }
      if (check.kind === 'max' || check.kind === 'length') {
        out.maxLength = Math.min(
          (out.maxLength as number) ?? Infinity,
          check.value
        );
      }
    }
    return out;
  }
  if (def.typeName === 'ZodNumber') {
    const out: Record<string, unknown> = {
      type: 'number',
      ...(schema.description ? { description: schema.description } : {}),
    };
    for (const check of def.checks) {
      if (check.kind === 'int') out.type = 'integer';
      if (check.kind === 'min') {
        const key = check.inclusive ? 'minimum' : 'exclusiveMinimum';
        out[key] = Math.max((out[key] as number) ?? -Infinity, check.value);
      }
      if (check.kind === 'max') {
        const key = check.inclusive ? 'maximum' : 'exclusiveMaximum';
        out[key] = Math.min((out[key] as number) ?? Infinity, check.value);
      }
    }
    return out;
  }
  if (def.typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }
  if (def.typeName === 'ZodNull') {
    return { type: 'null' };
  }
  if (def.typeName === 'ZodEnum') {
    return { type: 'string', enum: def.values };
  }
  if (def.typeName === 'ZodNativeEnum') {
    const values: Array<string | number> = z.util.getValidEnumValues(
      def.values
    );
    const types = [...new Set(values.map((value) => typeof value))];
    return { type: types.length === 1 ? types[0] : types, enum: values };
  }
  if (def.typeName === 'ZodArray') {
    const out: Record<string, unknown> = {
      type: 'array',
      items: zodToJsonSchema(def.type),
    };
    if (def.minLength) out.minItems = def.minLength.value;
    if (def.maxLength) out.maxItems = def.maxLength.value;
    if (def.exactLength) {
      out.minItems = Math.max(
        (out.minItems as number) ?? 0,
        def.exactLength.value
      );
      out.maxItems = Math.min(
        (out.maxItems as number) ?? Infinity,
        def.exactLength.value
      );
    }
    return out;
  }
  if (def.typeName === 'ZodObject') {
    const shape: Record<string, ZodTypeAny> = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!value.isOptional()) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties:
        def.catchall._def.typeName !== 'ZodNever'
          ? zodToJsonSchema(def.catchall)
          : def.unknownKeys !== 'strict',
    };
  }
  if (def.typeName === 'ZodOptional') {
    return zodToJsonSchema(def.innerType);
  }
  if (def.typeName === 'ZodNullable') {
    return { anyOf: [zodToJsonSchema(def.innerType), { type: 'null' }] };
  }
  if (def.typeName === 'ZodDefault') {
    return {
      ...(zodToJsonSchema(def.innerType) as Record<string, unknown>),
      default: def.defaultValue(),
    };
  }
  if (def.typeName === 'ZodUnion') {
    return { anyOf: def.options.map(zodToJsonSchema) };
  }
  if (def.typeName === 'ZodLiteral') {
    return { const: def.value };
  }
  if (def.typeName === 'ZodRecord') {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(def.valueType),
    };
  }
  if (def.typeName === 'ZodAny' || def.typeName === 'ZodUnknown') {
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

/** Safe fallback for unexpected external execution failures. */
export const externalToolExecutionFailure = () =>
  fail('External tool execution failed. Please retry later.', {
    code: 'EXTERNAL_TOOL_EXECUTION_ERROR',
  });
