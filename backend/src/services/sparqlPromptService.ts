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
import {
  chosenLinkPath,
  profileTemplates,
  renderProfileSection,
  type InstanceProfile,
} from '../../../shared/instanceProfile.js';

const runRows = async (query: string) => {
  const res = await sparqlQuery(query);
  return (res.results?.bindings ?? []).map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
  );
};

/** Instance profiles change only with curation; cache them for six hours. */
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;
const profileCache = new Map<
  string,
  { at: number; profile: Promise<InstanceProfile> }
>();

/**
 * Aggregate instance profile of a template (paper-to-instance routes and
 * declared-vs-used predicates of the root and reachable sub-templates).
 */
export const getInstanceProfile = (
  templateId: string
): Promise<InstanceProfile> => {
  const hit = profileCache.get(templateId);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
  const profile = (async () => {
    const { templates, targetClassId } = await loadTemplateFlow(templateId);
    if (!targetClassId)
      throw new Error(`Template ${templateId} has no target class`);
    return profileTemplates(templates, targetClassId, runRows);
  })();
  profile.catch(() => profileCache.delete(templateId));
  profileCache.set(templateId, { at: Date.now(), profile });
  return profile;
};

/** Pre-load profiles (e.g. the evaluation's frozen ones) so they are never re-profiled. */
export const seedInstanceProfiles = (
  profiles: Record<string, InstanceProfile>
): void => {
  const farFuture = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
  for (const [id, p] of Object.entries(profiles)) {
    profileCache.set(id, { at: farFuture, profile: Promise.resolve(p) });
  }
};

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
  researchQuestion?: string,
  options: { profile?: boolean } = {}
): Promise<SparqlSchemaPromptResult> => {
  const { templates, targetClassId } = await loadTemplateFlow(templateId);
  const mapping = generateTemplateMapping(templates);
  const root = templates.find((t) => t.id === templateId) ?? templates[0];
  const templateLabel = root?.label;
  // Instance profile: frequency-based paper-to-instance route and declared-vs-used
  // predicates. On failure, fall back to the existence-based route probe.
  let profile: InstanceProfile | null = null;
  if (targetClassId && options.profile !== false) {
    try {
      profile = await getInstanceProfile(templateId);
    } catch (err) {
      console.warn('instance profile failed:', err);
    }
  }
  const paperLinkPath = profile?.attachment
    ? chosenLinkPath(profile)
    : targetClassId
      ? await discoverPaperLinkPath(targetClassId, runRows)
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
  if (profile) sparqlPrompt += `\n${renderProfileSection(profile)}\n`;

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
