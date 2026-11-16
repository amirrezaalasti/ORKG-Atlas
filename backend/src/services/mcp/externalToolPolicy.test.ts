import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const allowedNames = [
  'orkg_sparql_schema',
  'orkg_sparql',
  'orkg_get_resource',
  'orkg_search_resources',
  'orkg_get_paper',
  'orkg_search_papers',
  'orkg_get_statements_bundle',
  'orkg_get_statements_by_subject',
  'orkg_get_comparison',
  'orkg_search_comparisons',
  'orkg_get_template',
  'orkg_search_templates',
  'atlas_list_templates',
  'orkg_build_graph',
  'render_chart',
  'render_graph',
];
const excludedNames = [
  'orkg_ask_search',
  'orkg_ask_search_by_paper',
  'atlas_template_stats',
  'orkg_ask_generate',
  'orkg_ask_synthesize',
  'orkg_ask',
  'atlas_search_dynamic_questions',
];
const inputSchema = z.object({
  id: z.string().min(2),
  limit: z.number().int().positive().default(10),
});

let registry: typeof import('./registry.js');
let policy: typeof import('./externalToolPolicy.js');

function registerTool(name: string, adminOnly = false) {
  const tool = {
    name,
    title: `Test ${name}`,
    description: 'Synthetic research tool.',
    category: 'Test',
    adminOnly,
    schema: inputSchema,
    handler: vi.fn().mockResolvedValue(registry.ok('resource', { id: 'R1' })),
  };
  registry.toolRegistry.register(tool);
  return tool;
}

beforeEach(async () => {
  vi.resetModules();
  registry = await import('./registry.js');
  policy = await import('./externalToolPolicy.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('external tool discovery', () => {
  it('does not expose allowlisted tools that have not been registered', () => {
    expect(policy.listExternalTools({})).toEqual([]);
  });

  it('exposes exactly the allowed names in alphabetical order', () => {
    const tools = [...allowedNames].reverse().map((name) => registerTool(name));
    for (const name of [...excludedNames, 'orkg_search_future']) {
      tools.push(registerTool(name));
    }

    expect(
      policy.listExternalTools({ isAdmin: true }).map((tool) => tool.name)
    ).toEqual([...allowedNames].sort());
    for (const tool of tools) expect(tool.handler).not.toHaveBeenCalled();
  });

  it('preserves the registry metadata and schemas', () => {
    registerTool('orkg_get_resource');
    registerTool('orkg_get_paper');
    registerTool('orkg_ask_generate');
    const expected = registry.toolRegistry
      .list()
      .filter((tool) => tool.name !== 'orkg_ask_generate');

    expect(policy.listExternalTools({})).toStrictEqual(expected);
  });

  it.each([undefined, false, true])(
    'keeps external discovery unprivileged when isAdmin is %s',
    (isAdmin) => {
      registerTool('orkg_get_paper', true);
      registerTool('render_graph');
      registerTool('orkg_ask_generate', true);

      expect(
        policy.listExternalTools({ isAdmin }).map((tool) => tool.name)
      ).toEqual(['render_graph']);
    }
  );
});

describe('external tool execution', () => {
  it.each(excludedNames)('rejects %s even for an admin', async (name) => {
    const tool = registerTool(name);
    const call = vi.spyOn(registry.toolRegistry, 'call');

    await expect(
      policy.callExternalTool(name, {}, { isAdmin: true })
    ).resolves.toEqual(
      registry.fail(`Tool ${name} is not available for external MCP access`)
    );
    expect(call).not.toHaveBeenCalled();
    expect(tool.handler).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'rejects a non-allowlisted name when registered is %s',
    async (registered) => {
      const tool = registered ? registerTool('orkg_search_future') : undefined;
      const call = vi.spyOn(registry.toolRegistry, 'call');

      await expect(
        policy.callExternalTool('orkg_search_future', { id: 'R1' }, {})
      ).resolves.toEqual(
        registry.fail(
          'Tool orkg_search_future is not available for external MCP access'
        )
      );
      expect(policy.listExternalTools({})).toEqual([]);
      expect(call).not.toHaveBeenCalled();
      if (tool) expect(tool.handler).not.toHaveBeenCalled();
    }
  );

  it.each(['search', 'search_by_paper', 'synthesize', 'generate'])(
    'rejects orkg_ask with action %s',
    async (action) => {
      const tool = registerTool('orkg_ask');
      const call = vi.spyOn(registry.toolRegistry, 'call');

      await expect(
        policy.callExternalTool('orkg_ask', { action }, {})
      ).resolves.toEqual(
        registry.fail('Tool orkg_ask is not available for external MCP access')
      );
      expect(call).not.toHaveBeenCalled();
      expect(tool.handler).not.toHaveBeenCalled();
    }
  );

  it.each(allowedNames)(
    'delegates %s and preserves its result',
    async (name) => {
      const tool = registerTool(name);
      const result = registry.ok(
        'resource',
        { id: 'R1' },
        {
          summary: 'One resource.',
          meta: { source: 'test' },
        }
      );
      tool.handler.mockResolvedValue(result);
      const call = vi.spyOn(registry.toolRegistry, 'call');
      const args = {
        id: 'R1',
        ignored: true,
        externalMcp: false,
        isAdmin: true,
        userId: 'forged-user',
        context: { isAdmin: true },
      };
      const ctx = {
        userId: 'user-1',
        userEmail: 'user@example.test',
        isAdmin: true,
        conversationId: 'conversation-1',
      };

      await expect(policy.callExternalTool(name, args, ctx)).resolves.toBe(
        result
      );
      expect(call).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledWith(name, args, {
        isAdmin: false,
        externalMcp: true,
      });
      expect(tool.handler).toHaveBeenCalledTimes(1);
      expect(tool.handler).toHaveBeenCalledWith(
        { id: 'R1', limit: 10 },
        { isAdmin: false, externalMcp: true }
      );
      expect(ctx).not.toHaveProperty('externalMcp');
    }
  );

  it.each([
    { args: {}, code: 'invalid_type' },
    { args: { id: 42 }, code: 'invalid_type' },
    { args: { id: 'R' }, code: 'too_small' },
  ])('preserves validation errors for $args', async ({ args, code }) => {
    const tool = registerTool('orkg_get_paper');

    await expect(policy.callExternalTool(tool.name, args, {})).resolves.toEqual(
      {
        ok: false,
        error: 'Invalid arguments for orkg_get_paper',
        details: expect.arrayContaining([
          expect.objectContaining({ path: ['id'], code }),
        ]),
      }
    );
    expect(tool.handler).not.toHaveBeenCalled();
  });

  it('preserves explicit tool errors and details', async () => {
    const tool = registerTool('orkg_get_paper');
    const result = registry.fail('No data found.', { source: 'test' });
    tool.handler.mockResolvedValue(result);

    await expect(
      policy.callExternalTool(tool.name, { id: 'R1' }, {})
    ).resolves.toBe(result);
  });

  it('sanitizes errors from rejected handler promises', async () => {
    const tool = registerTool('orkg_get_paper');
    tool.handler.mockRejectedValue(new Error('Upstream failure'));

    await expect(
      policy.callExternalTool(tool.name, { id: 'R1' }, {})
    ).resolves.toEqual(registry.externalToolExecutionFailure());
  });

  it('preserves unknown-tool errors for unregistered allowlisted names', async () => {
    await expect(
      policy.callExternalTool('orkg_get_paper', { id: 'R1' }, {})
    ).resolves.toEqual({ ok: false, error: 'Unknown tool: orkg_get_paper' });
  });

  it.each([undefined, false, true])(
    'never grants external admin access when isAdmin is %s',
    async (isAdmin) => {
      const tool = registerTool('orkg_get_paper', true);
      const result = await policy.callExternalTool(
        tool.name,
        { id: 'R1' },
        { isAdmin }
      );

      expect(result).toEqual({
        ok: false,
        error: 'Tool orkg_get_paper requires admin access',
      });
      expect(tool.handler).not.toHaveBeenCalled();
    }
  );
});

describe('internal registry compatibility', () => {
  it('keeps internal tools callable without mutating their definitions', async () => {
    const tools = [
      ...excludedNames,
      'orkg_search_future',
      'orkg_get_paper',
    ].map((name) => Object.freeze(registerTool(name)));
    const before = registry.toolRegistry.list({ includeAdmin: true });
    const ctx = { isAdmin: true };
    policy.listExternalTools(ctx);

    for (const tool of tools) {
      await policy.callExternalTool(tool.name, { id: 'R1' }, ctx);
      tool.handler.mockClear();
      await expect(
        registry.toolRegistry.call(tool.name, { id: 'R1' }, ctx)
      ).resolves.toEqual(registry.ok('resource', { id: 'R1' }));
      expect(tool.handler).toHaveBeenCalledTimes(1);
      expect(registry.toolRegistry.get(tool.name)).toBe(tool);
      expect(tool.schema).toBe(inputSchema);
    }

    expect(registry.toolRegistry.list({ includeAdmin: true })).toStrictEqual(
      before
    );
  });
});

it('sanitizes failures outside the handler catch', async () => {
  vi.spyOn(registry.toolRegistry, 'call').mockRejectedValue(
    new Error('https://internal.test secret configuration')
  );
  await expect(
    policy.callExternalTool('orkg_get_paper', {}, {})
  ).resolves.toEqual(registry.externalToolExecutionFailure());
});

it('sanitizes synchronous exceptions but preserves internal exceptions', async () => {
  const tool = registerTool('orkg_get_paper');
  tool.handler.mockImplementation(() => {
    throw new Error('private stack');
  });
  await expect(
    policy.callExternalTool(tool.name, { id: 'R1' }, {})
  ).resolves.toEqual(registry.externalToolExecutionFailure());
  await expect(
    registry.toolRegistry.call(tool.name, { id: 'R1' }, {})
  ).resolves.toEqual({ ok: false, error: 'private stack' });
});
