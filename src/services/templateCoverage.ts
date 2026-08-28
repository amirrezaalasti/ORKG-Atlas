/**
 * Live ORKG template-catalogue coverage.
 *
 * Ports the schema-resolution analysis from the paper script
 * `orkg-atlas-paper/analysis/template_coverage.py`: a template yields a usable
 * schema when it declares a target class and at least one active property;
 * expansion follows properties whose class is another template's target class
 * (the same walk `loadTemplateFlowByID` uses at runtime).
 */

import { getOrkgApiBase } from './orkgTemplatesApi';

const ORKG_TEMPLATE_ACCEPT = 'application/vnd.orkg.template.v1+json';
const PAGE_SIZE = 100;
const EXPANSION_CAP = 8;

export interface CoverageProperty {
  deactivated?: boolean;
  class?: { id?: string } | null;
}

export interface CoverageTemplate {
  id: string;
  target_class?: { id?: string } | null;
  properties?: CoverageProperty[] | null;
  relations?: {
    research_fields?: Array<{ label?: string } | null> | null;
  } | null;
}

export interface TemplateCoverageResult {
  n_templates: number;
  n_research_fields: number;
  declare_target_class: number;
  yield_usable_schema: number;
  no_active_property: number;
  properties_median: number;
  properties_mean: number;
  properties_max: number;
  only_1_2_properties: number;
  '25_or_more_properties': number;
  reference_other_template: number;
  expansion_depth_ge_2: number;
  expansion_max_depth: number;
  largest_expansion_size: number;
  expansion_revisits_template: number;
}

interface OrkgListResponse {
  content?: CoverageTemplate[];
  totalElements?: number;
  page?: {
    total_elements?: number;
  };
}

export interface FetchCoverageOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  pageSize?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function meanOneDecimal(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function activeProperties(template: CoverageTemplate): CoverageProperty[] {
  return (template.properties ?? []).filter(
    (property) => !property.deactivated
  );
}

function expandTemplate(
  templateId: string,
  propsById: Map<string, CoverageProperty[]>,
  classToTemplates: Map<string, string[]>
): { depth: number; size: number; cycle: boolean } {
  const seen = new Set<string>([templateId]);
  let frontier = [templateId];
  let depth = 0;
  let cycle = false;

  while (frontier.length > 0 && depth < EXPANSION_CAP) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const property of propsById.get(current) ?? []) {
        const classId = property.class?.id;
        if (!classId) continue;
        for (const neighbor of classToTemplates.get(classId) ?? []) {
          if (seen.has(neighbor)) {
            cycle = true;
          } else {
            seen.add(neighbor);
            next.push(neighbor);
          }
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
    depth += 1;
  }

  return { depth, size: seen.size, cycle };
}

/** Pure analysis — same metrics as the paper Table 1 script. */
export function analyzeTemplateCoverage(
  templates: CoverageTemplate[]
): TemplateCoverageResult {
  const propsById = new Map<string, CoverageProperty[]>();
  const classToTemplates = new Map<string, string[]>();

  for (const template of templates) {
    propsById.set(template.id, activeProperties(template));
    const classId = template.target_class?.id;
    if (classId) {
      const list = classToTemplates.get(classId) ?? [];
      list.push(template.id);
      classToTemplates.set(classId, list);
    }
  }

  const counts = templates.map(
    (template) => propsById.get(template.id)?.length ?? 0
  );
  const declareTargetClass = templates.filter((template) =>
    Boolean(template.target_class?.id)
  ).length;
  const usable = templates.filter(
    (template) =>
      Boolean(template.target_class?.id) &&
      (propsById.get(template.id)?.length ?? 0) >= 1
  ).length;
  const nested = templates.filter((template) =>
    (propsById.get(template.id) ?? []).some((property) => {
      const classId = property.class?.id;
      return Boolean(classId && classToTemplates.has(classId));
    })
  ).length;

  const depths: number[] = [];
  const sizes: number[] = [];
  let cycles = 0;
  for (const template of templates) {
    const result = expandTemplate(template.id, propsById, classToTemplates);
    depths.push(result.depth);
    sizes.push(result.size);
    if (result.cycle) cycles += 1;
  }

  const fields = new Set<string>();
  for (const template of templates) {
    for (const field of template.relations?.research_fields ?? []) {
      if (field?.label) fields.add(field.label);
    }
  }

  return {
    n_templates: templates.length,
    n_research_fields: fields.size,
    declare_target_class: declareTargetClass,
    yield_usable_schema: usable,
    no_active_property: templates.length - usable,
    properties_median: median(counts),
    properties_mean: meanOneDecimal(counts),
    properties_max: counts.length === 0 ? 0 : Math.max(...counts),
    only_1_2_properties: counts.filter((count) => count >= 1 && count <= 2)
      .length,
    '25_or_more_properties': counts.filter((count) => count >= 25).length,
    reference_other_template: nested,
    expansion_depth_ge_2: depths.filter((depth) => depth >= 2).length,
    expansion_max_depth: depths.length === 0 ? 0 : Math.max(...depths),
    largest_expansion_size: sizes.length === 0 ? 0 : Math.max(...sizes),
    expansion_revisits_template: cycles,
  };
}

export function coveragePercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((1000 * count) / total) / 10;
}

export function coverageShareLabel(count: number, total: number): string {
  return `${count.toLocaleString('en-US')} (${coveragePercent(count, total).toFixed(1)}%)`;
}

export interface CoverageTableRow {
  metric: string;
  value: string;
  share?: number;
}

export function buildCoverageTableRows(
  result: TemplateCoverageResult
): CoverageTableRow[] {
  const n = result.n_templates;
  return [
    {
      metric: 'Templates / research fields',
      value: `${result.n_templates.toLocaleString('en-US')} / ${result.n_research_fields.toLocaleString('en-US')}`,
    },
    {
      metric: 'Declare a target class',
      value: coverageShareLabel(result.declare_target_class, n),
      share: coveragePercent(result.declare_target_class, n),
    },
    {
      metric: 'Yield a usable schema',
      value: coverageShareLabel(result.yield_usable_schema, n),
      share: coveragePercent(result.yield_usable_schema, n),
    },
    {
      metric: 'No active property',
      value: coverageShareLabel(result.no_active_property, n),
      share: coveragePercent(result.no_active_property, n),
    },
    {
      metric: 'Properties median / mean / max',
      value: `${result.properties_median.toFixed(1)} / ${result.properties_mean} / ${result.properties_max}`,
    },
    {
      metric: 'Only 1–2 properties',
      value: coverageShareLabel(result.only_1_2_properties, n),
      share: coveragePercent(result.only_1_2_properties, n),
    },
    {
      metric: '25 or more properties',
      value: coverageShareLabel(result['25_or_more_properties'], n),
      share: coveragePercent(result['25_or_more_properties'], n),
    },
    {
      metric: 'Reference ≥1 other template',
      value: coverageShareLabel(result.reference_other_template, n),
      share: coveragePercent(result.reference_other_template, n),
    },
    {
      metric: 'Expansion depth ≥2 / max depth',
      value: `${result.expansion_depth_ge_2.toLocaleString('en-US')} / ${result.expansion_max_depth}`,
      share: coveragePercent(result.expansion_depth_ge_2, n),
    },
    {
      metric: 'Largest expansion',
      value: `${result.largest_expansion_size.toLocaleString('en-US')} templates`,
    },
    {
      metric: 'Expansion revisits a template',
      value: coverageShareLabel(result.expansion_revisits_template, n),
      share: coveragePercent(result.expansion_revisits_template, n),
    },
  ];
}

async function fetchTemplatePage(
  page: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<{ content: CoverageTemplate[]; total: number }> {
  const url = `${getOrkgApiBase()}/templates?page=${page}&size=${pageSize}`;
  const response = await fetch(url, {
    headers: { Accept: ORKG_TEMPLATE_ACCEPT },
    signal,
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(
      `ORKG templates request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as OrkgListResponse;
  const content = data.content ?? [];
  const total = Number(
    data.page?.total_elements ?? data.totalElements ?? content.length
  );
  return {
    content,
    total: Number.isFinite(total) ? total : content.length,
  };
}

/** Page through `GET /api/templates` the same way the paper script does. */
export async function fetchAllCoverageTemplates(
  options: FetchCoverageOptions = {}
): Promise<CoverageTemplate[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const collected: CoverageTemplate[] = [];
  let page = 0;
  let total = Infinity;

  while (collected.length < total) {
    const { content, total: reported } = await fetchTemplatePage(
      page,
      pageSize,
      options.signal
    );
    total = reported;
    if (content.length === 0) break;
    collected.push(...content);
    options.onProgress?.(Math.min(collected.length, total), total);
    if (content.length < pageSize) break;
    page += 1;
    if (page > 200) break;
  }

  return collected;
}

export async function loadTemplateCoverage(
  options: FetchCoverageOptions = {}
): Promise<TemplateCoverageResult> {
  const templates = await fetchAllCoverageTemplates(options);
  return analyzeTemplateCoverage(templates);
}
