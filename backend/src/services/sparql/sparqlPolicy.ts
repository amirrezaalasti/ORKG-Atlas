import type { Parser } from '@traqula/parser-sparql-1-1';

type Query = Extract<ReturnType<Parser['parse']>, { type: 'query' }>;
type GraphPattern = Extract<
  NonNullable<Query['where']>['patterns'][number],
  { type: 'pattern' }
>;

export type SparqlQueryType = Uppercase<Query['subType']>;

export interface SparqlPolicy {
  /** Only listed query forms are permitted. Updates are never query forms. */
  readonly allowedQueryTypes: readonly SparqlQueryType[];
  readonly forbiddenGraphPatterns: readonly Uppercase<
    GraphPattern['subType']
  >[];
  readonly datasetClauses: Readonly<Record<'FROM' | 'FROM NAMED', boolean>>;
}

/** Default deny: an unknown or unlisted query type is never permitted. */
export const SPARQL_POLICY: SparqlPolicy = Object.freeze({
  allowedQueryTypes: Object.freeze(['SELECT', 'ASK'] as const),
  forbiddenGraphPatterns: Object.freeze(['SERVICE'] as const),
  datasetClauses: Object.freeze({ FROM: false, 'FROM NAMED': false }),
});

/**
 * Provisional resource budgets, to be reviewed against deployment memory and
 * representative queries. 50 KB bounds parser input; 5 MB bounds response bytes
 * before JSON expansion. Five active requests limit aggregate buffering per
 * process, NOT globally across Vercel instances. The 25 s timeout (default AND
 * maximum) and 1000 output rows retain existing defaults. These budgets do not
 * bound triplestore computation or rewrite a query's LIMIT/meaning.
 */
export { SPARQL_LIMITS } from '../../config/mcp.js';
