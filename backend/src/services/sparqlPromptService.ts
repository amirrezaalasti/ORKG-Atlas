/**
 * Build template-grounded SPARQL generation prompts for chat / MCP tools.
 */

import {
  discoverPaperLinkPath,
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
} from '../../../shared/promptGenerator.js';
import { sparqlQuery } from './orkg/orkgClient.js';
import { getCanonicalSparqlExamples } from '../config/templateSparqlQueries.js';
import { loadTemplateFlow } from './orkg/templateFlow.js';
import { buildTemplateScopeBanner } from './sparqlTemplateValidation.js';

export interface SparqlSchemaPromptResult {
  templateId: string;
  templateLabel?: string;
  targetClassId?: string;
  predicateCount: number;
  /** Full system prompt for SPARQL generation (includes schema, rules, examples). */
  sparqlPrompt: string;
}

/**
 * Load template flow from ORKG and produce the dynamic SPARQL prompt used by Atlas.
 */
export const buildSparqlSchemaPrompt = async (
  templateId: string,
  researchQuestion?: string
): Promise<SparqlSchemaPromptResult> => {
  const { templates, targetClassId } = await loadTemplateFlow(templateId);
  const mapping = generateTemplateMapping(templates);
  const root = templates.find((t) => t.id === templateId) ?? templates[0];
  const templateLabel = root?.label;
  const paperLinkPath = targetClassId
    ? await discoverPaperLinkPath(targetClassId, async (query) => {
        const res = await sparqlQuery(query);
        return (res.results?.bindings ?? []).map((b) =>
          Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
        );
      })
    : null;

  let sparqlPrompt =
    buildTemplateScopeBanner({
      templateId,
      targetClassId,
      templateLabel,
      paperLinkPath,
    }) +
    generateDynamicSPARQLPrompt(
      mapping,
      templateId,
      templateLabel,
      targetClassId,
      paperLinkPath
    );

  sparqlPrompt += getCanonicalSparqlExamples(templateId, targetClassId);

  if (researchQuestion?.trim()) {
    sparqlPrompt = sparqlPrompt.replace(
      '[Research Question]',
      researchQuestion.trim()
    );
  }

  return {
    templateId,
    templateLabel,
    targetClassId,
    predicateCount: Object.keys(mapping).length,
    sparqlPrompt,
  };
};
