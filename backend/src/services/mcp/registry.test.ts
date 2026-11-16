import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(10),
});

let registry: typeof import('./registry.js');
let testTool: ToolDefinition<typeof inputSchema>;

beforeEach(async () => {
  // Reset the module cache so each test gets its own singleton and tool map.
  vi.resetModules();
  registry = await import('./registry.js');
  testTool = {
    name: 'test_search',
    title: 'Test search',
    description: 'Search synthetic research data.',
    category: 'Test',
    schema: inputSchema,
    handler: vi.fn().mockResolvedValue(registry.ok('text', 'done')),
  };
});

describe('ToolRegistry registration and discovery', () => {
  it('registers a tool and returns its definition by name', () => {
    expect(registry.toolRegistry.list()).toEqual([]);
    registry.toolRegistry.register(testTool);

    expect(registry.toolRegistry.get(testTool.name)).toBe(testTool);
    expect(registry.toolRegistry.get('missing')).toBeUndefined();
    expect(testTool.handler).not.toHaveBeenCalled();
  });

  it('rejects duplicate registration without replacing the tool', () => {
    registry.toolRegistry.register(testTool);
    const replacement = { ...testTool, handler: vi.fn() };

    expect(() => registry.toolRegistry.register(replacement)).toThrow(
      'Duplicate MCP tool registered: test_search'
    );
    expect(registry.toolRegistry.get(testTool.name)).toBe(testTool);
    expect(replacement.handler).not.toHaveBeenCalled();
  });

  it('lists sorted metadata and schemas without exposing handlers', () => {
    registry.toolRegistry.register({ ...testTool, name: 'zeta' });
    registry.toolRegistry.register({ ...testTool, name: 'alpha' });

    const tools = registry.toolRegistry.list();

    expect(tools.map((tool) => tool.name)).toEqual(['alpha', 'zeta']);
    expect(tools[0]).toEqual({
      name: 'alpha',
      title: testTool.title,
      description: testTool.description,
      category: 'Test',
      adminOnly: undefined,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1 },
          limit: { type: 'integer', exclusiveMinimum: 0, default: 10 },
        },
        required: ['query'],
        additionalProperties: true,
      },
    });
    expect(tools.every((tool) => !('handler' in tool))).toBe(true);
    expect(testTool.handler).not.toHaveBeenCalled();
  });
});

describe('ToolRegistry execution and validation', () => {
  it('executes tools with parsed input and context', async () => {
    const result = registry.ok(
      'papers',
      { items: [{ id: 'R1' }] },
      { summary: 'One paper found.', meta: { source: 'test' } }
    );
    vi.mocked(testTool.handler).mockResolvedValue(result);
    registry.toolRegistry.register(testTool);
    const ctx = {
      userId: 'user-1',
      userEmail: 'user@example.test',
      isAdmin: false,
      conversationId: 'conversation-1',
    };

    await expect(
      registry.toolRegistry.call(
        testTool.name,
        { query: 'research', limit: 5, ignored: true },
        ctx
      )
    ).resolves.toBe(result);
    expect(testTool.handler).toHaveBeenCalledTimes(1);
    expect(testTool.handler).toHaveBeenCalledWith(
      { query: 'research', limit: 5 },
      ctx
    );
  });

  it('applies schema defaults before calling the handler', async () => {
    registry.toolRegistry.register(testTool);

    await registry.toolRegistry.call(testTool.name, { query: 'research' }, {});

    expect(testTool.handler).toHaveBeenCalledTimes(1);
    expect(testTool.handler).toHaveBeenCalledWith(
      { query: 'research', limit: 10 },
      {}
    );
  });

  it.each([undefined, null, {}])(
    'uses an empty argument object and schema defaults for %j',
    async (args) => {
      registry.toolRegistry.register({
        ...testTool,
        schema: inputSchema.extend({ query: z.string().default('all') }),
      });

      await registry.toolRegistry.call(testTool.name, args, {});

      expect(testTool.handler).toHaveBeenCalledTimes(1);
      expect(testTool.handler).toHaveBeenCalledWith(
        { query: 'all', limit: 10 },
        {}
      );
    }
  );

  it.each([
    { args: {}, path: ['query'], code: 'invalid_type' },
    { args: { query: 42 }, path: ['query'], code: 'invalid_type' },
    { args: { query: '' }, path: ['query'], code: 'too_small' },
    {
      args: { query: 'research', limit: 1.5 },
      path: ['limit'],
      code: 'invalid_type',
    },
  ])(
    'rejects invalid arguments $args before execution',
    async ({ args, path, code }) => {
      registry.toolRegistry.register(testTool);

      await expect(
        registry.toolRegistry.call(testTool.name, args, {})
      ).resolves.toEqual({
        ok: false,
        error: 'Invalid arguments for test_search',
        details: expect.arrayContaining([
          expect.objectContaining({ path, code }),
        ]),
      });
      expect(testTool.handler).not.toHaveBeenCalled();
    }
  );

  it('returns an error for an unknown tool', async () => {
    registry.toolRegistry.register(testTool);

    await expect(
      registry.toolRegistry.call('missing', {}, {})
    ).resolves.toEqual({
      ok: false,
      error: 'Unknown tool: missing',
    });
    expect(testTool.handler).not.toHaveBeenCalled();
  });

  it('preserves an explicit tool error including its details', async () => {
    const result = registry.fail('No research data found.', { source: 'test' });
    vi.mocked(testTool.handler).mockResolvedValue(result);
    registry.toolRegistry.register(testTool);

    await expect(
      registry.toolRegistry.call(testTool.name, { query: 'research' }, {})
    ).resolves.toBe(result);
    expect(testTool.handler).toHaveBeenCalledTimes(1);
  });

  it('wraps synchronous handler exceptions in an error envelope', async () => {
    vi.mocked(testTool.handler).mockImplementation(() => {
      throw new Error('Synchronous failure');
    });
    registry.toolRegistry.register(testTool);

    await expect(
      registry.toolRegistry.call(testTool.name, { query: 'research' }, {})
    ).resolves.toEqual({ ok: false, error: 'Synchronous failure' });
    expect(testTool.handler).toHaveBeenCalledTimes(1);
  });

  it.each([new Error('Asynchronous failure'), 'Asynchronous failure'])(
    'wraps rejected handler promises in an error envelope: %s',
    async (error) => {
      vi.mocked(testTool.handler).mockRejectedValue(error);
      registry.toolRegistry.register(testTool);

      await expect(
        registry.toolRegistry.call(testTool.name, { query: 'research' }, {})
      ).resolves.toEqual({ ok: false, error: 'Asynchronous failure' });
      expect(testTool.handler).toHaveBeenCalledTimes(1);
    }
  );
});

describe('ToolRegistry admin access', () => {
  it('hides admin tools unless explicitly included in discovery', () => {
    registry.toolRegistry.register(testTool);
    registry.toolRegistry.register({
      ...testTool,
      name: 'test_admin',
      adminOnly: true,
    });

    expect(registry.toolRegistry.list().map((tool) => tool.name)).toEqual([
      'test_search',
    ]);
    expect(registry.toolRegistry.list({ includeAdmin: false })).toHaveLength(1);
    expect(registry.toolRegistry.list({ includeAdmin: true })).toEqual([
      expect.objectContaining({ name: 'test_admin', adminOnly: true }),
      expect.objectContaining({ name: 'test_search' }),
    ]);
    expect(testTool.handler).not.toHaveBeenCalled();
  });

  it.each([undefined, false])(
    'denies direct admin calls before validation when isAdmin is %s',
    async (isAdmin) => {
      registry.toolRegistry.register({ ...testTool, adminOnly: true });

      await expect(
        registry.toolRegistry.call(testTool.name, {}, { isAdmin })
      ).resolves.toEqual({
        ok: false,
        error: 'Tool test_search requires admin access',
      });
      expect(testTool.handler).not.toHaveBeenCalled();
    }
  );

  it('executes an admin tool for an admin context', async () => {
    registry.toolRegistry.register({ ...testTool, adminOnly: true });

    await expect(
      registry.toolRegistry.call(
        testTool.name,
        { query: 'research' },
        { isAdmin: true }
      )
    ).resolves.toEqual(registry.ok('text', 'done'));
    expect(testTool.handler).toHaveBeenCalledTimes(1);
    expect(testTool.handler).toHaveBeenCalledWith(
      { query: 'research', limit: 10 },
      { isAdmin: true }
    );
  });
});

describe('Tool result envelopes', () => {
  it('builds success envelopes with and without optional fields', () => {
    expect(registry.ok('text', 'done')).toStrictEqual({
      ok: true,
      render: 'text',
      data: 'done',
      summary: undefined,
      meta: undefined,
    });
    expect(
      registry.ok('papers', [], { summary: 'No papers.', meta: { total: 0 } })
    ).toStrictEqual({
      ok: true,
      render: 'papers',
      data: [],
      summary: 'No papers.',
      meta: { total: 0 },
    });
  });

  it('builds error envelopes with and without details', () => {
    expect(registry.fail('Failed')).toStrictEqual({
      ok: false,
      error: 'Failed',
      details: undefined,
    });
    expect(registry.fail('Failed', { reason: 'test' })).toStrictEqual({
      ok: false,
      error: 'Failed',
      details: { reason: 'test' },
    });
  });
});
