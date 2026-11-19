/**
 * Server-controlled MCP budgets, preserved from the backup implementation.
 * Integration services, quota middleware and Redis Lua scripts share these
 * values. They cannot be overridden by client arguments.
 */
export const EXTERNAL_MCP_LIMITS = Object.freeze({
  maxRequestBytes: 256 * 1024,
  maxResponseBytes: 3 * 1024 * 1024,
  toolTimeoutMs: 20_000,
  sparqlTimeoutMs: 10_000,
  schemaTimeoutMs: 30_000,
});

const cleanupAllowanceMs = 20_000;
const leaseSafetyMs = 5_000;

export const MCP_QUOTAS = Object.freeze({
  controlVersion: 2,
  namespaceMaxLength: 64,
  retryAfterMs: 1_000,
  windowMs: 60_000,
  requestsPerMinute: 60,
  toolsPerMinute: 30,
  expensivePerMinute: 6,
  schemaPerMinute: 2,
  activeTools: 4,
  activeExpensive: 2,
  activeSchema: 1,
  maxBatch: 4,
  storeTimeoutMs: 1_000,
  storeMaxResponseBytes: 4_096,
  cleanupAllowanceMs,
  leaseSafetyMs,
  leaseMs:
    Math.max(
      EXTERNAL_MCP_LIMITS.toolTimeoutMs,
      EXTERNAL_MCP_LIMITS.sparqlTimeoutMs,
      EXTERNAL_MCP_LIMITS.schemaTimeoutMs
    ) +
    cleanupAllowanceMs +
    leaseSafetyMs,
  renewEveryMs: 10_000,
});

/** Execution + cleanup + margin for bounded admission/release, also covering body upload. */
export const MCP_HTTP_TIMEOUT_MS = MCP_QUOTAS.leaseMs;

/** General SPARQL budgets also used by internal callers in the backup. */
export const SPARQL_LIMITS = Object.freeze({
  maxQueryBytes: 50_000,
  maxResponseBytes: 5_000_000,
  maxConcurrentRequests: 5,
  timeoutMs: 25_000,
  maxOutputRows: 1_000,
});

/** Additional query-cost bounds for the public endpoint only. */
export const PUBLIC_SPARQL_LIMITS = Object.freeze({
  maxQueryBytes: 2_000,
  minSelectLimit: 1,
  maxSelectLimit: 100,
  maxOffset: 0,
});

export const EXTERNAL_HTTP_LIMITS = Object.freeze({
  maxResponseBytes: 5_000_000,
  timeoutMs: 25_000,
});

export const EXTERNAL_CATALOG_LIMITS = Object.freeze({
  maxPages: 20,
  maxItems: 1_000,
  maxBytes: 5_000_000,
  timeoutMs: 25_000,
});

export const EXTERNAL_HIERARCHY_LIMITS = Object.freeze({
  maxTemplates: 20,
  maxLookups: 40,
  lookupPageSize: 200,
  maxConcurrentRequests: 1,
  timeoutMs: 25_000,
});

/** Collection bounds for the externally allowed tools. */
export const MCP_TOOL_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 100,
  maxBundleDepth: 10,
  defaultStatementSample: 200,
  maxStatementSample: 500,
  defaultGraphStatements: 120,
  maxGraphStatements: 200,
  maxChartRows: 2_000,
  maxChartSeries: 10,
  maxGraphNodes: 500,
  maxGraphEdges: 2_000,
});
