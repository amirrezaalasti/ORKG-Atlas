/**
 * Template-agnostic SPARQL guard rails driven by ORKG template metadata
 * (contribution class from template flow), not hardcoded template pairs.
 */

export interface TemplateSparqlContext {
  templateId: string;
  targetClassId?: string;
  templateLabel?: string;
}

export type SparqlValidationIssue = {
  message: string;
  hint: string;
};

/** Short banner prepended to orkg_sparql_schema prompts. */
export const buildTemplateScopeBanner = (
  ctx: TemplateSparqlContext
): string => {
  if (!ctx.targetClassId) {
    return (
      `\n## Template scope\n` +
      `- templateId: **${ctx.templateId}**${ctx.templateLabel ? ` (${ctx.templateLabel})` : ''}\n` +
      `- Could not resolve contribution class from ORKG — inspect target_class on the template.\n`
    );
  }
  return (
    `\n## Template scope (required in every template-scoped query)\n` +
    `- templateId: **${ctx.templateId}**${ctx.templateLabel ? ` (${ctx.templateLabel})` : ''}\n` +
    `- contribution class: **orkgc:${ctx.targetClassId}** — use \`?contribution a orkgc:${ctx.targetClassId}\` after \`?paper orkgp:P31 ?contribution\`\n` +
    `- Never use \`a orkgr:${ctx.templateId}\` — template R… IDs are not RDF classes.\n` +
    `- Pass the same templateId to orkg_sparql(query, templateId) so the server can validate the class.\n`
  );
};

const extractContributionClasses = (query: string): Set<string> => {
  const found = new Set<string>();
  const re = /\?\w+\s+(?:a|rdf:type)\s+orkgc:(C\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    found.add(m[1]);
  }
  return found;
};

const usesTemplateResourceAsClass = (query: string): string | null => {
  const re = /\?\w+\s+(?:a|rdf:type)\s+orkgr:(R\d+)/gi;
  const m = re.exec(query);
  return m ? m[1] : null;
};

/**
 * Validate SPARQL against template metadata when templateId is known.
 * Without context, only universal mistakes are caught (template R… as class).
 */
export const validateTemplateScopedSparql = (
  query: string,
  ctx?: TemplateSparqlContext
): SparqlValidationIssue | null => {
  const templateAsClass = usesTemplateResourceAsClass(query);
  if (templateAsClass) {
    return {
      message: `Template resource orkgr:${templateAsClass} is used as an RDF class.`,
      hint: ctx?.targetClassId
        ? `Use ?paper orkgp:P31 ?contribution . ?contribution a orkgc:${ctx.targetClassId} .`
        : 'Call orkg_sparql_schema(templateId) for the contribution class (orkgc:C…).',
    };
  }

  if (!ctx?.targetClassId) return null;

  const expected = ctx.targetClassId;
  const classesUsed = extractContributionClasses(query);
  const linksPaperToContribution = /\borkgp:P31\b/.test(query);

  if (classesUsed.size > 0 && !classesUsed.has(expected)) {
    const wrong = [...classesUsed][0];
    return {
      message: `Query uses orkgc:${wrong} but template ${ctx.templateId} requires orkgc:${expected}.`,
      hint: `Re-run orkg_sparql_schema(${ctx.templateId}) and use only predicates from that schema.`,
    };
  }

  if (linksPaperToContribution && classesUsed.size === 0) {
    return {
      message: `Query links papers via P31 but never declares the template contribution class orkgc:${expected}.`,
      hint: `Add ?contribution a orkgc:${expected} in the WHERE clause.`,
    };
  }

  return null;
};
