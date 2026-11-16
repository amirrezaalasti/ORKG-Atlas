import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_CATALOG_LIMITS,
  EXTERNAL_HIERARCHY_LIMITS,
  EXTERNAL_HTTP_LIMITS,
  EXTERNAL_MCP_LIMITS,
  MCP_QUOTAS,
  MCP_HTTP_TIMEOUT_MS,
  MCP_TOOL_LIMITS,
  PUBLIC_SPARQL_LIMITS,
  SPARQL_LIMITS,
} from './mcp.js';

describe('MCP migration budgets', () => {
  it('bounds HTTP upload, admission, execution and cleanup with one derived deadline', () => {
    expect(MCP_HTTP_TIMEOUT_MS).toBe(45_000);
    expect(MCP_HTTP_TIMEOUT_MS).toBeGreaterThanOrEqual(
      Math.max(
        EXTERNAL_MCP_LIMITS.toolTimeoutMs,
        EXTERNAL_MCP_LIMITS.sparqlTimeoutMs,
        EXTERNAL_MCP_LIMITS.schemaTimeoutMs
      ) +
        MCP_QUOTAS.cleanupAllowanceMs +
        3 * MCP_QUOTAS.storeTimeoutMs
    );
  });
  it('preserves transport boundaries and production tool deadlines', () => {
    expect(EXTERNAL_MCP_LIMITS).toEqual({
      maxRequestBytes: 262_144,
      maxResponseBytes: 3_145_728,
      toolTimeoutMs: 20_000,
      sparqlTimeoutMs: 10_000,
      schemaTimeoutMs: 8_000,
    });
  });

  it('preserves distributed admission and store I/O budgets', () => {
    expect(MCP_QUOTAS).toEqual({
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
      cleanupAllowanceMs: 20_000,
      leaseSafetyMs: 5_000,
      leaseMs: 45_000,
      renewEveryMs: 10_000,
    });
  });

  it('covers every execution deadline and cleanup with the derived lease', () => {
    const longestDeadline = Math.max(
      EXTERNAL_MCP_LIMITS.toolTimeoutMs,
      EXTERNAL_MCP_LIMITS.sparqlTimeoutMs,
      EXTERNAL_MCP_LIMITS.schemaTimeoutMs
    );
    expect(MCP_QUOTAS.leaseMs).toBe(
      longestDeadline + MCP_QUOTAS.cleanupAllowanceMs + MCP_QUOTAS.leaseSafetyMs
    );
    expect(
      MCP_QUOTAS.renewEveryMs +
        MCP_QUOTAS.storeTimeoutMs +
        MCP_QUOTAS.leaseSafetyMs
    ).toBeLessThan(MCP_QUOTAS.leaseMs);
  });

  it('keeps expensive and schema capacity within the shared tool budget', () => {
    expect(MCP_QUOTAS.activeSchema).toBeLessThanOrEqual(
      MCP_QUOTAS.activeExpensive
    );
    expect(MCP_QUOTAS.activeExpensive).toBeLessThanOrEqual(
      MCP_QUOTAS.activeTools
    );
    expect(MCP_QUOTAS.schemaPerMinute).toBeLessThanOrEqual(
      MCP_QUOTAS.expensivePerMinute
    );
    expect(MCP_QUOTAS.expensivePerMinute).toBeLessThanOrEqual(
      MCP_QUOTAS.toolsPerMinute
    );
    expect(MCP_QUOTAS.toolsPerMinute).toBeLessThanOrEqual(
      MCP_QUOTAS.requestsPerMinute
    );
    expect(MCP_QUOTAS.maxBatch).toBeLessThanOrEqual(MCP_QUOTAS.activeTools);
  });

  it('preserves the distinct shared and public SPARQL limits', () => {
    expect(SPARQL_LIMITS).toEqual({
      maxQueryBytes: 50_000,
      maxResponseBytes: 5_000_000,
      maxConcurrentRequests: 5,
      timeoutMs: 25_000,
      maxOutputRows: 1_000,
    });
    expect(PUBLIC_SPARQL_LIMITS).toEqual({
      maxQueryBytes: 2_000,
      minSelectLimit: 1,
      maxSelectLimit: 100,
      maxOffset: 0,
    });
    expect(PUBLIC_SPARQL_LIMITS.maxQueryBytes).toBeLessThan(
      SPARQL_LIMITS.maxQueryBytes
    );
    expect(PUBLIC_SPARQL_LIMITS.maxSelectLimit).toBeLessThanOrEqual(
      SPARQL_LIMITS.maxOutputRows
    );
  });

  it('preserves upstream, catalog and sequential hierarchy budgets', () => {
    expect(EXTERNAL_HTTP_LIMITS).toEqual({
      maxResponseBytes: 5_000_000,
      timeoutMs: 25_000,
    });
    expect(EXTERNAL_CATALOG_LIMITS).toEqual({
      maxPages: 20,
      maxItems: 1_000,
      maxBytes: 5_000_000,
      timeoutMs: 25_000,
    });
    expect(EXTERNAL_HIERARCHY_LIMITS).toEqual({
      maxTemplates: 20,
      maxLookups: 40,
      lookupPageSize: 200,
      maxConcurrentRequests: 1,
      timeoutMs: 25_000,
    });
  });

  it('preserves the allowed tools collection bounds', () => {
    expect(MCP_TOOL_LIMITS).toEqual({
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
  });

  it.each([
    EXTERNAL_MCP_LIMITS,
    MCP_QUOTAS,
    SPARQL_LIMITS,
    PUBLIC_SPARQL_LIMITS,
    EXTERNAL_HTTP_LIMITS,
    EXTERNAL_CATALOG_LIMITS,
    EXTERNAL_HIERARCHY_LIMITS,
    MCP_TOOL_LIMITS,
  ])(
    'protects server-controlled limits from runtime mutation: %j',
    (limits) => {
      expect(Object.isFrozen(limits)).toBe(true);
      const key = Object.keys(limits)[0];
      const original = Reflect.get(limits, key);
      expect(Reflect.set(limits, key, original + 1)).toBe(false);
      expect(Reflect.get(limits, key)).toBe(original);
    }
  );
});
