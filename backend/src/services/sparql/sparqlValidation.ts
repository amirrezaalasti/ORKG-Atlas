import { Parser } from '@traqula/parser-sparql-1-1';
import {
  SPARQL_POLICY,
  type SparqlPolicy,
  type SparqlQueryType,
} from './sparqlPolicy.js';

export type SparqlValidationResult =
  | { valid: true; queryType: SparqlQueryType }
  | {
      valid: false;
      code:
        | 'SPARQL_SYNTAX_ERROR'
        | 'SPARQL_QUERY_TYPE_FORBIDDEN'
        | 'SPARQL_GRAPH_PATTERN_FORBIDDEN'
        | 'SPARQL_DATASET_FORBIDDEN';
      message: string;
    };

// Parsing is synchronous; reuse the grammar without overlapping parse calls.
const parser = new Parser();

export class SparqlValidationError extends Error {
  readonly code: Extract<SparqlValidationResult, { valid: false }>['code'];

  constructor(failure: Extract<SparqlValidationResult, { valid: false }>) {
    super(failure.message);
    this.name = 'SparqlValidationError';
    this.code = failure.code;
  }
}

/** Parse for prefix preparation only; this does not grant execution permission. */
export function parseSparqlQuery(
  query: string,
  prefixes?: Record<string, string>
): ReturnType<Parser['parse']> {
  try {
    if (!query.trim()) throw new Error('Empty query');
    return prefixes ? parser.parse(query, { prefixes }) : parser.parse(query);
  } catch {
    // Parser messages may contain input IRIs, literals and internal diagnostics.
    throw new SparqlValidationError({
      valid: false,
      code: 'SPARQL_SYNTAX_ERROR',
      message:
        'Invalid SPARQL query. Check SPARQL 1.1 syntax, PREFIX declarations, variable scope, and matching braces/parentheses. Submit one complete query. Use ORDER BY ?x or ORDER BY DESC(?x), not postfix ASC/DESC.',
    });
  }
}

/** Validate without executing, rewriting or returning the query/AST. */
export function validateSparqlQuery(
  query: string,
  policy: SparqlPolicy = SPARQL_POLICY
): SparqlValidationResult {
  let ast: ReturnType<Parser['parse']>;
  try {
    ast = parseSparqlQuery(query);
  } catch (err) {
    if (!(err instanceof SparqlValidationError)) throw err;
    return { valid: false, code: err.code, message: err.message };
  }

  const queryType =
    ast.type === 'query'
      ? policy.allowedQueryTypes.find(
          (allowed) => allowed.toLowerCase() === ast.subType
        )
      : undefined;
  if (!queryType) {
    return {
      valid: false,
      code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
      message: `Query type is not permitted. Allowed query types: ${policy.allowedQueryTypes.join(', ') || 'none'}. SPARQL Update is not permitted.`,
    };
  }

  // Visit all AST children, including expressions, modifiers and subqueries.
  // An iterative walk avoids adding traversal recursion for deeply nested input.
  const pending: unknown[] = [ast];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value !== 'object' || value === null) continue;
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const node = value as Record<string, unknown>;
    if (
      node.type === 'query' &&
      !policy.allowedQueryTypes.some(
        (allowed) => allowed.toLowerCase() === node.subType
      )
    ) {
      return {
        valid: false,
        code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
        message: 'A nested query type is not permitted by the SPARQL policy.',
      };
    }
    if (node.type === 'pattern') {
      const forbidden = policy.forbiddenGraphPatterns.find(
        (pattern) => pattern.toLowerCase() === node.subType
      );
      if (forbidden) {
        return {
          valid: false,
          code: 'SPARQL_GRAPH_PATTERN_FORBIDDEN',
          message: `${forbidden} graph patterns are not permitted. Remove this graph pattern, including nested occurrences.`,
        };
      }
    }
    if (node.type === 'datasetClauses' && Array.isArray(node.clauses)) {
      for (const clause of node.clauses) {
        // Unrecognized dataset clauses also fail closed.
        const permitted =
          (clause.clauseType === 'default' && policy.datasetClauses.FROM) ||
          (clause.clauseType === 'named' &&
            policy.datasetClauses['FROM NAMED']);
        if (!permitted) {
          return {
            valid: false,
            code: 'SPARQL_DATASET_FORBIDDEN',
            message:
              'Dataset clause is not permitted. Remove the disallowed FROM or FROM NAMED clause and use the configured dataset.',
          };
        }
      }
    }
    pending.push(...Object.values(node));
  }

  return { valid: true, queryType };
}
