import { describe, expect, it } from 'vitest';
import { readOnlySparqlViolation } from './sparqlSafety.js';

describe('readOnlySparqlViolation', () => {
  it('allows a select that mentions update words only inside a string or comment', () => {
    const query = `
      # delete this comment, do not insert it
      SELECT ?paper WHERE {
        ?paper rdfs:label "please insert a label" .
      }
    `;
    expect(readOnlySparqlViolation(query)).toBeNull();
  });

  it('rejects update keywords and federated service clauses', () => {
    expect(readOnlySparqlViolation('INSERT DATA { ?s ?p ?o }')).toMatch(
      /INSERT/
    );
    expect(
      readOnlySparqlViolation(
        'SELECT ?s WHERE { SERVICE <http://example.org> { ?s ?p ?o } }'
      )
    ).toMatch(/SERVICE/);
  });
});
