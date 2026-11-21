/**
 * Reads the frozen Atlas evaluation sets (questions, gold answers, run scores)
 * from the backend. There is no backup fallback: the files live with the API.
 */
import { apiRequest } from './client';

export interface EvalDatasetCard {
  id: string;
  label: string;
  blurb: string;
  questionCount: number;
  frozenAt: string | null;
  headlineModel: string | null;
  headlineExact: number | null;
  headlineF1: number | null;
}

export interface EvalQuestionSummary {
  id: string;
  question: string;
  title: string | null;
  templateId: string | null;
  templateTitle: string | null;
  field: string | null;
  kind: string | null;
  stress: string | null;
  expectEmpty: boolean;
  answerColumns: string[];
  answerRows: number;
  queryCount: number;
  exactRate: number | null;
  meanF1: number | null;
}

export interface EvalResultRow {
  model: string;
  config: string;
  questions: number;
  exact: number;
  f1: number;
}

export interface EvalDatasetView {
  id: string;
  label: string;
  blurb: string;
  source: string | null;
  frozenAt: string | null;
  endpoint: string | null;
  model: string;
  models: string[];
  questions: EvalQuestionSummary[];
  results: EvalResultRow[];
}

export interface EvalConfigScore {
  config: string;
  runs: number;
  exactRate: number;
  meanF1: number;
}

export interface EvalItemView extends EvalQuestionSummary {
  model: string;
  goldQueries: string[];
  queries: Array<{
    index: number;
    ok: boolean;
    columns: string[];
    rowCount: number;
    error: string | null;
  }>;
  queryIndex: number;
  offset: number;
  limit: number;
  rows: Record<string, string>[];
  scores: EvalConfigScore[];
}

export const getEvalDatasets = () =>
  apiRequest<{ datasets: EvalDatasetCard[] }>('/api/eval-dataset');

export const getEvalDataset = (setId: string, model?: string) => {
  const params = new URLSearchParams();
  if (model) params.set('model', model);
  const query = params.toString();
  return apiRequest<EvalDatasetView>(
    `/api/eval-dataset/${setId}${query ? `?${query}` : ''}`
  );
};

export const getEvalItem = (
  setId: string,
  id: string,
  options: { model?: string; query?: number; offset?: number; limit?: number }
) => {
  const params = new URLSearchParams({ id });
  if (options.model) params.set('model', options.model);
  if (options.query) params.set('query', String(options.query));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.limit) params.set('limit', String(options.limit));
  return apiRequest<EvalItemView>(
    `/api/eval-dataset/${setId}/item?${params.toString()}`
  );
};
