import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {
  JSONRPCMessage,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import { EXTERNAL_MCP_LIMITS } from '../../config/mcp.js';

/** Bound the complete JSON-mode body, including SDK-supported batch replies. */
export class BoundedMcpTransport extends StreamableHTTPServerTransport {
  private readonly ids: RequestId[];
  private readonly replies = new Map<RequestId, JSONRPCMessage>();
  private bytes = 2; // Array brackets for a batch response.
  private oversized = false;
  private closed = false;

  constructor(
    body?: unknown,
    private readonly httpSignal?: AbortSignal
  ) {
    super({ sessionIdGenerator: undefined, enableJsonResponse: true });
    this.ids = Array.isArray(body)
      ? body.flatMap((message) =>
          message &&
          typeof message === 'object' &&
          typeof message.method === 'string' &&
          (typeof message.id === 'string' || typeof message.id === 'number')
            ? [message.id]
            : []
        )
      : [];
  }

  /** SDK JSON-mode completion can remain pending even after close(). */
  private async untilHttpEnds(operation: () => Promise<void>) {
    if (this.closed || this.httpSignal?.aborted) return;
    if (!this.httpSignal) return operation();
    let abort!: () => void;
    const stopped = new Promise<void>((resolve) => {
      abort = resolve;
    });
    this.httpSignal.addEventListener('abort', abort, { once: true });
    try {
      // Keep a rejection handler attached even if the HTTP lifecycle wins the race.
      await Promise.race([operation(), stopped]);
    } finally {
      this.httpSignal.removeEventListener('abort', abort);
    }
  }

  override async start() {
    await this.untilHttpEnds(() => super.start());
  }

  override async handleRequest(
    ...args: Parameters<StreamableHTTPServerTransport['handleRequest']>
  ) {
    await this.untilHttpEnds(() => super.handleRequest(...args));
  }

  private sizeError(message: JSONRPCMessage): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id: 'id' in message ? message.id : undefined,
      error: {
        code: -32603,
        message: 'MCP response exceeds the size limit.',
        data: { code: 'MCP_RESPONSE_TOO_LARGE' },
      },
    };
  }

  override async send(
    message: JSONRPCMessage,
    options?: Parameters<StreamableHTTPServerTransport['send']>[1]
  ) {
    if (this.closed) return;
    // Delay forwarding until the aggregate size is known. If over budget,
    // release buffered results and replace the whole batch with explicit errors.
    if (this.ids.length > 1 && 'id' in message && message.id !== undefined) {
      if (!this.oversized) {
        this.bytes +=
          Buffer.byteLength(JSON.stringify(message), 'utf8') +
          (this.replies.size ? 1 : 0);
        if (this.bytes > EXTERNAL_MCP_LIMITS.maxResponseBytes) {
          this.oversized = true;
          for (const [id, reply] of this.replies)
            this.replies.set(id, this.sizeError(reply));
        }
      }
      this.replies.set(
        message.id,
        this.oversized ? this.sizeError(message) : message
      );
      if (this.replies.size === this.ids.length) {
        for (const id of this.ids)
          await super.send(this.replies.get(id)!, options);
        this.replies.clear();
      }
      return;
    }
    // Measure UTF-8 bytes after JSON escaping, including id and both result copies.
    if (
      Buffer.byteLength(JSON.stringify(message), 'utf8') >
      EXTERNAL_MCP_LIMITS.maxResponseBytes
    ) {
      return super.send(this.sizeError(message), options);
    }
    return super.send(message, options);
  }

  override async close() {
    if (this.closed) return;
    this.closed = true;
    this.replies.clear();
    await super.close();
  }
}
