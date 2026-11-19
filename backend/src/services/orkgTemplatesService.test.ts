import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../config/firebase.js';
import { EXTERNAL_CATALOG_LIMITS } from '../config/mcp.js';
import { orkgRest } from './orkg/orkgClient.js';
import {
  listAllExternalOrkgTemplates,
  listExternalOrkgTemplates,
  listOrkgTemplates,
} from './orkgTemplatesService.js';

vi.mock('../config/firebase.js', () => ({ db: { collection: vi.fn() } }));
vi.mock('../config/atlasTemplates.js', () => ({
  ATLAS_BUILTIN_TEMPLATES: {},
  listBuiltinAtlasTemplates: () => [],
}));
vi.mock('./orkg/orkgClient.js', async (original) => ({
  ...(await original<typeof import('./orkg/orkgClient.js')>()),
  orkgRest: { listTemplates: vi.fn() },
}));

const list = vi.mocked(orkgRest.listTemplates);
beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue({ content: [] });
  vi.mocked(db.collection).mockReturnValue({
    get: async () => ({
      docs: [{ id: 'RPrivate', data: () => ({ title: 'Atlas only' }) }],
    }),
  } as unknown as ReturnType<typeof db.collection>);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('external catalog isolation and validation', () => {
  it('projects public fields without querying Firestore or exposing Atlas metadata', async () => {
    list.mockResolvedValue({
      content: [
        { id: 'R1', label: 'Public', target_class: 'C1', private: 'secret' },
      ],
      totalElements: 1,
    });
    const result = await listExternalOrkgTemplates();
    expect(result).toEqual({
      items: [
        {
          id: 'R1',
          label: 'Public',
          targetClassId: 'C1',
          link: 'https://orkg.org/template/R1',
        },
      ],
      page: 0,
      total: 1,
    });
    expect(list).toHaveBeenCalledWith(
      { q: undefined, page: 0, size: 50 },
      { externalMcp: true }
    );
    expect(db.collection).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('preserves the internal merged catalog and its existing call signature', async () => {
    list.mockResolvedValue({ content: [{ id: 'R1', label: 'Public' }] });
    const result = await listOrkgTemplates({ query: ' q ', page: 2, size: 5 });
    expect(result.items.map((item) => item.id)).toEqual(['R1', 'RPrivate']);
    expect(result.items[1]).toMatchObject({
      label: 'Atlas only',
      inAtlas: true,
    });
    expect(list).toHaveBeenCalledWith({ q: 'q', page: 2, size: 5 });
    expect(db.collection).toHaveBeenCalledWith('Templates');
  });

  it.each([
    null,
    {},
    { content: [{ id: '' }] },
    { content: Array.from({ length: 101 }, () => ({ id: 'R1' })) },
  ])('rejects malformed or oversized pages: %j', async (value) => {
    list.mockResolvedValue(
      value as unknown as Awaited<ReturnType<typeof orkgRest.listTemplates>>
    );
    await expect(listExternalOrkgTemplates()).rejects.toMatchObject({
      code: 'TEMPLATE_CATALOG_INVALID_RESPONSE',
      message:
        'ORKG template catalog returned an invalid or oversized page. Please retry later.',
    });
  });

  it.each([undefined, -1, '5', NaN])(
    'omits unreliable totals: %s',
    async (total) => {
      list.mockResolvedValue({
        content: [],
        totalElements: total,
      } as unknown as Awaited<ReturnType<typeof orkgRest.listTemplates>>);
      expect(await listExternalOrkgTemplates()).not.toHaveProperty('total');
    }
  );

  it('sanitizes first-page upstream failures', async () => {
    list.mockRejectedValue(new Error('private URL and secret'));
    await expect(listAllExternalOrkgTemplates()).rejects.toMatchObject({
      code: 'TEMPLATE_CATALOG_UPSTREAM_ERROR',
      message: 'ORKG template catalog could not be loaded. Please retry later.',
    });
  });
});

describe('bounded external pagination', () => {
  it('deduplicates overlapping pages and preserves the requested filter and start page', async () => {
    list
      .mockResolvedValueOnce({ content: [{ id: 'R1' }, { id: 'R2' }] })
      .mockResolvedValueOnce({ content: [{ id: 'R2' }, { id: 'R3' }] })
      .mockResolvedValueOnce({ content: [] });
    const result = await listAllExternalOrkgTemplates({
      page: 2,
      size: 2,
      query: ' metric ',
    });
    expect(result.items.map((item) => item.id)).toEqual(['R1', 'R2', 'R3']);
    expect(result).toMatchObject({ page: 2, truncated: false });
    expect(list.mock.calls.map(([params]) => params)).toEqual(
      [2, 3, 4].map((page) => ({ q: 'metric', page, size: 2 }))
    );
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('returns continuation at the page cap and resumes without replaying accepted pages', async () => {
    list.mockImplementation(async ({ page = 0 }) => ({
      content: page < 21 ? [{ id: `R${page}` }] : [],
    }));
    const first = await listAllExternalOrkgTemplates({ size: 1, query: 'q' });
    expect(first).toMatchObject({
      truncated: true,
      stopReason: 'page_limit',
      continuation: {
        page: EXTERNAL_CATALOG_LIMITS.maxPages,
        size: 1,
        all: true,
        query: 'q',
      },
    });
    expect(list).toHaveBeenCalledTimes(EXTERNAL_CATALOG_LIMITS.maxPages);
    const second = await listAllExternalOrkgTemplates(first.continuation);
    expect(second.page).toBe(EXTERNAL_CATALOG_LIMITS.maxPages);
    expect(second.items.map((item) => item.id)).toEqual(['R20']);
    expect(second.truncated).toBe(false);
    expect(list.mock.calls.every(([params]) => params.q === 'q')).toBe(true);
  });

  it('does not partly consume a page exceeding the remaining item budget', async () => {
    list.mockImplementation(async ({ page = 0 }) => ({
      content: Array.from({ length: 99 }, (_, i) => ({
        id: `R${page * 99 + i}`,
      })),
    }));
    const result = await listAllExternalOrkgTemplates({ size: 99 });
    expect(result.items).toHaveLength(990);
    expect(result).toMatchObject({
      truncated: true,
      stopReason: 'item_limit',
      continuation: { page: 10 },
    });
  });

  it('bounds aggregate UTF-8 bytes and keeps the unconsumed page in continuation', async () => {
    list.mockImplementation(async ({ page }) => ({
      content: [{ id: `R${page}`, description: 'é'.repeat(1_300_000) }],
    }));
    const result = await listAllExternalOrkgTemplates({ size: 1 });
    expect(result.items).toHaveLength(1);
    expect(result).toMatchObject({
      stopReason: 'size_limit',
      continuation: { page: 1 },
    });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      EXTERNAL_CATALOG_LIMITS.maxBytes
    );
  });

  it('stops repeated pages without progress', async () => {
    list.mockResolvedValue({ content: [{ id: 'R1' }] });
    expect(await listAllExternalOrkgTemplates({ size: 1 })).toMatchObject({
      truncated: true,
      stopReason: 'no_progress',
      continuation: { page: 1, size: 1, all: true },
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejects the first page when a short page contradicts its total', async () => {
    list.mockResolvedValue({ content: [{ id: 'R1' }], totalElements: 10 });
    await expect(listAllExternalOrkgTemplates()).rejects.toMatchObject({
      code: 'TEMPLATE_CATALOG_INVALID_RESPONSE',
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('keeps a contradictory later page unconsumed and retries without skipping items', async () => {
    list
      .mockResolvedValueOnce({
        content: [{ id: 'R1' }, { id: 'R2' }],
        totalElements: 4,
      })
      .mockResolvedValueOnce({ content: [{ id: 'R3' }], totalElements: 4 });
    const first = await listAllExternalOrkgTemplates({
      size: 2,
      query: 'metric',
    });
    expect(first.items.map((item) => item.id)).toEqual(['R1', 'R2']);
    expect(first).toMatchObject({
      truncated: true,
      stopReason: 'invalid_response',
      continuation: { page: 1, size: 2, all: true, query: 'metric' },
    });
    expect(first).not.toHaveProperty('total');
    list
      .mockResolvedValueOnce({
        content: [{ id: 'R3' }, { id: 'R4' }],
        totalElements: 4,
      })
      .mockResolvedValueOnce({ content: [], totalElements: 4 });
    const resumed = await listAllExternalOrkgTemplates(first.continuation);
    expect(resumed.truncated).toBe(false);
    expect([...first.items, ...resumed.items].map((item) => item.id)).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
    ]);
    expect(list.mock.calls.map(([params]) => params.page)).toEqual([
      0, 1, 1, 2,
    ]);
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('returns explicit partial results after a later upstream failure', async () => {
    list
      .mockResolvedValueOnce({ content: [{ id: 'R1' }] })
      .mockRejectedValueOnce(new Error('private secret'));
    const result = await listAllExternalOrkgTemplates({ size: 1 });
    expect(result).toMatchObject({
      truncated: true,
      stopReason: 'upstream_error',
      continuation: { page: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/private|secret/);
  });

  it('shares a total deadline and cancellation signal across pages', async () => {
    vi.useFakeTimers();
    list
      .mockResolvedValueOnce({ content: [{ id: 'R1' }] })
      .mockImplementationOnce(
        (_params, http) =>
          new Promise((_resolve, reject) => {
            http?.signal?.addEventListener('abort', () =>
              reject(new Error('stopped'))
            );
          })
      );
    const pending = listAllExternalOrkgTemplates({ size: 1 });
    await vi.advanceTimersByTimeAsync(EXTERNAL_CATALOG_LIMITS.timeoutMs);
    expect(await pending).toMatchObject({
      stopReason: 'timeout',
      continuation: { page: 1 },
    });
    expect(list.mock.calls[0][1]?.signal).toBe(list.mock.calls[1][1]?.signal);
    expect(list.mock.calls[0][1]?.externalMcp).toBe(true);
    expect(list.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
