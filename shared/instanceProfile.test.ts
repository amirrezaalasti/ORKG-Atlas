import { describe, expect, it } from 'vitest';
import {
  diagnoseEmptyResult,
  profileAttachment,
  profileTemplates,
  reconcile,
  renderProfileSection,
  type InstanceProfile,
} from './instanceProfile.js';

const P = 'http://orkg.org/orkg/predicate/';

/** Fake endpoint: answers by matching a fragment of the query. */
const runner =
  (table: Array<[RegExp, Record<string, unknown>[]]>) => async (q: string) => {
    for (const [re, rows] of table) if (re.test(q)) return rows;
    return [];
  };

describe('profileAttachment', () => {
  it('prefers the most frequent depth over a single direct instance', async () => {
    const run = runner([
      [/\?p <[^>]+P31> \?x \. \?x a/, [{ n: '1' }]],
      [
        /GROUP BY \?h ORDER/,
        [
          { h: `${P}P115000`, n: '88' },
          { h: `${P}wikidata:P2974`, n: '6' },
          { h: `${P}P37545`, n: '3' },
        ],
      ],
      [/UNION/, [{ n: '91' }]],
    ]);
    const a = await profileAttachment('C65002', run);
    expect(a.chosen).toEqual([['P115000']]); // 88 of 97 one-hop instances >= 90%
    expect(a.attached).toBe(91);
    expect(a.chosenCoverage).toBeGreaterThan(0.9);
  });

  it('counts an instance reached along two predicates once', async () => {
    // A reaches 90 instances, B 40 (all also reached by A), C 10: 100 distinct.
    const run = runner([
      [
        /GROUP BY \?h ORDER/,
        [
          { h: `${P}A`, n: '90' },
          { h: `${P}B`, n: '40' },
          { h: `${P}C`, n: '10' },
        ],
      ],
      [
        /GROUP BY \?hs/,
        [
          { hs: `${P}A`, n: '50' },
          { hs: `${P}B ${P}A`, n: '30' },
          { hs: `${P}A ${P}B`, n: '10' },
          { hs: `${P}C`, n: '10' },
        ],
      ],
      [/UNION/, [{ n: '100' }]],
    ]);
    const a = await profileAttachment('C1', run);
    // Summed counts (140) would need A and B to reach 90% and report 100% coverage.
    expect(a.chosen).toEqual([['A']]);
    expect(a.chosenCoverage).toBeCloseTo(0.9);
    expect(a.combos).toContainEqual({ depth: 1, keys: ['A', 'B'], n: 40 });
  });

  it('uses distinct one-hop instances to decide whether to look two hops deep', async () => {
    // Three one-hop routes of 2 each reach the same 2 instances: fewer than five, so probe two hops.
    let twoHop = false;
    const run = async (q: string) => {
      if (/GROUP BY \?h ORDER/.test(q))
        return [
          { h: `${P}A`, n: '2' },
          { h: `${P}B`, n: '2' },
          { h: `${P}C`, n: '2' },
        ];
      if (/GROUP BY \?hs/.test(q) && q.includes('?m ?g ?x'))
        return [{ hs: `${P}D>${P}E`, n: '30' }];
      if (/GROUP BY \?hs/.test(q)) return [{ hs: `${P}A ${P}B ${P}C`, n: '2' }];
      if (/GROUP BY \?h \?g/.test(q))
        return (twoHop = true), [{ h: `${P}D`, g: `${P}E`, n: '30' }];
      if (/UNION/.test(q)) return [{ n: '2' }];
      return [];
    };
    const a = await profileAttachment('C1', run);
    expect(twoHop).toBe(true);
    expect(a.chosen).toEqual([['D'], ['E']]);
    expect(a.attached).toBe(30);
  });

  it('returns the empty path when instances are contributions', async () => {
    const run = runner([
      [/\?p <[^>]+P31> \?x \. \?x a/, [{ n: '778' }]],
      [/UNION/, [{ n: '778' }]],
    ]);
    const a = await profileAttachment('C27001', run);
    expect(a.chosen).toEqual([]);
    expect(a.chosenCoverage).toBe(1);
  });
});

const windProfile: InstanceProfile = {
  rootClass: 'C92000',
  attachment: {
    attached: 151,
    routes: [{ depth: 0, hops: [], instances: 151 }],
    chosen: [],
    chosenCoverage: 1,
  },
  classes: [
    {
      classId: 'C92000',
      templateLabel: 'Wind Energy',
      instances: 151,
      used: { 'wikidata:P17': 145, P37537: 145, P32: 150 },
    },
  ],
  declared: [
    { classId: 'C92000', predicate: 'P15249', label: 'country' },
    { classId: 'C92000', predicate: 'P37537', label: 'data source' },
  ],
  predicateLabels: { 'wikidata:P17': 'country' },
};

describe('reconcile', () => {
  it('flags a used-but-undeclared predicate that replaces a declared one', () => {
    const [r] = reconcile(windProfile);
    expect(r.declaredUsage.find((d) => d.predicate === 'P15249')?.n).toBe(0);
    expect(r.undeclaredUsed).toEqual([
      {
        predicate: 'wikidata:P17',
        label: 'country',
        n: 145,
        substitutes: 'P15249',
      },
    ]);
  });

  it('ignores ORKG system predicates such as research problem (P32)', () => {
    const [r] = reconcile(windProfile);
    expect(r.undeclaredUsed.map((u) => u.predicate)).not.toContain('P32');
  });

  it('renders the substitution in the prompt section', () => {
    const text = renderProfileSection(windProfile);
    expect(text).toContain('orkgp:wikidata:P17 "country"');
    expect(text).toContain('instead of the declared P15249');
    expect(text).toContain('Declared but never stated: P15249 "country"');
  });
});

describe('diagnoseEmptyResult', () => {
  it('reports a substitution when instances use another predicate instead', () => {
    const d = diagnoseEmptyResult(
      'SELECT ?paper ?c WHERE { ?paper orkgp:P31 ?x . ?x orkgp:P15249 ?c }',
      windProfile
    );
    expect(d.kind).toBe('substitution');
    if (d.kind === 'substitution')
      expect(d.substitutes).toEqual({ P15249: 'wikidata:P17' });
  });

  it('reports a data gap when nothing replaces the unstated predicate', () => {
    const p: InstanceProfile = {
      ...windProfile,
      predicateLabels: {},
      classes: [{ ...windProfile.classes[0], used: { P37537: 145 } }],
    };
    const d = diagnoseEmptyResult(
      'SELECT ?paper ?c WHERE { ?paper orkgp:P31 ?x . ?x orkgp:P15249 ?c }',
      p
    );
    expect(d.kind).toBe('data-gap');
  });

  it('does not judge predicates of classes that were not profiled', () => {
    const p: InstanceProfile = {
      ...windProfile,
      declared: [
        ...windProfile.declared,
        { classId: 'C999', predicate: 'P2001', label: 'Algorithm' },
      ],
    };
    const d = diagnoseEmptyResult(
      'SELECT ?paper WHERE { ?paper orkgp:P31 ?x . ?x orkgp:P37537 ?y . ?y orkgp:P2001 ?a }',
      p
    );
    expect(d.kind).toBe('unknown');
  });

  it('ignores never-stated predicates inside OPTIONAL', () => {
    const d = diagnoseEmptyResult(
      'SELECT ?paper WHERE { ?paper orkgp:P31 ?x . ?x orkgp:P37537 ?s . OPTIONAL { ?x orkgp:P15249 ?c } FILTER(?s = "none") }',
      windProfile
    );
    expect(d.kind).toBe('unknown');
  });
});

describe('profileTemplates', () => {
  it('propagates a failure of the root class so callers can retry', async () => {
    const run = async () => {
      throw new Error('timeout');
    };
    await expect(
      profileTemplates(
        [{ id: 'R1', target_class: { id: 'C1' }, properties: [] }],
        'C1',
        run,
        { attachment: false }
      )
    ).rejects.toThrow('timeout');
  });
});
