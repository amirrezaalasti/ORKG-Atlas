/**
 * Live per-model pricing from the public OpenRouter catalog, so costs work for
 * any OpenRouter model (the static tables in shared/costCalculator cannot list them all).
 */
import type { ModelPricing } from '../../../shared/costCalculator.js';

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 10 * 60 * 1000;

interface CatalogModel {
  id?: string;
  pricing?: { prompt?: string; completion?: string };
}

let cache: { pricing: Map<string, ModelPricing>; fetchedAt: number } | null =
  null;

/** OpenRouter prices are USD per token; convert to USD per 1M tokens. */
const perMillion = (price: string | undefined): number | null => {
  const n = Number(price);
  return price !== undefined && Number.isFinite(n) ? n * 1_000_000 : null;
};

const loadCatalog = async (): Promise<Map<string, ModelPricing>> => {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.pricing;

  const res = await fetch(CATALOG_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenRouter catalog returned ${res.status}`);
  const json = (await res.json()) as { data?: CatalogModel[] };

  const pricing = new Map<string, ModelPricing>();
  for (const m of json.data ?? []) {
    const input = perMillion(m.pricing?.prompt);
    const output = perMillion(m.pricing?.completion);
    if (m.id && input !== null && output !== null) {
      pricing.set(m.id, { input, output });
    }
  }
  cache = { pricing, fetchedAt: Date.now() };
  return pricing;
};

/** Returns null when the model is unknown or the catalog is unreachable. */
export const getOpenRouterPricing = async (
  modelId: string
): Promise<ModelPricing | null> => {
  try {
    return (await loadCatalog()).get(modelId) ?? null;
  } catch (error) {
    console.error('OpenRouter pricing lookup failed:', error);
    return null;
  }
};
