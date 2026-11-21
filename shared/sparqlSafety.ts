/**
 * Read-only check for SPARQL text before it is sent to an endpoint.
 * Strings and comments are removed first, so a word such as "insert" inside a
 * literal or a comment is not treated as an update. This is still a keyword
 * scan, not a SPARQL parser.
 */

const WRITE_OR_FEDERATION =
  /\b(insert|delete|clear|drop|create|load|copy|move|add|service)\b/i;

const skipQuoted = (query: string, start: number, quote: string): number => {
  const triple = quote + quote + quote;
  if (query.startsWith(triple, start)) {
    const end = query.indexOf(triple, start + 3);
    return end === -1 ? query.length : end + 3;
  }
  let i = start + 1;
  while (i < query.length) {
    if (query[i] === '\\') {
      i += 2;
      continue;
    }
    if (query[i] === quote) return i + 1;
    i += 1;
  }
  return query.length;
};

/** Query text with comments and quoted literals replaced by spaces. */
export const sparqlCodeForSafetyScan = (query: string): string => {
  let out = '';
  let i = 0;
  while (i < query.length) {
    const ch = query[i];
    if (ch === '#') {
      while (i < query.length && query[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuoted(query, i, ch);
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};

/**
 * Returns a rejection message when the query contains an update keyword or
 * SERVICE outside strings and comments. Returns null when the scan finds none.
 */
export const readOnlySparqlViolation = (query: string): string | null => {
  const match = sparqlCodeForSafetyScan(query).match(WRITE_OR_FEDERATION);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (word === 'service') {
    return 'Federated SERVICE queries are not allowed.';
  }
  return `Only read-only SPARQL queries are allowed (found ${word.toUpperCase()}).`;
};
