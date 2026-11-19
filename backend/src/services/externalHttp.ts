import { EXTERNAL_HTTP_LIMITS } from '../config/mcp.js';
import fetch, { AbortError, FetchError } from 'node-fetch';
import { setTimeout as delay } from 'node:timers/promises';
import { checkExecution, linkExecutionAbort } from './mcp/executionScope.js';

/** Provisional external budgets: bounded JSON payloads and interactive latency. */
export { EXTERNAL_HTTP_LIMITS } from '../config/mcp.js';

/** Server-side only; never populated from tool arguments. */
export interface ExternalHttpOptions {
  externalMcp?: boolean;
  signal?: AbortSignal;
}

export class ExternalHttpError extends Error {
  constructor(
    public readonly code:
      | 'EXTERNAL_HTTP_RESPONSE_TOO_LARGE'
      | 'EXTERNAL_HTTP_TIMEOUT'
      | 'EXTERNAL_HTTP_ABORTED'
      | 'EXTERNAL_HTTP_INVALID_JSON'
      | 'EXTERNAL_HTTP_UPSTREAM_ERROR'
  ) {
    super(
      {
        EXTERNAL_HTTP_RESPONSE_TOO_LARGE:
          'Upstream response exceeds the external size limit.',
        EXTERNAL_HTTP_TIMEOUT:
          'External data request timed out. Please retry later.',
        EXTERNAL_HTTP_ABORTED: 'External data request was aborted.',
        EXTERNAL_HTTP_INVALID_JSON:
          'Upstream returned an invalid JSON response.',
        EXTERNAL_HTTP_UPSTREAM_ERROR:
          'External data could not be retrieved. Please retry later.',
      }[code]
    );
  }
}

/** One deadline covers all attempts, backoff and response consumption. */
export async function externalHttpJson<T>(
  url: string,
  options: {
    headers?: Record<string, string>;
    retries?: number;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const unlink = linkExecutionAbort(controller, options.signal);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EXTERNAL_HTTP_LIMITS.timeoutMs);
  try {
    for (let attempt = 0; ; attempt++) {
      checkExecution();
      controller.signal.throwIfAborted();
      const response = await fetch(url, {
        headers: options.headers,
        signal: controller.signal,
        // node-fetch counts actual consumed (decompressed) bytes, not Content-Length.
        size: EXTERNAL_HTTP_LIMITS.maxResponseBytes,
      });
      const text = await response.text();
      checkExecution();
      if (!response.ok) {
        if (
          [502, 503, 504].includes(response.status) &&
          attempt < (options.retries ?? 0)
        ) {
          await delay(400 * 2 ** attempt, undefined, {
            signal: controller.signal,
          });
          continue;
        }
        throw new ExternalHttpError('EXTERNAL_HTTP_UPSTREAM_ERROR');
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ExternalHttpError('EXTERNAL_HTTP_INVALID_JSON');
      }
    }
  } catch (err) {
    if (timedOut) throw new ExternalHttpError('EXTERNAL_HTTP_TIMEOUT');
    if (controller.signal.aborted || err instanceof AbortError)
      throw new ExternalHttpError('EXTERNAL_HTTP_ABORTED');
    if (err instanceof FetchError && err.type === 'max-size')
      throw new ExternalHttpError('EXTERNAL_HTTP_RESPONSE_TOO_LARGE');
    if (err instanceof ExternalHttpError) throw err;
    throw new ExternalHttpError('EXTERNAL_HTTP_UPSTREAM_ERROR');
  } finally {
    clearTimeout(timer);
    unlink();
  }
}
