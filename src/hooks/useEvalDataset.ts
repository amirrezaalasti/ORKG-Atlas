import { useEffect, useState } from 'react';
import {
  getEvalDataset,
  getEvalDatasets,
  getEvalItem,
  type EvalDatasetCard,
  type EvalDatasetView,
  type EvalItemView,
} from '../services/backendApi';

export function useEvalCatalog() {
  const [datasets, setDatasets] = useState<EvalDatasetCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvalDatasets()
      .then((payload) => {
        if (!cancelled) setDatasets(payload.datasets);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load datasets'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { datasets, error };
}

export function useEvalDataset(setId: string, model: string) {
  const [data, setData] = useState<EvalDatasetView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEvalDataset(setId, model || undefined)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(
            err instanceof Error ? err.message : 'Could not load this set'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId, model]);

  return { data, error, loading };
}

export function useEvalItem(
  setId: string,
  id: string | null,
  model: string,
  query: number,
  offset: number,
  limit: number
) {
  const [item, setItem] = useState<EvalItemView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setItem(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEvalItem(setId, id, {
      model: model || undefined,
      query,
      offset,
      limit,
    })
      .then((payload) => {
        if (!cancelled) setItem(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItem(null);
          setError(
            err instanceof Error ? err.message : 'Could not load this answer'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId, id, model, query, offset, limit]);

  return { item, error, loading };
}
