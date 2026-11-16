/**
 * Shared ORKG HTTP client.
 *
 * Centralises calls to the ORKG triplestore (SPARQL) and ORKG REST API so all
 * MCP tools share a single, well-behaved transport with timeouts, retries,
 * and REST base host normalisation (orkg.org → www.orkg.org). SPARQL uses
 * `orkg.org/.../triplestore/sparql` explicitly (POST via www or bare `/triplestore` returns 406).
 */

import { externalHttpJson, type ExternalHttpOptions } from '../externalHttp.js';
import fetch, { AbortError, FetchError } from 'node-fetch';
import { checkExecution, linkExecutionAbort } from '../mcp/executionScope.js';
import { SPARQL_LIMITS, type SparqlQueryType } from '../sparql/sparqlPolicy.js';
import {
  parseSparqlQuery,
  SparqlValidationError,
  validateSparqlQuery,
} from '../sparql/sparqlValidation.js';

/** Explicit `/sparql` path required; POST via `www.orkg.org`/…`/triplestore` redirects and returns 406. */
const DEFAULT_SPARQL_ENDPOINT = 'https://orkg.org/triplestore/sparql';
const DEFAULT_REST_BASE = 'https://www.orkg.org/api';

/** ORKG template list/detail JSON; plain `application/json` returns 406 on /templates. */
export const ORKG_TEMPLATE_ACCEPT = 'application/vnd.orkg.template.v1+json';

/** Paper list/detail JSON; plain `application/json` returns 400/406 on /papers. */
export const ORKG_PAPER_ACCEPT = 'application/vnd.orkg.paper.v2+json';

/** Comparison list/detail JSON (server accepts v3 and v2; v3 preferred). */
export const ORKG_COMPARISON_ACCEPT = 'application/vnd.orkg.comparison.v3+json';

const REST_DEFAULT_TIMEOUT_MS = 15_000;

export interface SparqlResponse {
  head?: { vars?: string[] };
  results?: {
    bindings?: Array<
      Record<
        string,
        { value: string; type?: string; datatype?: string; 'xml:lang'?: string }
      >
    >;
  };
  boolean?: boolean;
}

export interface OrkgResource {
  id: string;
  label?: string;
  classes?: string[];
  shared?: number;
  created_at?: string;
  observatory_id?: string;
  organization_id?: string;
  formatted_label?: string | null;
  [key: string]: unknown;
}

export interface OrkgPaper {
  id: string;
  title?: string;
  identifiers?: { doi?: string | string[]; [k: string]: unknown };
  publication_info?: {
    published_year?: number;
    published_month?: number;
    published_in?: string;
    [k: string]: unknown;
  };
  authors?: Array<{ id?: string; name?: string; orcid?: string }>;
  abstract?: string;
  [key: string]: unknown;
}

export interface OrkgComparison {
  id: string;
  title?: string;
  description?: string;
  contributions?: Array<{ id: string; label?: string; paper_id?: string }>;
  predicates?: Array<{ id: string; label?: string }>;
  [key: string]: unknown;
}

export interface OrkgStatement {
  id?: string;
  subject: {
    id: string;
    _class: 'resource' | 'literal' | 'class' | 'predicate';
    label?: string;
    classes?: string[];
  };
  object: {
    id: string;
    _class: 'resource' | 'literal' | 'class' | 'predicate';
    label?: string;
    datatype?: string;
  };
  predicate: { id: string; label?: string };
}

export interface OrkgTemplate {
  id: string;
  label?: string;
  target_class?: { id: string; uri?: string } | string;
  predicate?: { id: string; label?: string };
  formatted_label?: string;
  description?: string;
  properties?: Array<{
    id?: string;
    label?: string;
    placeholder?: string;
    description?: string;
    min_count?: number;
    max_count?: number;
    path?: { id: string; label?: string };
    class?: { id: string; label?: string } | null;
    datatype?: string | null;
  }>;
  [key: string]: unknown;
}

/** Normalises ORKG triplestore URL so SPARQL POST succeeds (canonical host + `/sparql` suffix). */
const normalizeSparqlEndpoint = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/$/, '');
  const hostFixed = trimmed.replace(
    /^https:\/\/www\.orkg\.org/i,
    'https://orkg.org'
  );
  if (/\/triplestore$/i.test(hostFixed)) {
    return `${hostFixed}/sparql`;
  }
  return hostFixed;
};

const sparqlEndpoint = (): string =>
  normalizeSparqlEndpoint(
    process.env.ORKG_SPARQL_ENDPOINT || DEFAULT_SPARQL_ENDPOINT
  );

const restBase = (): string =>
  (process.env.ORKG_API_BASE || DEFAULT_REST_BASE).replace(/\/$/, '');

const withTimeout = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> => {
  const controller = new AbortController();
  const unlink = linkExecutionAbort(controller);
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    checkExecution();
    controller.signal.throwIfAborted();
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    unlink();
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class OrkgUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'OrkgUpstreamError';
  }
}

export class SparqlResourceError extends Error {
  constructor(
    public readonly code:
      | 'SPARQL_QUERY_TOO_LARGE'
      | 'SPARQL_RESPONSE_TOO_LARGE'
      | 'SPARQL_CONCURRENCY_LIMIT'
      | 'SPARQL_TIMEOUT',
    message: string
  ) {
    super(message);
    this.name = 'SparqlResourceError';
  }
}

export class SparqlResponseError extends Error {
  readonly code = 'SPARQL_INVALID_RESPONSE';

  constructor(message: string) {
    super(message);
    this.name = 'SparqlResponseError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Check result containers without converting values or validating RDF metadata. */
function assertSparqlResponse(
  value: unknown,
  queryType: SparqlQueryType
): asserts value is SparqlResponse {
  if (!isRecord(value)) {
    throw new SparqlResponseError(
      'SPARQL response must be a JSON result object.'
    );
  }
  // Missing head/vars remains supported by the existing SELECT fallback.
  if (
    'head' in value &&
    (!isRecord(value.head) ||
      ('vars' in value.head &&
        (!Array.isArray(value.head.vars) ||
          !value.head.vars.every((variable) => typeof variable === 'string'))))
  ) {
    throw new SparqlResponseError(
      'SPARQL response has an invalid result header.'
    );
  }
  if (queryType === 'ASK') {
    if (typeof value.boolean !== 'boolean' || 'results' in value) {
      throw new SparqlResponseError(
        'Invalid SPARQL ASK response: expected a boolean result without SELECT bindings.'
      );
    }
    return;
  }
  if (
    queryType !== 'SELECT' ||
    'boolean' in value ||
    !isRecord(value.results) ||
    !Array.isArray(value.results.bindings)
  ) {
    throw new SparqlResponseError(
      'Invalid SPARQL SELECT response: expected a bindings array without an ASK boolean.'
    );
  }
  for (const row of value.results.bindings) {
    if (
      !isRecord(row) ||
      !Object.values(row).every(
        (term) => isRecord(term) && typeof term.value === 'string'
      )
    ) {
      throw new SparqlResponseError(
        'Invalid SPARQL SELECT binding: expected objects containing string values.'
      );
    }
  }
}

// No queue or cross-instance coordination. Held through body reading and parsing.
let activeSparqlRequests = 0;

const checkSparqlQuerySize = (query: string): void => {
  if (Buffer.byteLength(query, 'utf8') > SPARQL_LIMITS.maxQueryBytes) {
    throw new SparqlResourceError(
      'SPARQL_QUERY_TOO_LARGE',
      `SPARQL query exceeds ${SPARQL_LIMITS.maxQueryBytes} UTF-8 bytes, including required prefixes. Shorten the query.`
    );
  }
};

/** ORKG namespace URIs — both short (r:/c:/p:) and long (orkgr:/orkgc:/orkgp:) aliases. */
const ORKG_PREFIX_URIS: Record<string, string> = {
  r: 'http://orkg.org/orkg/resource/',
  orkgr: 'http://orkg.org/orkg/resource/',
  c: 'http://orkg.org/orkg/class/',
  orkgc: 'http://orkg.org/orkg/class/',
  p: 'http://orkg.org/orkg/predicate/',
  orkgp: 'http://orkg.org/orkg/predicate/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
};

/**
 * Prepend undeclared standard aliases without changing any caller-supplied text.
 * Parse with fallback namespaces to recognize declarations even inline or after
 * comments. Explicit declarations take precedence over these fallbacks.
 */
export const ensureSparqlPrefixes = (query: string): string => {
  const ast = parseSparqlQuery(query, ORKG_PREFIX_URIS);
  // Leave non-query operations to the mandatory policy check below.
  if (ast.type !== 'query') return query;
  const declared = new Set(
    ast.context
      .filter((entry) => entry.subType === 'prefix')
      .map((entry) => entry.key)
  );
  const prepend = Object.entries(ORKG_PREFIX_URIS)
    .filter(([alias]) => !declared.has(alias))
    .map(([alias, uri]) => `PREFIX ${alias}: <${uri}>`)
    .join('\n');
  return prepend ? `${prepend}\n${query}` : query;
};

/**
 * Fix ORDER BY forms that Virtuoso rejects (common LLM mistakes).
 * Invalid: `ORDER BY ?year ASC`, `ORDER BY ?year ?count DESC`
 * Valid:   `ORDER BY ?year`, `ORDER BY ?year DESC(?count)`
 */
export const normalizeSparqlForVirtuoso = (query: string): string =>
  query.replace(/\bORDER\s+BY\b([^\n#;]+)/gi, (_, clause: string) => {
    let c = clause;
    c = c.replace(/(\?\w+)\s+ASC\b/gi, '$1');
    while (/\?\w+\s+DESC\s*$/i.test(c.trim())) {
      c = c.replace(/(\?\w+)\s+DESC\s*$/i, 'DESC($1)');
    }
    return `ORDER BY${c}`;
  });

/**
 * Run a SELECT/ASK SPARQL query against ORKG triplestore.
 *
 * Inspects the query for prefixes and prepends the standard ORKG prefixes when missing.
 * Uses POST with application/x-www-form-urlencoded for resilience with long queries.
 */
export async function sparqlQuery(
  query: string,
  options: {
    timeoutMs?: number;
    /** Retained for caller compatibility; validation is always enforced. */
    readonly?: boolean;
  } = {}
): Promise<SparqlResponse> {
  checkExecution();
  checkSparqlQuerySize(query);
  if (activeSparqlRequests >= SPARQL_LIMITS.maxConcurrentRequests) {
    throw new SparqlResourceError(
      'SPARQL_CONCURRENCY_LIMIT',
      'SPARQL execution is busy. Retry after an active request completes.'
    );
  }
  activeSparqlRequests++;
  try {
    const fullQuery = ensureSparqlPrefixes(query);
    checkSparqlQuerySize(fullQuery);
    const validation = validateSparqlQuery(fullQuery);
    if (!validation.valid) throw new SparqlValidationError(validation);

    const body = new URLSearchParams({ query: fullQuery });
    const requestedTimeout = options.timeoutMs ?? SPARQL_LIMITS.timeoutMs;
    const timeoutMs =
      Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.min(requestedTimeout, SPARQL_LIMITS.timeoutMs)
        : SPARQL_LIMITS.timeoutMs;

    return await withTimeout(async (signal) => {
      const res = await fetch(sparqlEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
        },
        body: body.toString(),
        signal: signal as never,
        size: SPARQL_LIMITS.maxResponseBytes,
      });
      // node-fetch enforces size while consuming the (decompressed) body,
      // including HTTP error bodies. Never return a partially read result.
      const text = await res.text();
      checkExecution();
      if (!res.ok) {
        throw new OrkgUpstreamError(
          `SPARQL request failed (${res.status}). Please retry later.`,
          res.status,
          text
        );
      }
      let result: unknown;
      try {
        result = JSON.parse(text);
      } catch {
        throw new SparqlResponseError(
          'SPARQL response is not valid JSON. Please retry later.'
        );
      }
      assertSparqlResponse(result, validation.queryType);
      return result;
    }, timeoutMs);
  } catch (err) {
    if (err instanceof FetchError && err.type === 'max-size') {
      throw new SparqlResourceError(
        'SPARQL_RESPONSE_TOO_LARGE',
        `SPARQL response exceeds ${SPARQL_LIMITS.maxResponseBytes} bytes. Narrow the query or request fewer fields.`
      );
    }
    if (err instanceof AbortError) {
      throw new SparqlResourceError(
        'SPARQL_TIMEOUT',
        'SPARQL request timed out. Simplify the query or retry later.'
      );
    }
    throw err;
  } finally {
    activeSparqlRequests--;
  }
}

const restGet = async <T>(
  pathname: string,
  options: {
    http?: ExternalHttpOptions;
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    retries?: number;
    /** Override default `Accept: application/json` (required for /templates). */
    accept?: string;
  } = {}
): Promise<T> => {
  const url = new URL(`${restBase()}${pathname}`);
  for (const [k, v] of Object.entries(options.params || {})) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const timeoutMs = options.timeoutMs ?? REST_DEFAULT_TIMEOUT_MS;
  const maxRetries = options.retries ?? 2;
  const accept = options.accept ?? 'application/json';

  if (options.http?.externalMcp) {
    return externalHttpJson<T>(url.toString(), {
      headers: { Accept: accept },
      retries: maxRetries,
      signal: options.http.signal,
    });
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(async (signal) => {
        const res = await fetch(url.toString(), {
          headers: { Accept: accept },
          signal: signal as never,
        });
        const text = await res.text();
        if (!res.ok) {
          throw new OrkgUpstreamError(
            `ORKG REST ${pathname} failed (${res.status}): ${text.slice(0, 300)}`,
            res.status,
            text
          );
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new OrkgUpstreamError(
            `ORKG REST ${pathname} returned non-JSON: ${text.slice(0, 200)}`,
            502,
            text
          );
        }
      }, timeoutMs);
    } catch (err) {
      lastErr = err;
      const isUpstream = err instanceof OrkgUpstreamError;
      const retryable =
        isUpstream &&
        (err.status === 502 || err.status === 503 || err.status === 504);
      if (!retryable || attempt === maxRetries) break;
      await sleep(400 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
};

export const orkgRest = {
  /**
   * GET /resources?q=&exact= (paged) or /resources/{id}.
   * If `id` is given, returns a single resource; otherwise returns a paged search.
   */
  async getResource(
    id: string,
    http?: ExternalHttpOptions
  ): Promise<OrkgResource> {
    return restGet<OrkgResource>(`/resources/${encodeURIComponent(id)}`, {
      http,
    });
  },

  async searchResources(
    params: {
      q?: string;
      exact?: boolean;
      classes?: string[]; // e.g. ['Paper']
      page?: number;
      size?: number;
      visibility?:
        | 'ALL_LISTED'
        | 'LISTED'
        | 'UNLISTED'
        | 'FEATURED'
        | 'NON_FEATURED';
    },
    http?: ExternalHttpOptions
  ): Promise<{
    content: OrkgResource[];
    totalElements?: number;
    totalPages?: number;
    number?: number;
  }> {
    const queryParams: Record<string, string | number | undefined> = {
      q: params.q,
      exact: params.exact ? 'true' : undefined,
      page: params.page ?? 0,
      size: params.size ?? 20,
      visibility: params.visibility,
    };
    if (params.classes && params.classes.length > 0) {
      queryParams.include = params.classes.join(',');
    }
    return restGet(`/resources`, { http, params: queryParams });
  },

  async getPaper(id: string, http?: ExternalHttpOptions): Promise<OrkgPaper> {
    return restGet<OrkgPaper>(`/papers/${encodeURIComponent(id)}`, {
      http,
      accept: ORKG_PAPER_ACCEPT,
    });
  },

  async listPapers(
    params: {
      title?: string;
      doi?: string;
      page?: number;
      size?: number;
    },
    http?: ExternalHttpOptions
  ): Promise<{ content: OrkgPaper[]; totalElements?: number }> {
    return restGet(`/papers`, {
      http,
      params: {
        title: params.title,
        doi: params.doi,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
      accept: ORKG_PAPER_ACCEPT,
    });
  },

  async getStatementsBundle(
    resourceId: string,
    options?: { maxLevel?: number },
    http?: ExternalHttpOptions
  ): Promise<{ statements: OrkgStatement[] }> {
    return restGet(`/statements/${encodeURIComponent(resourceId)}/bundle`, {
      http,
      params: { maxLevel: options?.maxLevel },
    });
  },

  async getStatementsBySubject(
    subjectId: string,
    options?: { page?: number; size?: number },
    http?: ExternalHttpOptions
  ): Promise<{ content: OrkgStatement[]; totalElements?: number }> {
    return restGet(`/statements/`, {
      http,
      params: {
        subject_id: subjectId,
        page: options?.page ?? 0,
        size: options?.size ?? 50,
      },
    });
  },

  async getStatements(
    params: {
      subject_id?: string;
      object_id?: string;
      predicate_id?: string;
      page?: number;
      size?: number;
    },
    http?: ExternalHttpOptions
  ): Promise<{ content: OrkgStatement[]; totalElements?: number }> {
    return restGet(`/statements/`, {
      http,
      params: {
        subject_id: params.subject_id,
        object_id: params.object_id,
        predicate_id: params.predicate_id,
        page: params.page ?? 0,
        size: params.size ?? 200,
      },
    });
  },

  async getComparison(
    id: string,
    http?: ExternalHttpOptions
  ): Promise<OrkgComparison> {
    return restGet<OrkgComparison>(`/comparisons/${encodeURIComponent(id)}`, {
      http,
      accept: ORKG_COMPARISON_ACCEPT,
    });
  },

  async listComparisons(
    params: {
      title?: string;
      page?: number;
      size?: number;
    },
    http?: ExternalHttpOptions
  ): Promise<{ content: OrkgComparison[]; totalElements?: number }> {
    return restGet(`/comparisons`, {
      http,
      params: {
        title: params.title,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
      accept: ORKG_COMPARISON_ACCEPT,
    });
  },

  async getTemplate(
    id: string,
    http?: ExternalHttpOptions
  ): Promise<OrkgTemplate> {
    return restGet<OrkgTemplate>(`/templates/${encodeURIComponent(id)}`, {
      http,
      accept: ORKG_TEMPLATE_ACCEPT,
    });
  },

  async listTemplates(
    params: {
      q?: string;
      page?: number;
      size?: number;
    },
    http?: ExternalHttpOptions
  ): Promise<{ content: OrkgTemplate[]; totalElements?: number }> {
    return restGet(`/templates`, {
      http,
      params: {
        q: params.q,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
      accept: ORKG_TEMPLATE_ACCEPT,
    });
  },

  async getClass(
    id: string,
    http?: ExternalHttpOptions
  ): Promise<{ id: string; label?: string; uri?: string }> {
    return restGet(`/classes/${encodeURIComponent(id)}`, { http });
  },

  async getPredicate(
    id: string,
    http?: ExternalHttpOptions
  ): Promise<{ id: string; label?: string }> {
    return restGet(`/predicates/${encodeURIComponent(id)}`, { http });
  },
};

export const ORKG_FRONTEND_BASE = 'https://orkg.org';

/**
 * Build a public ORKG link for a given entity type and id.
 * Used by the chat UI for clickable resource cards.
 */
export const orkgPublicLink = (
  type:
    | 'resource'
    | 'paper'
    | 'comparison'
    | 'template'
    | 'class'
    | 'predicate',
  id: string
): string => {
  switch (type) {
    case 'resource':
      return `${ORKG_FRONTEND_BASE}/resource/${id}`;
    case 'paper':
      return `${ORKG_FRONTEND_BASE}/paper/${id}`;
    case 'comparison':
      return `${ORKG_FRONTEND_BASE}/comparison/${id}`;
    case 'template':
      return `${ORKG_FRONTEND_BASE}/template/${id}`;
    case 'class':
      return `${ORKG_FRONTEND_BASE}/class/${id}`;
    case 'predicate':
      return `${ORKG_FRONTEND_BASE}/predicate/${id}`;
  }
};
