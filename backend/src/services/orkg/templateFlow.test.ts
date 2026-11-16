import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { orkgRest } from './orkgClient.js';
import {
  loadTemplateFlow,
  EXTERNAL_HIERARCHY_LIMITS as limits,
} from './templateFlow.js';
import { ExternalHttpError } from '../externalHttp.js';

vi.mock('./orkgClient.js', () => ({
  orkgRest: { getTemplate: vi.fn(), getStatements: vi.fn() },
}));
const template = (id: string, classes: string[] = []) => ({
  id,
  target_class: { id: 'C0' },
  properties: classes.map((classId) => ({
    path: { id: 'P1' },
    class: { id: classId },
  })),
});
const lookup = (id: string) => ({
  content: [
    {
      subject: { id, _class: 'resource' as const, classes: ['NodeShape'] },
      predicate: { id: 'sh:targetClass' },
      object: { id: 'C0', _class: 'class' as const },
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(orkgRest.getTemplate).mockImplementation(async (id) =>
    template(id)
  );
  vi.mocked(orkgRest.getStatements).mockResolvedValue({ content: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

it('loads normal hierarchies and forwards HTTP mode and the shared abort signal', async () => {
  vi.mocked(orkgRest.getTemplate).mockImplementation(async (id) =>
    template(id, id === 'R1' ? ['C2'] : [])
  );
  vi.mocked(orkgRest.getStatements).mockResolvedValue(lookup('R2'));
  const result = await loadTemplateFlow('R1', { externalMcp: true });
  expect(result.templates.map((t) => t.id)).toEqual(['R1', 'R2']);
  expect(result.targetClassId).toBe('C0');
  const http = vi.mocked(orkgRest.getTemplate).mock.calls[0][1]!;
  expect(http.externalMcp).toBe(true);
  expect(http.signal).toBeInstanceOf(AbortSignal);
  expect(orkgRest.getStatements).toHaveBeenCalledWith(expect.any(Object), http);
  expect(orkgRest.getTemplate).toHaveBeenLastCalledWith('R2', http);
});

it('deduplicates class lookups and cyclic template references', async () => {
  vi.mocked(orkgRest.getTemplate).mockImplementation(async (id) =>
    template(id, ['C1', 'C1'])
  );
  vi.mocked(orkgRest.getStatements).mockResolvedValue(lookup('R1'));
  const result = await loadTemplateFlow('R1', { externalMcp: true });
  expect(result.templates).toHaveLength(1);
  expect(orkgRest.getTemplate).toHaveBeenCalledTimes(1);
  expect(orkgRest.getStatements).toHaveBeenCalledTimes(1);
});

it('caps templates, including the root, and reports partial hierarchy', async () => {
  vi.mocked(orkgRest.getTemplate).mockImplementation(async (id) =>
    template(id, ['C' + id.slice(1)])
  );
  vi.mocked(orkgRest.getStatements).mockImplementation(async (params) =>
    lookup('R' + (Number(params.object_id!.slice(1)) + 1))
  );
  const result = await loadTemplateFlow('R1', { externalMcp: true });
  expect(result.templates).toHaveLength(limits.maxTemplates);
  expect(orkgRest.getTemplate).toHaveBeenCalledTimes(limits.maxTemplates);
  expect(result.warnings).toContain(
    'Template hierarchy template limit reached; schema information is incomplete.'
  );
});

it('caps unique lookups even when no subtemplates exist', async () => {
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(
    template(
      'R1',
      Array.from({ length: limits.maxLookups + 10 }, (_, i) => 'C' + i)
    )
  );
  const result = await loadTemplateFlow('R1', { externalMcp: true });
  expect(orkgRest.getStatements).toHaveBeenCalledTimes(limits.maxLookups);
  expect(result.warnings).toContain(
    'Template hierarchy lookup limit reached; schema information is incomplete.'
  );
});

it('runs at most one hierarchy request at a time', async () => {
  let active = 0,
    peak = 0;
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(
    template('R1', ['C1', 'C2', 'C3'])
  );
  vi.mocked(orkgRest.getStatements).mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { content: [] };
  });
  await loadTemplateFlow('R1', { externalMcp: true });
  expect(peak).toBe(1);
});

it('aborts in-flight lookups at the overall deadline and returns partial warnings', async () => {
  vi.useFakeTimers();
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(
    template('R1', ['C1', 'C2'])
  );
  let signal: AbortSignal | undefined;
  vi.mocked(orkgRest.getStatements).mockImplementation(
    (_params, http) =>
      new Promise((_resolve, reject) => {
        signal = http?.signal;
        signal?.addEventListener('abort', () =>
          reject(new ExternalHttpError('EXTERNAL_HTTP_ABORTED'))
        );
      })
  );
  const result = loadTemplateFlow('R1', { externalMcp: true });
  await vi.advanceTimersByTimeAsync(limits.timeoutMs);
  expect((await result).warnings).toContain(
    'Template hierarchy time budget reached; schema information is incomplete.'
  );
  expect(signal?.aborted).toBe(true);
  expect(orkgRest.getStatements).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not reset the overall deadline between successful requests', async () => {
  vi.useFakeTimers();
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(
    template('R1', ['C1', 'C2', 'C3'])
  );
  vi.mocked(orkgRest.getStatements).mockImplementation(
    (_params, http) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve({ content: [] }),
          limits.timeoutMs * 0.6
        );
        http?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new ExternalHttpError('EXTERNAL_HTTP_ABORTED'));
          },
          { once: true }
        );
      })
  );
  const result = loadTemplateFlow('R1', { externalMcp: true });
  await vi.advanceTimersByTimeAsync(limits.timeoutMs);
  expect((await result).warnings?.join(' ')).toContain('time budget');
  expect(orkgRest.getStatements).toHaveBeenCalledTimes(2);
});

it('fails when even the root cannot be loaded within the budget', async () => {
  vi.useFakeTimers();
  vi.mocked(orkgRest.getTemplate).mockImplementation(
    (_id, http) =>
      new Promise((_resolve, reject) => {
        http?.signal?.addEventListener('abort', () =>
          reject(new ExternalHttpError('EXTERNAL_HTTP_ABORTED'))
        );
      })
  );
  const result = expect(
    loadTemplateFlow('R1', { externalMcp: true })
  ).rejects.toThrow('within its budget');
  await vi.advanceTimersByTimeAsync(limits.timeoutMs);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});

it('does not invent missing classes or predicates', async () => {
  vi.mocked(orkgRest.getTemplate).mockResolvedValue({
    id: 'R1',
    properties: [{}],
  });
  const result = await loadTemplateFlow('R1', { externalMcp: true });
  expect(result.targetClassId).toBeUndefined();
  expect(result.templates[0].properties?.[0].path.id).toBe('');
  expect(result.warnings?.join(' ')).toMatch(
    /Target class is missing.*no predicate ID/
  );
});

it('keeps per-HTTP resource failures fail-closed', async () => {
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(template('R1', ['C1']));
  vi.mocked(orkgRest.getStatements).mockRejectedValue(
    new ExternalHttpError('EXTERNAL_HTTP_RESPONSE_TOO_LARGE')
  );
  await expect(
    loadTemplateFlow('R1', { externalMcp: true })
  ).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_RESPONSE_TOO_LARGE' });
});

it('preserves internal parallel lookups, repeated classes and absence of external options', async () => {
  vi.mocked(orkgRest.getTemplate).mockResolvedValue(
    template('R1', ['C1', 'C1'])
  );
  let active = 0,
    peak = 0;
  vi.mocked(orkgRest.getStatements).mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { content: [] };
  });
  const result = await loadTemplateFlow('R1');
  expect(result.warnings).toBeUndefined();
  expect(peak).toBe(2);
  expect(orkgRest.getStatements).toHaveBeenCalledTimes(2);
  expect(orkgRest.getTemplate).toHaveBeenCalledWith('R1', undefined);
});
