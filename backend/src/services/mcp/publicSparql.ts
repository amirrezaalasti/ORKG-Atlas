import { PUBLIC_SPARQL_LIMITS } from '../../config/mcp.js';
import { ensureSparqlPrefixes } from '../orkg/orkgClient.js';
import {
  parseSparqlQuery,
  validateSparqlQuery,
} from '../sparql/sparqlValidation.js';

export class PublicSparqlError extends Error {
  readonly code = 'MCP_SPARQL_COST_REJECTED';
  constructor() {
    super(
      `Public SPARQL requires a single fixed-predicate triple anchored to an ORKG resource subject; SELECT only, with LIMIT ${PUBLIC_SPARQL_LIMITS.minSelectLimit}–${PUBLIC_SPARQL_LIMITS.maxSelectLimit} and no nonzero OFFSET. Complex analytics are disabled.`
    );
  }
}

/** Deliberately small query subset; LIMIT alone does not bound query cost. */
export function checkPublicSparql(query: unknown) {
  if (
    typeof query !== 'string' ||
    Buffer.byteLength(query, 'utf8') > PUBLIC_SPARQL_LIMITS.maxQueryBytes
  )
    throw new PublicSparqlError();
  let full: string;
  try {
    full = ensureSparqlPrefixes(query);
  } catch {
    throw new PublicSparqlError();
  }
  const validation = validateSparqlQuery(full);
  if (!validation.valid) throw new PublicSparqlError();
  const ast = parseSparqlQuery(full);
  if (ast.type !== 'query' || ast.subType !== 'select')
    throw new PublicSparqlError();
  // Reject unrecognised/new query features instead of overlooking costly work.
  if (
    Object.keys(ast).some(
      (key) =>
        ![
          'type',
          'subType',
          'context',
          'where',
          'solutionModifiers',
          'datasets',
          'variables',
          'loc',
        ].includes(key)
    )
  )
    throw new PublicSparqlError();
  const modifiers = ast.solutionModifiers;
  const bound = modifiers?.limitOffset;
  if (
    Object.keys(modifiers ?? {}).some((key) => key !== 'limitOffset') ||
    (bound?.offset !== undefined &&
      bound.offset !== PUBLIC_SPARQL_LIMITS.maxOffset) ||
    (ast.subType === 'select' &&
      (!bound ||
        !Number.isInteger(bound.limit) ||
        bound.limit! < PUBLIC_SPARQL_LIMITS.minSelectLimit ||
        bound.limit! > PUBLIC_SPARQL_LIMITS.maxSelectLimit)) ||
    (ast.subType === 'select' &&
      ast.variables.some(
        (variable) =>
          variable.type !== 'wildcard' &&
          !(variable.type === 'term' && variable.subType === 'variable')
      ))
  )
    throw new PublicSparqlError();
  const patterns = ast.where?.patterns ?? [];
  const bgp = patterns[0];
  if (
    patterns.length !== 1 ||
    bgp.type !== 'pattern' ||
    bgp.subType !== 'bgp' ||
    bgp.triples.length !== 1
  )
    throw new PublicSparqlError();
  const triple = bgp.triples[0];
  if (triple.type !== 'triple') throw new PublicSparqlError();
  const subject = triple.subject;
  if (subject.type !== 'term' || subject.subType !== 'namedNode')
    throw new PublicSparqlError();
  // This parser retains prefix/local-name pairs rather than expanded IRIs.
  const prefix = 'prefix' in subject ? subject.prefix : undefined;
  const namespace = [...ast.context]
    .reverse()
    .find((context) => context.subType === 'prefix' && context.key === prefix)
    ?.value.value;
  const subjectIri =
    prefix === undefined ? subject.value : `${namespace ?? ''}${subject.value}`;
  if (
    !/^https?:\/\/orkg\.org\/orkg\/resource\/[A-Za-z0-9_-]+$/.test(
      subjectIri
    ) ||
    triple.predicate.type !== 'term' ||
    triple.predicate.subType !== 'namedNode' ||
    triple.object.type !== 'term' ||
    !['variable', 'namedNode', 'literal'].includes(triple.object.subType)
  )
    throw new PublicSparqlError();
}
