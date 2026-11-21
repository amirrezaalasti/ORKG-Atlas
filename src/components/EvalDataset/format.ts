export const formatPercent = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
};

export const formatF1 = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(3);
};

export const formatCount = (value: number): string =>
  new Intl.NumberFormat('en').format(value);

export const formatFrozen = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const RESOURCE = /orkg\.org\/orkg\/resource\/(R\d+)/;

export function displayCell(value: unknown): {
  text: string;
  href?: string;
} {
  if (value == null || value === '') return { text: '—' };
  const textValue = String(value);
  const resource = textValue.match(RESOURCE);
  if (resource) {
    return {
      text: resource[1],
      href: `https://orkg.org/resource/${resource[1]}`,
    };
  }
  if (textValue.startsWith('http') && textValue.length > 42) {
    const tail = decodeURIComponent(textValue.split('/').pop() || textValue);
    return { text: tail, href: textValue };
  }
  return { text: textValue };
}
