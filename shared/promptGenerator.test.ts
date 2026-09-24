import { describe, expect, it, vi } from 'vitest';
import {
  buildPaperLinkPattern,
  discoverPaperLinkPath,
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
} from './promptGenerator.js';
import type { Template } from './templateTypes.js';

const P = 'http://orkg.org/orkg/predicate/';

describe('discoverPaperLinkPath', () => {
  it('returns an empty path when instances are direct contributions', async () => {
    const run = vi.fn().mockResolvedValueOnce([{ x: 'R1' }]);
    await expect(discoverPaperLinkPath('C27001', run)).resolves.toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('collects every predicate on a single intermediate hop', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ p1: `${P}P112015` }]);
    await expect(discoverPaperLinkPath('C63005', run)).resolves.toEqual([
      ['P112015'],
    ]);
  });

  it('follows the most common first hop and keeps all second-hop predicates', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { p1: `${P}P112015`, p2: `${P}P112012`, n: '26' },
        { p1: `${P}P112015`, p2: `${P}P112011`, n: '25' },
        { p1: `${P}P999`, p2: `${P}P112013`, n: '1' },
      ]);
    await expect(discoverPaperLinkPath('C63002', run)).resolves.toEqual([
      ['P112015'],
      ['P112012', 'P112011'],
    ]);
  });

  it('returns null when the lookup fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(discoverPaperLinkPath('C1', run)).resolves.toBeNull();
  });
});

describe('buildPaperLinkPattern', () => {
  it('keeps the direct P31 link without a path', () => {
    expect(buildPaperLinkPattern([])).toBe('?paper orkgp:P31 ?contribution .');
  });

  it('chains hops and uses VALUES for alternative predicates', () => {
    expect(buildPaperLinkPattern([['P112015'], ['P112011', 'P112012']])).toBe(
      [
        '?paper orkgp:P31 ?paperContribution .',
        '?paperContribution orkgp:P112015 ?hop1 .',
        'VALUES ?link2 { orkgp:P112011 orkgp:P112012 }',
        '?hop1 ?link2 ?contribution .',
      ].join('\n')
    );
  });
});

describe('generateTemplateMapping', () => {
  const template: Template = {
    id: 'R588803',
    label: 'Electrochemical Cell Components',
    target_class: { id: 'C63002', label: 'electrochemical cell components' },
    properties: [
      {
        id: 'S1',
        label: 'Property shape for R588803',
        min_count: 0,
        max_count: null,
        path: { id: 'wikidata:P2610', label: 'thickness' },
        class: { id: 'C23008', label: 'Quantity Value' },
      },
    ],
  };

  it('labels properties by predicate and ignores placeholder descriptions', () => {
    const mapping = generateTemplateMapping([template]);
    expect(mapping['wikidata:P2610'].label).toBe('thickness');
    expect(mapping['wikidata:P2610'].description).toBe(
      'thickness (value: Quantity Value resource)'
    );
  });

  it('puts the discovered path into the mandatory query structure', () => {
    const prompt = generateDynamicSPARQLPrompt(
      generateTemplateMapping([template]),
      'R588803',
      undefined,
      'C63002',
      [['P112015'], ['P112011', 'P112012']]
    );
    expect(prompt).toContain('?paperContribution orkgp:P112015 ?hop1 .');
    expect(prompt).not.toContain('  ?paper orkgp:P31 ?contribution .');
  });
});
