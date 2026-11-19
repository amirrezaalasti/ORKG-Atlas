import { EXTERNAL_CATALOG_LIMITS, MCP_TOOL_LIMITS } from '../config/mcp.js';
import type { ExternalHttpOptions } from './externalHttp.js';
import { checkExecution, linkExecutionAbort } from './mcp/executionScope.js';
/**
 * Discover ORKG templates from the ORKG API and merge Atlas metadata.
 */

import { z } from 'zod';
import {
  ATLAS_BUILTIN_TEMPLATES,
  listBuiltinAtlasTemplates,
} from '../config/atlasTemplates.js';
import { orkgPublicLink, orkgRest } from './orkg/orkgClient.js';

export interface TemplateListItem {
  id: string;
  label: string;
  description?: string;
  targetClassId?: string;
  link: string;
  /** Listed in Atlas Firestore / has bundled questions or stats. */
  inAtlas: boolean;
  hasPrecomputedStats: boolean;
}

export const listOrkgTemplates = async (options?: {
  query?: string;
  page?: number;
  size?: number;
}): Promise<{ items: TemplateListItem[]; total?: number; page: number }> => {
  const page = options?.page ?? 0;
  const size = Math.min(options?.size ?? 50, 100);

  // Only the internal merged catalog requires Firestore.
  const { db } = await import('../config/firebase.js');

  const [orkgRes, firestoreSnap] = await Promise.all([
    orkgRest.listTemplates({
      q: options?.query?.trim() || undefined,
      page,
      size,
    }),
    db.collection('Templates').get(),
  ]);

  const firestoreById = new Map<
    string,
    { title?: string; description?: string }
  >();
  firestoreSnap.docs.forEach((d) => {
    const data = d.data() as { title?: string; description?: string };
    firestoreById.set(d.id, data);
  });

  const builtins = listBuiltinAtlasTemplates();
  const builtinIds = new Set(builtins.map((b) => b.id));

  const items: TemplateListItem[] = (orkgRes.content ?? []).map((t) => {
    const targetClassId =
      typeof t.target_class === 'object' && t.target_class?.id
        ? t.target_class.id
        : typeof t.target_class === 'string'
          ? t.target_class
          : ATLAS_BUILTIN_TEMPLATES[t.id]?.targetClassId;

    const fs = firestoreById.get(t.id);
    const builtin = ATLAS_BUILTIN_TEMPLATES[t.id];

    return {
      id: t.id,
      label: t.label ?? fs?.title ?? builtin?.label ?? t.id,
      description: t.description ?? fs?.description,
      targetClassId: targetClassId ?? builtin?.targetClassId,
      link: orkgPublicLink('template', t.id),
      inAtlas: !!fs || !!builtin,
      hasPrecomputedStats: !!builtin,
    };
  });

  const seen = new Set(items.map((i) => i.id));

  for (const b of builtins) {
    if (seen.has(b.id)) continue;
    const fs = firestoreById.get(b.id);
    items.unshift({
      id: b.id,
      label: b.label,
      description: fs?.description,
      targetClassId: b.targetClassId,
      link: orkgPublicLink('template', b.id),
      inAtlas: true,
      hasPrecomputedStats: true,
    });
  }

  for (const [id, fs] of firestoreById) {
    if (seen.has(id)) continue;
    items.push({
      id,
      label: fs.title ?? id,
      description: fs.description,
      targetClassId: ATLAS_BUILTIN_TEMPLATES[id]?.targetClassId,
      link: orkgPublicLink('template', id),
      inAtlas: true,
      hasPrecomputedStats: !!ATLAS_BUILTIN_TEMPLATES[id],
    });
  }

  return {
    items,
    total: orkgRes.totalElements ?? items.length,
    page,
  };
};

export class ExternalTemplateCatalogError extends Error {
  constructor(
    public readonly code:
      | 'TEMPLATE_CATALOG_INVALID_RESPONSE'
      | 'TEMPLATE_CATALOG_UPSTREAM_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'ExternalTemplateCatalogError';
  }
}

/** One ORKG page only. Atlas metadata and local templates are not exposed. */
export const listExternalOrkgTemplates = async (
  options?: {
    query?: string;
    page?: number;
    size?: number;
  },
  http?: ExternalHttpOptions
) => {
  const page = options?.page ?? 0;
  const size = Math.min(
    options?.size ?? MCP_TOOL_LIMITS.defaultPageSize,
    MCP_TOOL_LIMITS.maxPageSize
  );
  let response: unknown;
  try {
    response = await orkgRest.listTemplates(
      {
        q: options?.query?.trim() || undefined,
        page,
        size,
      },
      { ...http, externalMcp: true }
    );
  } catch {
    throw new ExternalTemplateCatalogError(
      'TEMPLATE_CATALOG_UPSTREAM_ERROR',
      'ORKG template catalog could not be loaded. Please retry later.'
    );
  }
  // Strip unrelated fields and reject invalid pages rather than returning partial data.
  const parsed = z
    .object({
      content: z
        .array(
          z.object({
            id: z.string().refine((id) => id.trim().length > 0),
            label: z.string().nullish(),
            description: z.string().nullish(),
            target_class: z
              .union([z.string(), z.object({ id: z.string().nullish() })])
              .nullish(),
          })
        )
        .max(size),
      totalElements: z.unknown().optional(),
    })
    .safeParse(response);
  if (!parsed.success) {
    throw new ExternalTemplateCatalogError(
      'TEMPLATE_CATALOG_INVALID_RESPONSE',
      'ORKG template catalog returned an invalid or oversized page. Please retry later.'
    );
  }
  const items = parsed.data.content.map((template) => {
    const targetClassId =
      typeof template.target_class === 'string'
        ? template.target_class
        : template.target_class?.id;
    return {
      id: template.id,
      ...(template.label != null && { label: template.label }),
      ...(template.description != null && {
        description: template.description,
      }),
      ...(targetClassId != null && { targetClassId }),
      link: orkgPublicLink('template', template.id),
    };
  });
  const total = parsed.data.totalElements;
  return {
    items,
    page,
    ...(typeof total === 'number' &&
      Number.isSafeInteger(total) &&
      total >= 0 && { total }),
  };
};

/** Conservative provisional budgets, shared by all external full-catalog calls. */
export { EXTERNAL_CATALOG_LIMITS } from '../config/mcp.js';

type CatalogPage = Awaited<ReturnType<typeof listExternalOrkgTemplates>>;
type CatalogStopReason =
  | 'page_limit'
  | 'item_limit'
  | 'size_limit'
  | 'timeout'
  | 'upstream_error'
  | 'invalid_response'
  | 'no_progress';

/** Fetch complete validated pages only; the continuation always retries an unconsumed page. */
export async function listAllExternalOrkgTemplates(
  options: {
    query?: string;
    page?: number;
    size?: number;
  } = {}
) {
  const startPage = options.page ?? 0;
  const size = Math.min(
    options.size ?? MCP_TOOL_LIMITS.defaultPageSize,
    MCP_TOOL_LIMITS.maxPageSize
  );
  const query = options.query?.trim() || undefined;
  const items: CatalogPage['items'] = [];
  const seen = new Set<string>();
  let nextPage = startPage;
  let pagesRead = 0;
  let total: number | undefined;
  let totalUnreliable = false;
  const controller = new AbortController();
  const unlink = linkExecutionAbort(controller);
  const deadline = Date.now() + EXTERNAL_CATALOG_LIMITS.timeoutMs;
  const timer = setTimeout(
    () => controller.abort(),
    EXTERNAL_CATALOG_LIMITS.timeoutMs
  );
  const expired = () => {
    checkExecution();
    if (Date.now() >= deadline) controller.abort();
    return controller.signal.aborted;
  };
  const result = (stopReason?: CatalogStopReason) => ({
    items,
    page: startPage,
    ...(!totalUnreliable && total !== undefined && { total }),
    truncated: stopReason !== undefined,
    ...(stopReason && {
      stopReason,
      continuation: {
        page: nextPage,
        size,
        all: true,
        ...(query && { query }),
      },
    }),
  });
  try {
    while (pagesRead < EXTERNAL_CATALOG_LIMITS.maxPages) {
      if (expired()) return result('timeout');
      let page: CatalogPage;
      try {
        page = await listExternalOrkgTemplates(
          { query, page: nextPage, size },
          { signal: controller.signal }
        );
      } catch (err) {
        // Preserve the existing error envelope when no page was successfully obtained.
        if (pagesRead === 0) throw err;
        return result(
          expired()
            ? 'timeout'
            : err instanceof ExternalTemplateCatalogError &&
                err.code === 'TEMPLATE_CATALOG_INVALID_RESPONSE'
              ? 'invalid_response'
              : 'upstream_error'
        );
      }
      if (expired()) return result('timeout');
      const end = nextPage * size + page.items.length;
      // A contradictory short page is unconsumed, including its deduplication state.
      if (
        page.items.length < size &&
        page.total !== undefined &&
        page.total > end
      ) {
        if (pagesRead === 0)
          throw new ExternalTemplateCatalogError(
            'TEMPLATE_CATALOG_INVALID_RESPONSE',
            'ORKG template catalog returned an incomplete page. Please retry later.'
          );
        totalUnreliable = true;
        return result('invalid_response');
      }
      if (
        page.total === undefined ||
        page.total < end ||
        (total !== undefined && total !== page.total)
      )
        totalUnreliable = true;
      total = page.total;
      // Deduplicate both overlapping pages and duplicate IDs within a page.
      const pageIds = new Set<string>();
      const fresh = page.items.filter((item) => {
        if (seen.has(item.id) || pageIds.has(item.id)) return false;
        pageIds.add(item.id);
        return true;
      });
      if (items.length + fresh.length > EXTERNAL_CATALOG_LIMITS.maxItems)
        return result('item_limit');
      // Include result metadata and continuation in the aggregate byte budget.
      const candidate = {
        ...result('invalid_response'),
        items: [...items, ...fresh],
      };
      // Reserve the longest stop reason and the next page's continuation metadata.
      if (candidate.continuation) candidate.continuation.page++;
      if (
        Buffer.byteLength(JSON.stringify(candidate), 'utf8') >
        EXTERNAL_CATALOG_LIMITS.maxBytes
      )
        return result('size_limit');
      if (page.items.length > 0 && fresh.length === 0)
        return result('no_progress');
      for (const id of pageIds) seen.add(id);
      items.push(...fresh);
      nextPage++;
      pagesRead++;
      // Do not use total alone to claim completion: it may be stale or inconsistent.
      if (page.items.length < size) return result();
      if (items.length >= EXTERNAL_CATALOG_LIMITS.maxItems)
        return result('item_limit');
    }
    return result('page_limit');
  } finally {
    clearTimeout(timer);
    unlink();
  }
}
