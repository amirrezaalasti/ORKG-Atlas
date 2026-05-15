/**
 * Shared ORKG HTTP client.
 *
 * Centralises calls to the ORKG triplestore (SPARQL) and ORKG REST API so all
 * MCP tools share a single, well-behaved transport with timeouts, retries,
 * and REST base host normalisation (orkg.org → www.orkg.org). SPARQL uses
 * `orkg.org/.../triplestore/sparql` explicitly (POST via www or bare `/triplestore` returns 406).
 */

import fetch from 'node-fetch';

/** Explicit `/sparql` path required; POST via `www.orkg.org`/…`/triplestore` redirects and returns 406. */
const DEFAULT_SPARQL_ENDPOINT = 'https://orkg.org/triplestore/sparql';
const DEFAULT_REST_BASE = 'https://www.orkg.org/api';

/** ORKG template list/detail JSON; plain `application/json` returns 406 on /templates. */
export const ORKG_TEMPLATE_ACCEPT = 'application/vnd.orkg.template.v1+json';

/** Paper list/detail JSON; plain `application/json` returns 400/406 on /papers. */
export const ORKG_PAPER_ACCEPT = 'application/vnd.orkg.paper.v2+json';

/** Comparison list/detail JSON (server accepts v3 and v2; v3 preferred). */
export const ORKG_COMPARISON_ACCEPT = 'application/vnd.orkg.comparison.v3+json';

const SPARQL_DEFAULT_TIMEOUT_MS = 25_000;
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
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
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

const SPARQL_PREFIXES = `
PREFIX r: <http://orkg.org/orkg/resource/>
PREFIX c: <http://orkg.org/orkg/class/>
PREFIX p: <http://orkg.org/orkg/predicate/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
`;

/**
 * Run a SELECT/ASK SPARQL query against ORKG triplestore.
 *
 * Inspects the query for prefixes and prepends the standard ORKG prefixes when missing.
 * Uses POST with application/x-www-form-urlencoded for resilience with long queries.
 */
export async function sparqlQuery(
  query: string,
  options: { timeoutMs?: number; readonly?: boolean } = {}
): Promise<SparqlResponse> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('SPARQL query is empty.');

  const { readonly = true } = options;
  if (readonly) {
    const lower = trimmed.toLowerCase();
    const writeKeywords = [
      /\binsert\b/,
      /\bdelete\b/,
      /\bclear\b/,
      /\bdrop\b/,
      /\bcreate\b/,
      /\bload\b/,
      /\bcopy\b/,
      /\bmove\b/,
      /\badd\b/,
    ];
    if (writeKeywords.some((re) => re.test(lower))) {
      throw new Error(
        'Only read-only SPARQL queries are allowed (no INSERT/DELETE/etc.).'
      );
    }
  }

  const hasPrefixes = /^\s*PREFIX\s/im.test(trimmed);
  const fullQuery = hasPrefixes ? trimmed : SPARQL_PREFIXES + '\n' + trimmed;

  const body = new URLSearchParams({ query: fullQuery });
  const timeoutMs = options.timeoutMs ?? SPARQL_DEFAULT_TIMEOUT_MS;

  return withTimeout(async (signal) => {
    const res = await fetch(sparqlEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body: body.toString(),
      signal: signal as never,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new OrkgUpstreamError(
        `SPARQL request failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        text
      );
    }
    try {
      return JSON.parse(text) as SparqlResponse;
    } catch {
      throw new OrkgUpstreamError(
        `SPARQL response is not valid JSON: ${text.slice(0, 200)}`,
        502,
        text
      );
    }
  }, timeoutMs);
}

const restGet = async <T>(
  pathname: string,
  options: {
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
  async getResource(id: string): Promise<OrkgResource> {
    return restGet<OrkgResource>(`/resources/${encodeURIComponent(id)}`);
  },

  async searchResources(params: {
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
  }): Promise<{
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
    return restGet(`/resources`, { params: queryParams });
  },

  async getPaper(id: string): Promise<OrkgPaper> {
    return restGet<OrkgPaper>(`/papers/${encodeURIComponent(id)}`, {
      accept: ORKG_PAPER_ACCEPT,
    });
  },

  async listPapers(params: {
    title?: string;
    doi?: string;
    page?: number;
    size?: number;
  }): Promise<{ content: OrkgPaper[]; totalElements?: number }> {
    return restGet(`/papers`, {
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
    options?: { maxLevel?: number }
  ): Promise<{ statements: OrkgStatement[] }> {
    return restGet(`/statements/${encodeURIComponent(resourceId)}/bundle`, {
      params: { maxLevel: options?.maxLevel },
    });
  },

  async getStatementsBySubject(
    subjectId: string,
    options?: { page?: number; size?: number }
  ): Promise<{ content: OrkgStatement[]; totalElements?: number }> {
    return restGet(`/statements/`, {
      params: {
        subject_id: subjectId,
        page: options?.page ?? 0,
        size: options?.size ?? 50,
      },
    });
  },

  async getComparison(id: string): Promise<OrkgComparison> {
    return restGet<OrkgComparison>(`/comparisons/${encodeURIComponent(id)}`, {
      accept: ORKG_COMPARISON_ACCEPT,
    });
  },

  async listComparisons(params: {
    title?: string;
    page?: number;
    size?: number;
  }): Promise<{ content: OrkgComparison[]; totalElements?: number }> {
    return restGet(`/comparisons`, {
      params: {
        title: params.title,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
      accept: ORKG_COMPARISON_ACCEPT,
    });
  },

  async getTemplate(id: string): Promise<OrkgTemplate> {
    return restGet<OrkgTemplate>(`/templates/${encodeURIComponent(id)}`, {
      accept: ORKG_TEMPLATE_ACCEPT,
    });
  },

  async listTemplates(params: {
    q?: string;
    page?: number;
    size?: number;
  }): Promise<{ content: OrkgTemplate[]; totalElements?: number }> {
    return restGet(`/templates`, {
      params: {
        q: params.q,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
      accept: ORKG_TEMPLATE_ACCEPT,
    });
  },

  async getClass(
    id: string
  ): Promise<{ id: string; label?: string; uri?: string }> {
    return restGet(`/classes/${encodeURIComponent(id)}`);
  },

  async getPredicate(id: string): Promise<{ id: string; label?: string }> {
    return restGet(`/predicates/${encodeURIComponent(id)}`);
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
