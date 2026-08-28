import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadTemplateCoverage,
  type TemplateCoverageResult,
} from '../services/templateCoverage';

const CACHE_KEY = 'orkg-atlas-template-coverage-v1';
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedCoverage {
  result: TemplateCoverageResult;
  fetchedAt: number;
}

function readCache(): CachedCoverage | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCoverage;
    if (!parsed?.result || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedCoverage) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // storage unavailable or quota exceeded
  }
}

export function useTemplateCoverage() {
  const [result, setResult] = useState<TemplateCoverageResult | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (force: boolean) => {
    abortRef.current?.abort();

    if (!force) {
      const cached = readCache();
      if (cached) {
        setResult(cached.result);
        setFetchedAt(cached.fetchedAt);
        setError(null);
        setLoading(false);
        setProgress(null);
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setProgress({ loaded: 0, total: 0 });

    try {
      const next = await loadTemplateCoverage({
        signal: controller.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      });
      if (controller.signal.aborted) return;
      const timestamp = Date.now();
      setResult(next);
      setFetchedAt(timestamp);
      writeCache({ result: next, fetchedAt: timestamp });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : 'Failed to load coverage';
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setProgress(null);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { result, fetchedAt, loading, progress, error, refresh };
}
