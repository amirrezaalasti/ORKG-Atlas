import { describe, expect, it } from 'vitest';
import {
  AIService,
  extractAiProviderError,
  isOpenRouterApiKey,
  type AIConfig,
} from './aiService.js';

const baseConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  provider: 'openrouter',
  openaiModel: 'gpt-4o-mini',
  groqModel: 'llama-3.1-8b-instant',
  mistralModel: 'mistral-large-latest',
  googleModel: 'gemini-2.5-flash',
  openrouterModel: 'openai/gpt-oss-120b',
  openaiApiKey: 'sk-or-v1-env-key',
  groqApiKey: '',
  mistralApiKey: '',
  googleApiKey: '',
  ...overrides,
});

describe('isOpenRouterApiKey', () => {
  it('detects OpenRouter keys', () => {
    expect(isOpenRouterApiKey('sk-or-v1-abc')).toBe(true);
    expect(isOpenRouterApiKey('sk-proj-openai')).toBe(false);
  });
});

describe('getEffectiveProvider', () => {
  it('keeps openrouter as openrouter', () => {
    const service = new AIService(baseConfig());
    expect(service.getEffectiveProvider('openrouter')).toBe('openrouter');
  });

  it('remaps openai to openrouter when the key is an OpenRouter credential', () => {
    const service = new AIService(baseConfig({ provider: 'openai' }));
    expect(service.getEffectiveProvider('openai')).toBe('openrouter');
  });

  it('does not remap groq just because an OpenRouter env key is present', () => {
    const service = new AIService(
      baseConfig({ provider: 'openrouter', groqApiKey: 'gsk-test' })
    );
    expect(service.getEffectiveProvider('groq')).toBe('groq');
  });

  it('does not remap google', () => {
    const service = new AIService(baseConfig({ googleApiKey: 'gemini-key' }));
    expect(service.getEffectiveProvider('google')).toBe('google');
  });
});

describe('extractAiProviderError', () => {
  it('reads statusCode from APICallError-shaped errors', () => {
    const error = Object.assign(new Error('User not found.'), {
      statusCode: 401,
    });
    expect(extractAiProviderError(error)).toEqual({
      message: 'User not found.',
      status: 401,
    });
  });

  it('unwraps lastError from RetryError-shaped errors', () => {
    const lastError = Object.assign(new Error('User not found.'), {
      statusCode: 401,
    });
    const error = Object.assign(new Error('Failed after 3 attempts.'), {
      lastError,
    });
    expect(extractAiProviderError(error)).toEqual({
      message: 'Failed after 3 attempts. — User not found.',
      status: 401,
    });
  });

  it('stringifies non-Error values', () => {
    expect(extractAiProviderError('boom')).toEqual({ message: 'boom' });
  });
});
