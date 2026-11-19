import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from './registry.js';

describe('numeric input constraints', () => {
  it.each([
    { schema: z.number(), expected: { type: 'number' } },
    { schema: z.number().int(), expected: { type: 'integer' } },
    {
      schema: z.number().min(0).max(100).describe('Score'),
      expected: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Score',
      },
    },
    {
      schema: z.number().gt(-1).lt(5),
      expected: { type: 'number', exclusiveMinimum: -1, exclusiveMaximum: 5 },
    },
    {
      schema: z.number().int().positive().max(1000),
      expected: { type: 'integer', exclusiveMinimum: 0, maximum: 1000 },
    },
    {
      schema: z.number().int().nonnegative(),
      expected: { type: 'integer', minimum: 0 },
    },
    {
      schema: z.number().min(3).min(1).max(8).max(10),
      expected: { type: 'number', minimum: 3, maximum: 8 },
    },
    {
      schema: z.number().gt(3).gt(1).lt(8).lt(10).min(2).max(9),
      expected: {
        type: 'number',
        exclusiveMinimum: 3,
        exclusiveMaximum: 8,
        minimum: 2,
        maximum: 9,
      },
    },
  ])('converts $expected', ({ schema, expected }) => {
    expect(zodToJsonSchema(schema)).toEqual(expected);
  });
});

describe('string and array lengths', () => {
  it.each([
    {
      schema: z.string().min(2).max(8).describe('Identifier'),
      expected: {
        type: 'string',
        minLength: 2,
        maxLength: 8,
        description: 'Identifier',
      },
    },
    {
      schema: z.string().min(4).min(1).max(8).max(10),
      expected: { type: 'string', minLength: 4, maxLength: 8 },
    },
    {
      schema: z.string().length(3),
      expected: { type: 'string', minLength: 3, maxLength: 3 },
    },
    {
      schema: z.string().min(0).max(0),
      expected: { type: 'string', minLength: 0, maxLength: 0 },
    },
    {
      schema: z.array(z.string()).min(1).max(10),
      expected: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      },
    },
    {
      schema: z.array(z.number().int()).length(2),
      expected: {
        type: 'array',
        items: { type: 'integer' },
        minItems: 2,
        maxItems: 2,
      },
    },
    {
      schema: z.array(z.boolean()).max(0),
      expected: { type: 'array', items: { type: 'boolean' }, maxItems: 0 },
    },
    {
      schema: z.array(z.string()).min(3).length(2),
      expected: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 2,
      },
    },
    {
      schema: z.array(z.string()).max(1).length(2),
      expected: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 1,
      },
    },
  ])('converts $expected', ({ schema, expected }) => {
    expect(zodToJsonSchema(schema)).toEqual(expected);
  });
});

describe('optional, nullable, and default wrappers', () => {
  it.each([
    { field: z.string(), expected: { type: 'string' }, required: true },
    {
      field: z.string().optional(),
      expected: { type: 'string' },
      required: false,
    },
    {
      field: z.string().nullable(),
      expected: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      required: true,
    },
    {
      field: z.string().optional().nullable(),
      expected: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      required: false,
    },
    {
      field: z.string().nullable().optional(),
      expected: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      required: false,
    },
    {
      field: z.number().default(0),
      expected: { type: 'number', default: 0 },
      required: false,
    },
    {
      field: z.boolean().default(false),
      expected: { type: 'boolean', default: false },
      required: false,
    },
    {
      field: z.string().default(''),
      expected: { type: 'string', default: '' },
      required: false,
    },
    {
      field: z.string().nullable().default(null),
      expected: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        default: null,
      },
      required: false,
    },
    {
      field: z.string().default('fallback').nullable(),
      expected: {
        anyOf: [{ type: 'string', default: 'fallback' }, { type: 'null' }],
      },
      required: false,
    },
    { field: z.unknown(), expected: {}, required: false },
    { field: z.any(), expected: {}, required: false },
    {
      field: z.union([z.string(), z.number().optional()]),
      expected: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      required: false,
    },
  ])(
    'detects input optionality for $expected',
    ({ field, expected, required }) => {
      const schema = z.object({ value: field });

      expect(zodToJsonSchema(schema)).toEqual({
        type: 'object',
        properties: { value: expected },
        ...(required ? { required: ['value'] } : {}),
        additionalProperties: true,
      });
      expect(schema.safeParse({}).success).toBe(!required);
    }
  );

  it('annotates object defaults without applying them during conversion', () => {
    const value = { id: 'R1' };
    const schema = z.object({ id: z.string() }).default(value);

    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: true,
      default: value,
    });
    expect(schema.parse(undefined)).toEqual(value);
    expect(schema.parse({ id: 'R2' })).toEqual({ id: 'R2' });
  });
});

describe('enums and literals', () => {
  it.each([
    {
      schema: z.enum(['bar', 'line']),
      expected: { type: 'string', enum: ['bar', 'line'] },
    },
    {
      schema: z.nativeEnum({ First: 'first', Second: 'second' } as const),
      expected: { type: 'string', enum: ['first', 'second'] },
    },
    {
      schema: z.nativeEnum({ 0: 'Zero', 2: 'Two', Zero: 0, Two: 2 } as const),
      expected: { type: 'number', enum: [0, 2] },
    },
    {
      schema: z.nativeEnum({ 0: 'Zero', Zero: 0, Other: 'other' } as const),
      expected: { type: ['number', 'string'], enum: [0, 'other'] },
    },
  ])('preserves allowed enum values $expected', ({ schema, expected }) => {
    expect(zodToJsonSchema(schema)).toEqual(expected);
    for (const value of expected.enum)
      expect(schema.safeParse(value).success).toBe(true);
    expect(schema.safeParse('Zero').success).toBe(false);
  });

  it.each(['fixed', 0, false, null])('preserves literal %j', (value) => {
    expect(zodToJsonSchema(z.literal(value))).toEqual({ const: value });
  });
});

describe('records, unions, and nested schemas', () => {
  it('preserves null-containing chart cell unions inside records', () => {
    const cell = z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.record(z.unknown())),
    ]);
    const schema = z.object({ data: z.array(z.record(cell)).max(2000) });

    expect(zodToJsonSchema(z.null())).toEqual({ type: 'null' });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        data: {
          type: 'array',
          maxItems: 2000,
          items: {
            type: 'object',
            additionalProperties: {
              anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' },
                {
                  type: 'array',
                  items: { type: 'object', additionalProperties: {} },
                },
              ],
            },
          },
        },
      },
      required: ['data'],
      additionalProperties: true,
    });
    expect(
      schema.safeParse({ data: [{ value: null, items: [{ title: 'Paper' }] }] })
        .success
    ).toBe(true);
    expect(schema.safeParse({ data: [{ value: { nested: 1 } }] }).success).toBe(
      false
    );
    expect(schema.safeParse({ data: [{ value: [1] }] }).success).toBe(false);
  });

  it('converts nested objects and optional enums in arrays', () => {
    const schema = z.object({
      nodes: z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum(['resource', 'literal']).optional(),
          })
        )
        .max(500),
    });

    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          maxItems: 500,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              kind: { type: 'string', enum: ['resource', 'literal'] },
            },
            required: ['id'],
            additionalProperties: true,
          },
        },
      },
      required: ['nodes'],
      additionalProperties: true,
    });
  });
});

describe('object input modes', () => {
  const base = z.object({ id: z.string() });
  it.each([
    { schema: base, additional: true, output: { id: 'R1' } },
    { schema: base.strict(), additional: false, output: undefined },
    {
      schema: base.passthrough(),
      additional: true,
      output: { id: 'R1', extra: 2 },
    },
    {
      schema: base.strict().catchall(z.number().int().nonnegative()),
      additional: { type: 'integer', minimum: 0 },
      output: { id: 'R1', extra: 2 },
    },
  ])(
    'publishes extra-field rules $additional without changing parsing',
    ({ schema, additional, output }) => {
      const input = { id: 'R1', extra: 2 };
      const before = schema.safeParse(input);
      const definition = schema._def;

      expect(zodToJsonSchema(schema)).toEqual({
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: additional,
      });
      expect(schema._def).toBe(definition);
      const after = schema.safeParse(input);
      expect(after.success).toBe(before.success);
      if (before.success && after.success) {
        expect(after.data).toEqual(before.data);
      } else if (!before.success && !after.success) {
        expect(after.error.issues).toEqual(before.error.issues);
      }
      expect(before.success).toBe(output !== undefined);
      if (before.success) expect(before.data).toEqual(output);
      expect(input).toEqual({ id: 'R1', extra: 2 });
    }
  );

  it('keeps typed catchall validation active', () => {
    const schema = base.catchall(z.number());
    zodToJsonSchema(schema);
    expect(schema.safeParse({ id: 'R1', extra: 'wrong' }).success).toBe(false);
  });
});

describe('tool discovery and execution', () => {
  it('publishes accurate inputs while preserving validation and result envelopes', async () => {
    vi.resetModules();
    const { toolRegistry, ok } = await import('./registry.js');
    const { listExternalTools, callExternalTool } = await import(
      './externalToolPolicy.js'
    );
    const schema = z.object({
      query: z.string().min(5),
      rowLimit: z.number().int().positive().max(1000).default(10),
    });
    const result = ok('text', 'done', { summary: 'Unchanged result.' });
    const handler = vi.fn().mockResolvedValue(result);
    toolRegistry.register({
      name: 'orkg_sparql',
      title: 'Test SPARQL',
      description: 'Synthetic tool.',
      schema,
      handler,
    });
    const input = { query: 'SELECT', ignored: true };
    const before = schema.parse(input);
    const expected = {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 5 },
        rowLimit: {
          type: 'integer',
          exclusiveMinimum: 0,
          maximum: 1000,
          default: 10,
        },
      },
      required: ['query'],
      additionalProperties: true,
    };

    expect(toolRegistry.list()[0].inputSchema).toEqual(expected);
    expect(listExternalTools({})[0].inputSchema).toEqual(expected);
    expect(handler).not.toHaveBeenCalled();
    expect(toolRegistry.get('orkg_sparql')?.schema).toBe(schema);
    expect(schema.parse(input)).toEqual(before);
    const ctx = { userId: 'user-1', conversationId: 'conversation-1' };
    await expect(callExternalTool('orkg_sparql', input, ctx)).resolves.toBe(
      result
    );
    expect(handler).toHaveBeenCalledWith(
      { query: 'SELECT', rowLimit: 10 },
      { isAdmin: false, externalMcp: true }
    );
    await expect(
      toolRegistry.call('orkg_sparql', { query: 'SELECT', rowLimit: 1.5 }, ctx)
    ).resolves.toMatchObject({
      ok: false,
      error: 'Invalid arguments for orkg_sparql',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
