/**
 * Build template-grounded SPARQL generation prompts for chat / MCP tools.
 */

import {
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
} from '../_shared/promptGenerator.js';
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

  let sparqlPrompt =
    buildTemplateScopeBanner({
      templateId,
      targetClassId,
      templateLabel,
    }) +
    generateDynamicSPARQLPrompt(
      mapping,
      templateId,
      templateLabel,
      targetClassId
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
