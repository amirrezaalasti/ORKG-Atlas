/**
 * Minimal OpenRouter chat client for the evaluation harness. Reads the key from
 * OPENROUTER_API_KEY and records the provider-reported cost of every call.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type Completion = {
  text: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  finishReason: string;
};

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const chatCompletion = async (
  model: string,
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<Completion> => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');

  let lastError = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'ORKG Atlas evaluation',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 16000,
        usage: { include: true },
      }),
    });
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      lastError = `${res.status}: ${text.slice(0, 200)}`;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok)
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    if (json.error)
      throw new Error(
        `OpenRouter error: ${JSON.stringify(json.error).slice(0, 300)}`
      );
    const usage = json.usage ?? {};
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      costUsd: Number(usage.cost ?? 0),
      promptTokens: Number(usage.prompt_tokens ?? 0),
      completionTokens: Number(usage.completion_tokens ?? 0),
      finishReason: String(json.choices?.[0]?.finish_reason ?? ''),
    };
  }
  throw new Error(`OpenRouter failed after retries: ${lastError}`);
};
