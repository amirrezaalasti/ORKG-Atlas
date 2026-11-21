/**
 * Standard MCP server over stdio for the Atlas tool registry, so agent CLIs
 * (Claude Code, Cursor, …) can use the same tools as the Atlas chat.
 *
 *   npx tsx src/mcp-stdio.ts                 # all non-admin tools
 *   ATLAS_MCP_TOOLS=orkg_sparql_schema,orkg_sparql npx tsx src/mcp-stdio.ts
 *
 * Implements initialize, tools/list, tools/call and ping (protocol 2025-06-18,
 * newline-delimited JSON-RPC 2.0). Everything except protocol messages goes to stderr.
 */

// Keep stdout clean for JSON-RPC: route any stray logging to stderr.
console.log = console.error;
console.info = console.error;
console.warn = console.error;

const { toolRegistry } = await import('./services/mcp/tools.js');
const { createInterface } = await import('node:readline');

// Optional: serve frozen instance profiles (evaluation) instead of profiling live.
if (process.env.ATLAS_FROZEN_PROFILES) {
  const { readFileSync } = await import('node:fs');
  const { seedInstanceProfiles } = await import(
    './services/sparqlPromptService.js'
  );
  seedInstanceProfiles(
    JSON.parse(readFileSync(process.env.ATLAS_FROZEN_PROFILES, 'utf8'))
  );
}

const allow = process.env.ATLAS_MCP_TOOLS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const visible = () =>
  toolRegistry.list().filter((t) => !allow || allow.includes(t.name));

type Msg = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
};
const send = (m: unknown) => process.stdout.write(JSON.stringify(m) + '\n');
const reply = (id: Msg['id'], result: unknown) =>
  send({ jsonrpc: '2.0', id, result });
const error = (id: Msg['id'], code: number, message: string) =>
  send({ jsonrpc: '2.0', id, error: { code, message } });

const handle = async (msg: Msg) => {
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications (e.g. notifications/initialized)
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'orkg-atlas', version: '1.0.0' },
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, {
        tools: visible().map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = params?.name as string;
      if (!visible().some((t) => t.name === name))
        return error(id, -32602, `Unknown tool: ${name}`);
      const res = await toolRegistry.call(name, params?.arguments ?? {}, {});
      let text: string;
      if (!res.ok) text = `Error: ${res.error}`;
      else if (typeof (res.data as any)?.sparqlPrompt === 'string') {
        // Schema prompt: send as plain text, not an escaped JSON string (≈30% smaller, readable).
        const { sparqlPrompt, ...meta } = res.data as any;
        text = `${JSON.stringify(meta)}\n\n${sparqlPrompt}`;
      } else text = JSON.stringify(res.data ?? res, null, 1);
      return reply(id, { content: [{ type: 'text', text }], isError: !res.ok });
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
};

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg: Msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return error(null as any, -32700, 'Parse error');
  }
  handle(msg).catch((e) =>
    error(msg.id, -32603, e instanceof Error ? e.message : String(e))
  );
});
