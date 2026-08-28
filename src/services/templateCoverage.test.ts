import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  analyzeTemplateCoverage,
  buildCoverageTableRows,
  coveragePercent,
  coverageShareLabel,
  fetchAllCoverageTemplates,
  type CoverageTemplate,
} from './templateCoverage';

function template(partial: CoverageTemplate): CoverageTemplate {
  return partial;
}

const FIXTURE: CoverageTemplate[] = [
  template({
    id: 'T1',
    target_class: { id: 'C1' },
    properties: [
      { class: { id: 'C2' } },
      { class: null },
      { deactivated: true },
    ],
    relations: { research_fields: [{ label: 'SE' }] },
  }),
  template({
    id: 'T2',
    target_class: { id: 'C2' },
    properties: [{ class: { id: 'C3' } }],
    relations: { research_fields: [{ label: 'NLP' }] },
  }),
  template({
    id: 'T3',
    target_class: { id: 'C3' },
    properties: [{ class: { id: 'C2' } }],
    relations: { research_fields: [{ label: 'SE' }] },
  }),
  template({
    id: 'T4',
    target_class: { id: 'C4' },
    properties: [],
  }),
  template({
    id: 'T5',
    target_class: { id: 'C5' },
    properties: Array.from({ length: 25 }, () => ({})),
  }),
  template({
    id: 'T6',
    properties: [{}],
  }),
];

describe('analyzeTemplateCoverage', () => {
  it('matches the paper script metrics on a nested catalogue fixture', () => {
    const result = analyzeTemplateCoverage(FIXTURE);

    expect(result.n_templates).toBe(6);
    expect(result.n_research_fields).toBe(2);
    expect(result.declare_target_class).toBe(5);
    expect(result.yield_usable_schema).toBe(4);
    expect(result.no_active_property).toBe(2);
    expect(result.properties_median).toBe(1);
    expect(result.properties_mean).toBe(5);
    expect(result.properties_max).toBe(25);
    expect(result.only_1_2_properties).toBe(4);
    expect(result['25_or_more_properties']).toBe(1);
    expect(result.reference_other_template).toBe(3);
    expect(result.expansion_depth_ge_2).toBe(1);
    expect(result.expansion_max_depth).toBe(2);
    expect(result.largest_expansion_size).toBe(3);
    expect(result.expansion_revisits_template).toBe(3);
  });

  it('treats an empty catalogue as zeros', () => {
    expect(analyzeTemplateCoverage([])).toEqual({
      n_templates: 0,
      n_research_fields: 0,
      declare_target_class: 0,
      yield_usable_schema: 0,
      no_active_property: 0,
      properties_median: 0,
      properties_mean: 0,
      properties_max: 0,
      only_1_2_properties: 0,
      '25_or_more_properties': 0,
      reference_other_template: 0,
      expansion_depth_ge_2: 0,
      expansion_max_depth: 0,
      largest_expansion_size: 0,
      expansion_revisits_template: 0,
    });
  });

  it('ignores deactivated properties when judging a usable schema', () => {
    const result = analyzeTemplateCoverage([
      {
        id: 'T',
        target_class: { id: 'C' },
        properties: [{ deactivated: true, class: { id: 'C' } }],
      },
    ]);
    expect(result.yield_usable_schema).toBe(0);
    expect(result.no_active_property).toBe(1);
    expect(result.reference_other_template).toBe(0);
  });
});

describe('coveragePercent', () => {
  it('rounds to one decimal like the paper table', () => {
    expect(coveragePercent(1421, 1470)).toBe(96.7);
    expect(coveragePercent(1470, 1470)).toBe(100);
    expect(coveragePercent(0, 0)).toBe(0);
  });

  it('formats share labels', () => {
    expect(coverageShareLabel(1421, 1470)).toBe('1,421 (96.7%)');
  });
});

describe('buildCoverageTableRows', () => {
  it('renders the paper Table 1 median as one decimal', () => {
    const rows = buildCoverageTableRows({
      n_templates: 1470,
      n_research_fields: 119,
      declare_target_class: 1470,
      yield_usable_schema: 1421,
      no_active_property: 49,
      properties_median: 3,
      properties_mean: 4.9,
      properties_max: 111,
      only_1_2_properties: 448,
      '25_or_more_properties': 17,
      reference_other_template: 647,
      expansion_depth_ge_2: 319,
      expansion_max_depth: 6,
      largest_expansion_size: 58,
      expansion_revisits_template: 352,
    });
    expect(
      rows.find((row) => row.metric === 'Yield a usable schema')?.value
    ).toBe('1,421 (96.7%)');
    expect(
      rows.find((row) => row.metric === 'Properties median / mean / max')?.value
    ).toBe('3.0 / 4.9 / 111');
  });
});

describe('fetchAllCoverageTemplates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pages until total_elements is collected', async () => {
    const pages = [
      {
        content: [{ id: 'A', target_class: { id: 'C1' }, properties: [] }],
        page: { total_elements: 2 },
      },
      {
        content: [{ id: 'B', target_class: { id: 'C2' }, properties: [] }],
        page: { total_elements: 2 },
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get('page'));
      return {
        ok: true,
        json: async () => pages[page],
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const progress: Array<[number, number]> = [];
    const templates = await fetchAllCoverageTemplates({
      pageSize: 1,
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });

    expect(templates.map((t) => t.id)).toEqual(['A', 'B']);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
