import { describe, expect, it } from 'vitest';
import { buildNodes, wrapLabel } from './constellationLayout';

describe('wrapLabel', () => {
  it('keeps short labels on one line', () => {
    expect(wrapLabel('Atlas')).toEqual(['Atlas']);
  });

  it('splits long titles across two lines', () => {
    expect(wrapLabel('Empirical Research Practice')).toEqual([
      'Empirical Research',
      'Practice',
    ]);
  });
});

describe('buildNodes', () => {
  it('places two templates east and west of the hub', () => {
    const nodes = buildNodes(
      [
        { id: 'R186491', title: 'Empirical Research Practice' },
        { id: 'R1544125', title: 'NLP4RE ID Card' },
      ],
      [{ title: 'Cross-domain', descriptionHtml: '<p>x</p>' }]
    );
    const hub = nodes.find((n) => n.kind === 'hub');
    const templates = nodes.filter((n) => n.kind === 'template');
    expect(hub).toBeDefined();
    expect(templates).toHaveLength(2);
    expect(templates[0].x).toBeLessThan(hub!.x);
    expect(templates[1].x).toBeGreaterThan(hub!.x);
    expect(templates[0].to).toBe('/R186491/allquestions');
  });
});
