/**
 * Canonical SPARQL examples injected into orkg_sparql_schema prompts.
 * Uses contribution class from ORKG template flow — no per-template hardcoding here.
 * Domain-specific paths live in shared/promptGenerator.ts (TEMPLATE_SPECIFIC_GUIDANCE).
 */

const listPapersExample = (targetClassId: string, templateId: string) => `
**List / sample papers in this template**
Template resource ${templateId} is NOT an RDF class. Never write \`?paper a orkgr:${templateId}\`.

\`\`\`sparql
# id: list_sample_papers
SELECT ?paper ?title ?doi
WHERE {
  ?paper orkgp:P31 ?contri .
  ?contri a orkgc:${targetClassId} .
  ?paper rdfs:label ?title .
  OPTIONAL { ?paper orkgp:P26 ?doi }
}
LIMIT 10
\`\`\`
`;

const aggregationGuidance = () => `
**Aggregations and charts**
- Traverse predicate paths from the Template Properties section above (do not copy predicates from another template).
- Bind \`rdfs:label\` for any resource shown in tables or charts; GROUP BY label variables, not resource URIs.
- Use \`COUNT(DISTINCT ?paper)\` when counting papers per category.
- For render_chart, set xKey to the label column (e.g. \`metric_label\`), yKeys to numeric aggregates.
`;

/** Markdown block appended to the dynamic SPARQL schema prompt. */
export const getCanonicalSparqlExamples = (
  templateId: string,
  targetClassId?: string
): string => {
  if (!targetClassId) {
    return (
      `\n## SPARQL patterns\n` +
      `Contribution class could not be resolved for template ${templateId}. ` +
      `Use properties from the schema above; anchor papers with \`?paper orkgp:P31 ?contribution\` and the correct \`orkgc:C…\` from the template definition.\n`
    );
  }

  return (
    `\n## Canonical SPARQL examples for template ${templateId}\n` +
    listPapersExample(targetClassId, templateId) +
    aggregationGuidance()
  );
};
