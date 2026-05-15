/**
 * Provider → model registry for the chat page.
 *
 * Centralised so that switching the provider in the header always picks a
 * sane, *valid* default model (preventing situations like sending the
 * OpenRouter-style id `openai/gpt-4o-mini` to the OpenAI API directly,
 * which produces a `model not found` network error).
 */

import type { AIProvider } from '../../store/slices/aiSlice';
import {
  OPENAI_MODELS,
  GROQ_MODELS,
  MISTRAL_MODELS,
  GOOGLE_MODELS,
} from '../../store/slices/aiSlice';
import { OPENROUTER_DEFAULT_MODEL } from '../../constants/openrouter_models';

export interface ProviderInfo {
  id: AIProvider;
  label: string;
  /** Models that are reasonable defaults to surface in a dropdown. */
  models: readonly string[];
  /** Sensible default model when the provider is freshly selected. */
  defaultModel: string;
  /** Hex accent for the provider chip. */
  accent: string;
}

const POPULAR_OPENROUTER_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
  'mistralai/mistral-large-2411',
] as const;

export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    models: POPULAR_OPENROUTER_MODELS,
    defaultModel: OPENROUTER_DEFAULT_MODEL,
    accent: '#5b8def',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    models: OPENAI_MODELS,
    defaultModel: 'gpt-4o-mini',
    accent: '#10a37f',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    models: GROQ_MODELS,
    defaultModel: 'llama-3.3-70b-versatile',
    accent: '#f55036',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    models: MISTRAL_MODELS,
    defaultModel: 'mistral-small-latest',
    accent: '#ff7000',
  },
  google: {
    id: 'google',
    label: 'Google',
    models: GOOGLE_MODELS,
    defaultModel: 'gemini-2.0-flash',
    accent: '#4285f4',
  },
};

/**
 * Resolve a model string against a provider. If the model isn't valid for the
 * provider (or is empty), the provider's `defaultModel` is returned instead.
 */
export const resolveModelForProvider = (
  provider: AIProvider,
  model: string | undefined
): string => {
  const info = PROVIDERS[provider];
  if (!info) return model ?? '';
  if (!model) return info.defaultModel;
  // OpenRouter accepts arbitrary `vendor/model` strings, so don't restrict.
  if (provider === 'openrouter') return model;
  return (info.models as readonly string[]).includes(model)
    ? model
    : info.defaultModel;
};

export const PROVIDER_LIST: ProviderInfo[] = [
  PROVIDERS.openrouter,
  PROVIDERS.openai,
  PROVIDERS.google,
  PROVIDERS.groq,
  PROVIDERS.mistral,
];
