import { EXTERNAL_MCP_LIMITS } from '../../config/mcp.js';
import { AsyncLocalStorage } from 'node:async_hooks';

export { EXTERNAL_MCP_LIMITS } from '../../config/mcp.js';

export class McpExecutionError extends Error {
  constructor(readonly code: 'MCP_TOOL_TIMEOUT' | 'MCP_TOOL_CANCELLED') {
    super(
      code === 'MCP_TOOL_TIMEOUT'
        ? 'MCP tool execution deadline exceeded.'
        : 'MCP tool execution cancelled.'
    );
  }
}

const execution = new AsyncLocalStorage<{
  controller: AbortController;
  deadline: number;
  validate?: () => void;
}>();

/** Undefined outside the production router: legacy/demo callers are unchanged. */
export const executionSignal = () => execution.getStore()?.controller.signal;

export function checkExecution() {
  const scope = execution.getStore();
  if (!scope) return;
  try {
    scope.validate?.();
  } catch (error) {
    scope.controller.abort(error);
    throw error;
  }
  // Timers cannot interrupt synchronous JS; also check elapsed wall time.
  if (!scope.controller.signal.aborted && Date.now() >= scope.deadline) {
    scope.controller.abort(new McpExecutionError('MCP_TOOL_TIMEOUT'));
  }
  scope.controller.signal.throwIfAborted();
}

/** Link both a caller's existing signal and the optional production deadline. */
export function linkExecutionAbort(
  controller: AbortController,
  signal?: AbortSignal
) {
  const signals = [
    ...new Set(
      [signal, executionSignal()].filter(
        (value): value is AbortSignal => value !== undefined
      )
    ),
  ];
  const abort = () => controller.abort();
  for (const parent of signals) {
    if (parent.aborted) abort();
    else parent.addEventListener('abort', abort, { once: true });
  }
  return () => {
    for (const parent of signals) parent.removeEventListener('abort', abort);
  };
}

/** Abort real downstream work, then await its settlement/cleanup before replying. */
export async function withMcpExecution<T>(
  operation: () => Promise<T>,
  signals: readonly AbortSignal[] = [],
  timeoutMs: number = EXTERNAL_MCP_LIMITS.toolTimeoutMs,
  validate?: () => void
): Promise<T> {
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(new McpExecutionError('MCP_TOOL_CANCELLED'));
  for (const signal of signals) {
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  }
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(
    () => controller.abort(new McpExecutionError('MCP_TOOL_TIMEOUT')),
    timeoutMs
  );
  try {
    return await execution.run({ controller, deadline, validate }, async () => {
      checkExecution();
      try {
        const result = await operation();
        checkExecution();
        return result;
      } catch (error) {
        checkExecution();
        throw error;
      }
    });
  } finally {
    clearTimeout(timer);
    for (const signal of signals) signal.removeEventListener('abort', cancel);
  }
}
