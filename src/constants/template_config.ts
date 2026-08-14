import { Query, queries as empiricalQueries } from './queries_chart_info';
import { queries as nlp4reQueries } from './queries_nlp4re_chart_info';
import { SPARQL_QUERIES as empiricalSPARQL } from '../api/SPARQL_QUERIES';
import { SPARQL_QUERIES as nlp4reSPARQL } from '../api/SPARQL_QUERIES_NLP4RE';
import STATISTICS_SPARQL_QUERIES_EMPIRICAL from '../api/STATISTICS_SPARQL_QUERIES';
import STATISTICS_SPARQL_QUERIES_NLP4RE from '../api/STATISTICS_SPARQL_QUERIES_NLP4RE';

interface TemplateConfig {
  title: string;
  queries: Query[];
  sparql: typeof empiricalSPARQL | typeof nlp4reSPARQL;
  statisticsSparql:
    | typeof STATISTICS_SPARQL_QUERIES_EMPIRICAL
    | typeof STATISTICS_SPARQL_QUERIES_NLP4RE;
  statisticsKey: string;
}

export const templateConfig: Record<string, TemplateConfig> = {
  R186491: {
    title: 'Empirical Research Practice',
    queries: empiricalQueries,
    sparql: empiricalSPARQL,
    statisticsSparql: STATISTICS_SPARQL_QUERIES_EMPIRICAL,
    statisticsKey: 'empire-statistics',
  },
  R1544125: {
    title: 'NLP4RE ID Card',
    queries: nlp4reQueries,
    sparql: nlp4reSPARQL,
    statisticsSparql: STATISTICS_SPARQL_QUERIES_NLP4RE,
    statisticsKey: 'nlp4re-statistics',
  },
};

// Helper function to get template configuration with fallback
export const getTemplateConfig = (templateId: string): TemplateConfig => {
  return templateConfig[templateId] || templateConfig['R186491'];
};

/** Built-ins with bundled SPARQL, statistics, and question definitions in ORKG Atlas */
export function getBuiltinTemplateConfig(
  templateId: string | undefined
): TemplateConfig | undefined {
  if (!templateId) return undefined;
  return templateId in templateConfig ? templateConfig[templateId] : undefined;
}

/** Firestore often stores uid (query_1) without a numeric id used in routes. */
export function hydrateQuestionNumericId<
  T extends { id?: unknown; uid?: string },
>(question: T, templateId?: string): T {
  if (typeof question.id === 'number' && Number.isFinite(question.id)) {
    return question;
  }
  const local = templateId
    ? getBuiltinTemplateConfig(templateId)?.queries
    : undefined;
  const match = local?.find((q) => q.uid === question.uid);
  if (match) {
    return { ...question, id: match.id };
  }
  const parsed = String(question.uid || '').match(/query_(\d+)/i);
  if (parsed) {
    return { ...question, id: Number(parsed[1]) };
  }
  return question;
}

export function findBuiltinQuery(
  templateId: string | undefined,
  routeId: string | undefined
): Query | undefined {
  const queries = getBuiltinTemplateConfig(templateId)?.queries;
  if (
    !queries ||
    routeId == null ||
    routeId === '' ||
    routeId === 'undefined'
  ) {
    return undefined;
  }
  const numeric = Number(routeId);
  if (Number.isFinite(numeric)) {
    const byId = queries.find((q) => q.id === numeric);
    if (byId) return byId;
  }
  return queries.find((q) => q.uid === routeId);
}
