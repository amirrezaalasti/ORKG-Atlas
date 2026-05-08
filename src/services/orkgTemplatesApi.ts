/**
 * List/browse templates via the public ORKG API (catalog), not in-app Firebase templates.
 */

const ORKG_TEMPLATE_ACCEPT = 'application/vnd.orkg.template.v1+json';

const orkgTemplatesHeaders = {
  Accept: ORKG_TEMPLATE_ACCEPT,
} satisfies HeadersInit;

export function getOrkgApiBase(): string {
  const explicit =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORKG_API_BASE;
  if (explicit && typeof explicit === 'string' && explicit.trim())
    return explicit.replace(/\/$/, '');
  const endpoint =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENDPOINT_URL;
  if (endpoint && typeof endpoint === 'string')
    return `${endpoint.replace(/\/$/, '')}/api`;
  return 'https://orkg.org/api';
}

interface ApiTemplate {
  id: string;
  label?: string;
  description?: string | null;
  target_class?: { id?: string };
}

interface OrkgListResponse {
  content?: ApiTemplate[];
  elements?: ApiTemplate[];
  totalElements?: number;
  total?: number;
  page?: {
    total_elements?: number;
    number?: number;
    size?: number;
  };
}

export interface TemplateListItem {
  id: string;
  label: string;
  description?: string | null;
  target_class?: string;
}

export interface OrkgTemplateDetail {
  id: string;
  label: string;
  description: string | null;
}

/**
 * List/search templates from ORKG API.
 * @param options page, size, q (search), target_class
 */
export async function listTemplates(options?: {
  page?: number;
  size?: number;
  q?: string;
  target_class?: string;
}): Promise<{ content: TemplateListItem[]; totalElements: number }> {
  const base = getOrkgApiBase();
  const params = new URLSearchParams();

  params.set('page', String(options?.page ?? 0));
  params.set('size', String(options?.size ?? 20));
  if (options?.q) params.set('q', options.q);
  if (options?.target_class) params.set('target_class', options.target_class);

  const res = await fetch(`${base}/templates?${params}`, {
    headers: orkgTemplatesHeaders,
  });

  if (!res.ok) {
    return { content: [], totalElements: 0 };
  }

  const data = (await res.json()) as OrkgListResponse;
  const raw = data.content ?? data.elements ?? [];
  const total = Number(
    data.page?.total_elements ?? data.totalElements ?? data.total ?? raw.length
  );

  return {
    content: raw.map((t: ApiTemplate) => ({
      id: t.id,
      label: t.label ?? t.id,
      description: t.description,
      target_class: t.target_class?.id,
    })),
    totalElements: Number.isFinite(total) ? total : raw.length,
  };
}

export type OrkgAtlasTemplateRow = { id: string; title: string };

/** Fetch every page until all templates are collected (handles growing catalogs safely). */
export async function listAllOrkgTemplatesAsAtlasTemplates(): Promise<{
  templates: OrkgAtlasTemplateRow[];
  totalElementsReported: number;
}> {
  const pageSize = 1000;
  const collected: TemplateListItem[] = [];
  let page = 0;
  let totalElements = Infinity;

  while (collected.length < totalElements) {
    const { content, totalElements: total } = await listTemplates({
      page,
      size: pageSize,
    });
    totalElements = total;
    if (!content.length) break;
    collected.push(...content);
    if (content.length < pageSize) break;
    page += 1;
    if (page > 200) break;
  }

  const templates = collected
    .map((t) => ({ id: t.id, title: t.label || t.id }))
    .sort((a, b) =>
      (a.title || a.id).localeCompare(b.title || b.id, undefined, {
        sensitivity: 'base',
      })
    );

  return {
    templates,
    totalElementsReported: Number.isFinite(totalElements)
      ? totalElements
      : templates.length,
  };
}

/** Lightweight reachability probe for UI “Check ORKG” actions. */
export async function checkOrkgTemplatesReachable(): Promise<{
  ok: boolean;
  latencyMs: number;
  status?: number;
}> {
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await fetch(`${getOrkgApiBase()}/templates?page=0&size=1`, {
      headers: orkgTemplatesHeaders,
    });
    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      ok: res.ok,
      latencyMs: Math.round(t1 - t0),
      status: res.status,
    };
  } catch {
    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { ok: false, latencyMs: Math.round(t1 - t0) };
  }
}

export async function getOrkgTemplateDetail(
  templateId: string
): Promise<OrkgTemplateDetail | null> {
  const base = getOrkgApiBase();
  const res = await fetch(
    `${base}/templates/${encodeURIComponent(templateId)}`,
    { headers: orkgTemplatesHeaders }
  );

  if (!res.ok) return null;

  const t = (await res.json()) as ApiTemplate;

  return {
    id: t.id,
    label: t.label ?? t.id,
    description: t.description ?? null,
  };
}
