/**
 * Resolve Atlas template statistics from Firestore (with fallbacks when primary doc is stale).
 */

import { db } from '../config/firebase.js';
import {
  ATLAS_BUILTIN_TEMPLATES,
  resolveAtlasTemplateId,
} from '../config/atlasTemplates.js';

export type StatisticDoc = { id: string } & Record<string, unknown>;

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
};

/** Extract a positive paper count from any statistics document shape. */
export const extractPaperCount = (
  doc: Record<string, unknown>
): number | undefined => {
  const direct =
    num(doc.paperCount) ??
    num(doc.totalPapers) ??
    num(doc.processedCount) ??
    num(doc.paper_count);
  if (direct != null && direct > 0) return direct;

  const globalStats = doc.globalStats as Record<string, unknown> | undefined;
  if (globalStats) {
    const fromGlobal = num(globalStats.paperCount);
    if (fromGlobal != null && fromGlobal > 0) return fromGlobal;
  }

  return undefined;
};

const GLOBAL_STATS_KEY_MAP: Record<string, string> = {
  paperCount: 'paperCount',
  total_statements: 'totalStatements',
  total_resources: 'totalResources',
  total_literals: 'totalLiterals',
  total_predicates: 'totalPredicates',
  global_distinct_resources: 'globalDistinctResources',
  global_distinct_literals: 'globalDistinctLiterals',
  global_distinct_predicates: 'globalDistinctPredicates',
};

const mergeAggregateStats = (
  primary: Record<string, unknown> | undefined,
  progress: Record<string, unknown> | undefined
): Record<string, unknown> => {
  const globalStats = progress?.globalStats as
    | Record<string, unknown>
    | undefined;
  const merged: Record<string, unknown> = { ...(primary ?? {}) };

  for (const [snakeKey, camelKey] of Object.entries(GLOBAL_STATS_KEY_MAP)) {
    const v = num(merged[snakeKey]) ?? num(merged[camelKey]);
    if (v != null && v > 0) continue;
    const fromProgress = globalStats
      ? (num(globalStats[snakeKey]) ?? num(globalStats[camelKey]))
      : undefined;
    if (fromProgress != null && fromProgress > 0) {
      merged[snakeKey] = fromProgress;
    }
  }

  const venueCount = num(merged.venueCount);
  if (venueCount == null || venueCount <= 0) {
    const vc = num(progress?.venueCount);
    if (vc != null && vc > 0) merged.venueCount = vc;
  }

  return merged;
};

export interface AtlasTemplateStatsResult {
  templateId: string;
  templateLabel?: string;
  statisticId: string;
  paperCount?: number;
  paperCountSource?: string;
  venueCount?: number;
  data: Record<string, unknown>;
  /** Other statistic document ids in this template (query definitions, progress, etc.). */
  relatedStatisticIds: string[];
}

export const fetchAtlasTemplateStats = async (
  templateIdArg: string,
  statisticIdArg?: string
): Promise<AtlasTemplateStatsResult> => {
  const templateId = resolveAtlasTemplateId(templateIdArg) ?? templateIdArg;
  const builtin = ATLAS_BUILTIN_TEMPLATES[templateId];
  if (!builtin && !statisticIdArg) {
    throw new Error(
      `Template ${templateId} has no precomputed Atlas statistics. Use atlas_list_templates and orkg_sparql for analytics, or pass an explicit statisticId.`
    );
  }

  const primaryId = statisticIdArg ?? builtin!.statisticId;
  const progressId = `${primaryId}-progress`;

  const ref = db
    .collection('Templates')
    .doc(templateId)
    .collection('Statistics');
  const allSnap = await ref.get();
  const docs: StatisticDoc[] = allSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));

  if (docs.length === 0) {
    throw new Error(`No statistics found for template ${templateId}.`);
  }

  const primary = docs.find((d) => d.id === primaryId);
  const progress = docs.find((d) => d.id === progressId);

  if (statisticIdArg && !primary) {
    throw new Error(`Statistic ${statisticIdArg} not found for ${templateId}.`);
  }

  let paperCount: number | undefined;
  let paperCountSource: string | undefined;

  const candidates: StatisticDoc[] = [];
  if (primary) candidates.push(primary);
  if (progress) candidates.push(progress);
  for (const d of docs) {
    if (!candidates.some((c) => c.id === d.id)) candidates.push(d);
  }

  for (const doc of candidates) {
    const n = extractPaperCount(doc);
    if (n != null && n > 0) {
      paperCount = n;
      paperCountSource = doc.id;
      break;
    }
  }

  const mergedData = mergeAggregateStats(primary, progress);
  if (paperCount != null) {
    mergedData.paperCount = paperCount;
  }

  const venueCount =
    num(mergedData.venueCount) ??
    num(
      (
        docs.find((d) => d.id === 'VALUES_COUNT_QUERY') as Record<
          string,
          unknown
        >
      )?.venueCount
    );

  return {
    templateId,
    templateLabel: builtin?.label,
    statisticId: primaryId,
    paperCount,
    paperCountSource,
    venueCount: venueCount && venueCount > 0 ? venueCount : undefined,
    data: mergedData,
    relatedStatisticIds: docs.map((d) => d.id).filter((id) => id !== primaryId),
  };
};
