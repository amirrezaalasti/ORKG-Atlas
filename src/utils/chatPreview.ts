/**
 * ORKG URLs opened in the chat side panel (native preview — orkg.org blocks iframes).
 */

import { extractOrkgResourceId } from './orkgResource';

const PREVIEW_HOSTS = [
  'orkg.org',
  'www.orkg.org',
  'ask.orkg.org',
  'sandbox.orkg.org',
] as const;

export type OrkgPreviewKind =
  | 'paper'
  | 'resource'
  | 'comparison'
  | 'template'
  | 'ask_item'
  | 'unknown';

export interface ParsedOrkgPreview {
  kind: OrkgPreviewKind;
  id: string;
}

export function canOpenInChatPreview(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return PREVIEW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Prefer https for ORKG preview URLs. */
export function normalizePreviewUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname.toLowerCase().includes('orkg.org')) {
      u.protocol = 'https:';
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function previewTitleFromUrl(url: string): string {
  const parsed = parseOrkgPreviewUrl(url);
  if (parsed) return parsed.id;
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg || u.hostname;
  } catch {
    return 'Preview';
  }
}

const PATH_TYPE_TO_KIND: Record<string, OrkgPreviewKind> = {
  resource: 'resource',
  resources: 'resource',
  paper: 'paper',
  papers: 'paper',
  comparison: 'comparison',
  comparisons: 'comparison',
  template: 'template',
  templates: 'template',
  class: 'resource',
  predicate: 'resource',
};

/** ORKG entity ids (R…, C…, etc.) — skip path segment labels like "resource". */
const ORKG_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]+$/;

function kindFromPath(pathname: string): OrkgPreviewKind {
  const lower = pathname.toLowerCase();
  if (lower.includes('/paper')) return 'paper';
  if (lower.includes('/comparison')) return 'comparison';
  if (lower.includes('/template')) return 'template';
  return 'resource';
}

/**
 * Map public ORKG / ORKG Ask URLs to entity type + id for API-backed preview.
 * Handles `/resource/R123`, `/orkg/resource/R123` (RDF-style paths), and SPARQL IRIs.
 */
export function parseOrkgPreviewUrl(url: string): ParsedOrkgPreview | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const host = u.hostname.toLowerCase();

    if (host.includes('ask.orkg.org')) {
      const itemIdx = parts.findIndex((p) => p.toLowerCase() === 'item');
      if (itemIdx >= 0 && parts[itemIdx + 1]) {
        return { kind: 'ask_item', id: parts[itemIdx + 1] };
      }
    }

    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i].toLowerCase();
      const kind = PATH_TYPE_TO_KIND[seg];
      if (!kind) continue;
      const candidateId = parts[i + 1];
      if (!ORKG_ID_PATTERN.test(candidateId)) continue;
      if (PATH_TYPE_TO_KIND[candidateId.toLowerCase()]) continue;
      return { kind, id: candidateId };
    }

    const extracted = extractOrkgResourceId(url);
    if (extracted) {
      return { kind: kindFromPath(u.pathname), id: extracted };
    }

    const last = parts[parts.length - 1];
    if (
      last &&
      ORKG_ID_PATTERN.test(last) &&
      !PATH_TYPE_TO_KIND[last.toLowerCase()]
    ) {
      return { kind: kindFromPath(u.pathname), id: last };
    }

    return null;
  } catch {
    return null;
  }
}
