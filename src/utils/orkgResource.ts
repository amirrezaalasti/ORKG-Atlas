/** SPARQL / RDF IRI, e.g. http://orkg.org/orkg/resource/R554452 */
export const ORKG_RESOURCE_IRI_REGEX =
  /orkg\.org\/orkg\/resource\/([A-Za-z0-9_-]+)/i;
/** Public site path, e.g. https://orkg.org/resource/R554452 */
export const ORKG_RESOURCE_PUBLIC_REGEX =
  /orkg\.org\/resource\/([A-Za-z0-9_-]+)/i;
/** Legacy alias used in some components */
export const ORKG_RESOURCE_REGEX = ORKG_RESOURCE_IRI_REGEX;
/** e.g. https://orkg.org/papers/R1547354 or /paper/R1547354 */
export const ORKG_PAPER_PAGE_REGEX = /orkg\.org\/papers?\/([A-Za-z0-9_-]+)/i;

export function isOrkgResourceUri(value: string): boolean {
  return (
    typeof value === 'string' &&
    (ORKG_RESOURCE_IRI_REGEX.test(value) ||
      ORKG_RESOURCE_PUBLIC_REGEX.test(value) ||
      ORKG_PAPER_PAGE_REGEX.test(value))
  );
}

export function extractOrkgResourceId(uri: string): string | null {
  const iriMatch = uri.match(ORKG_RESOURCE_IRI_REGEX);
  if (iriMatch) return iriMatch[1];
  const publicMatch = uri.match(ORKG_RESOURCE_PUBLIC_REGEX);
  if (publicMatch) return publicMatch[1];
  const paperMatch = uri.match(ORKG_PAPER_PAGE_REGEX);
  if (paperMatch) return paperMatch[1];
  const trimmed = uri.trim();
  if (/^R[A-Za-z0-9_-]+$/i.test(trimmed)) return trimmed;
  return null;
}

/** Browser URL without the duplicate `/orkg` segment used in RDF IRIs. */
export function orkgPublicResourceUrl(resourceId: string): string {
  return `https://orkg.org/resource/${encodeURIComponent(resourceId)}`;
}

export function orkgPublicPaperUrl(resourceId: string): string {
  return `https://orkg.org/paper/${encodeURIComponent(resourceId)}`;
}

/**
 * Map a SPARQL binding value (RDF IRI or public URL) to a clickable ORKG link.
 * RDF IRIs use http://orkg.org/orkg/resource/R…; the site uses https://orkg.org/resource/R….
 */
export function resolveOrkgUriLink(
  uri: string
): { href: string; label: string } | null {
  const id = extractOrkgResourceId(uri);
  if (!id) return null;
  const paperMatch = uri.match(ORKG_PAPER_PAGE_REGEX);
  const href = paperMatch ? orkgPublicPaperUrl(id) : orkgPublicResourceUrl(id);
  return { href, label: id };
}

export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}
