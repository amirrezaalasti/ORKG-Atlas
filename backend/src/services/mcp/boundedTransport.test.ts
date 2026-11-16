import { afterEach, expect, it, vi } from 'vitest';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BoundedMcpTransport } from './boundedTransport.js';
import { EXTERNAL_MCP_LIMITS } from './executionScope.js';
import type { Request, Response } from 'express';

afterEach(() => {
  vi.restoreAllMocks();
});

it('includes UTF-8 encoding, JSON escaping, RPC id and both result copies', async () => {
  const send = vi
    .spyOn(StreamableHTTPServerTransport.prototype, 'send')
    .mockResolvedValue();
  const transport = new BoundedMcpTransport();
  const data = { value: 'é'.repeat(EXTERNAL_MCP_LIMITS.maxResponseBytes / 4) };
  const message = {
    jsonrpc: '2.0' as const,
    id: 'rpc-size',
    result: {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
      isError: false,
    },
  };
  expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  expect(Buffer.byteLength(JSON.stringify(message))).toBeGreaterThan(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  await transport.send(message);
  expect(send).toHaveBeenCalledWith(
    {
      jsonrpc: '2.0',
      id: 'rpc-size',
      error: {
        code: -32603,
        message: 'MCP response exceeds the size limit.',
        data: { code: 'MCP_RESPONSE_TOO_LARGE' },
      },
    },
    undefined
  );
});

it('accepts the complete boundary and replaces a reply one byte over it without truncating', async () => {
  const send = vi
    .spyOn(StreamableHTTPServerTransport.prototype, 'send')
    .mockResolvedValue();
  const transport = new BoundedMcpTransport();
  const reply = { jsonrpc: '2.0' as const, id: 9, result: { value: '' } };
  reply.result.value = 'x'.repeat(
    EXTERNAL_MCP_LIMITS.maxResponseBytes -
      Buffer.byteLength(JSON.stringify(reply))
  );
  expect(Buffer.byteLength(JSON.stringify(reply))).toBe(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  await transport.send(reply);
  expect(send.mock.calls[0][0]).toBe(reply);
  reply.result.value += 'x';
  await transport.send(reply);
  const outgoing = send.mock.calls[1][0];
  expect(outgoing).toHaveProperty('error.data.code', 'MCP_RESPONSE_TOO_LARGE');
  expect(outgoing).not.toHaveProperty('result');
  expect(Buffer.byteLength(JSON.stringify(outgoing))).toBeLessThan(256);
});

const batchRequest = [1, 2].map((id) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
}));
it('buffers a successful batch until every reply is available', async () => {
  const send = vi
    .spyOn(StreamableHTTPServerTransport.prototype, 'send')
    .mockResolvedValue();
  const transport = new BoundedMcpTransport(batchRequest);
  const first = { jsonrpc: '2.0' as const, id: 1, result: { value: 'first' } };
  const second = {
    jsonrpc: '2.0' as const,
    id: 2,
    result: { value: 'second' },
  };
  await transport.send(second);
  expect(send).not.toHaveBeenCalled();
  await transport.send(first);
  expect(send.mock.calls.map(([message]) => message)).toEqual([first, second]);
  await transport.close();
});

it.each([0, 1])(
  'counts batch brackets and separators at the aggregate boundary (+%s bytes)',
  async (extra) => {
    const send = vi
      .spyOn(StreamableHTTPServerTransport.prototype, 'send')
      .mockResolvedValue();
    const transport = new BoundedMcpTransport(batchRequest);
    const messages = [1, 2].map((id) => ({
      jsonrpc: '2.0' as const,
      id,
      result: { value: '' },
    }));
    const remaining =
      EXTERNAL_MCP_LIMITS.maxResponseBytes -
      Buffer.byteLength(JSON.stringify(messages));
    messages[0].result.value = 'x'.repeat(Math.floor(remaining / 2));
    messages[1].result.value = 'x'.repeat(Math.ceil(remaining / 2) + extra);
    expect(
      messages.every(
        (message) =>
          Buffer.byteLength(JSON.stringify(message)) <
          EXTERNAL_MCP_LIMITS.maxResponseBytes
      )
    ).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(messages))).toBe(
      EXTERNAL_MCP_LIMITS.maxResponseBytes + extra
    );
    for (const message of messages) await transport.send(message);
    const outgoing = send.mock.calls.map(([message]) => message);
    expect(outgoing).toHaveLength(2);
    if (extra) {
      for (let i = 0; i < outgoing.length; i++) {
        expect(outgoing[i]).toHaveProperty('id', i + 1);
        expect(outgoing[i]).toHaveProperty(
          'error.data.code',
          'MCP_RESPONSE_TOO_LARGE'
        );
        expect(outgoing[i]).not.toHaveProperty('result');
      }
    } else expect(outgoing).toEqual(messages);
    await transport.close();
  }
);

it('drops incomplete buffered results when closed', async () => {
  const send = vi
    .spyOn(StreamableHTTPServerTransport.prototype, 'send')
    .mockResolvedValue();
  const transport = new BoundedMcpTransport(batchRequest);
  await transport.send({ jsonrpc: '2.0', id: 1, result: { value: 'discard' } });
  await transport.close();
  expect(send).not.toHaveBeenCalled();
});

it('settles a suppressed SDK response on lifecycle abort and handles a late rejection without sending again', async () => {
  let reject!: (error: Error) => void;
  vi.spyOn(
    StreamableHTTPServerTransport.prototype,
    'handleRequest'
  ).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  const send = vi
    .spyOn(StreamableHTTPServerTransport.prototype, 'send')
    .mockResolvedValue();
  const controller = new AbortController();
  const transport = new BoundedMcpTransport(batchRequest, controller.signal);
  const work = transport.handleRequest({} as Request, {} as Response);
  controller.abort();
  await work;
  await transport.close();
  await transport.close();
  reject(new Error('late SDK failure'));
  await Promise.resolve();
  await transport.send({ jsonrpc: '2.0', id: 1, result: {} });
  expect(close).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
});
