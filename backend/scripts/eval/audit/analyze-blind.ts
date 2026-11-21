/**
 * Analyse the blind two-annotator audit.
 *
 * Input: the annotators' label documents (exported from the audit page's store
 * with ArtifactData list --out_dir, or pasted "Copy my answers" JSON files), and
 * audit/blind/key.json (case -> config, model, lenient/strict F1).
 *
 *   npx tsx scripts/eval/audit/analyze-blind.ts <labelsA.json> <labelsB.json>
 *
 * Reports: inter-annotator agreement (raw, Cohen's kappa) on the 4-way verdict and
 * on correct vs. not; agreement of each annotator and of the consensus with exact
 * match (F1 = 1) under the lenient and strict scorers; precision of exact match
 * (share of F1 = 1 cases judged correct) and the share of F1 < 1 cases judged
 * correct (how conservative exact match is), with Wilson 95% intervals.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Label = {
  verdict: 'correct' | 'partial' | 'wrong' | 'unsure';
  errors?: string[];
  referenceDoubt?: boolean;
};
type Doc = { annotator?: string; labels: Record<string, Label> };
const here = dirname(fileURLToPath(import.meta.url));
const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) {
  console.error('usage: analyze-blind.ts <labelsA.json> <labelsB.json>');
  process.exit(1);
}
const load = (f: string): Doc => {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return (j.data ?? j) as Doc;
};
const A = load(fa),
  B = load(fb);
const key = new Map(
  (
    JSON.parse(readFileSync(join(here, 'blind', 'key.json'), 'utf8')) as {
      case: string;
      f1: number;
      strictF1: number;
      config: string;
    }[]
  ).map((k) => [k.case, k])
);

const kappa = (pairs: [string, string][]) => {
  const n = pairs.length;
  if (!n) return NaN;
  const cats = [...new Set(pairs.flat())];
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pe = cats.reduce(
    (s, c) =>
      s +
      (pairs.filter(([a]) => a === c).length / n) *
        (pairs.filter(([, b]) => b === c).length / n),
    0
  );
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
};
const wilson = (k: number, n: number) => {
  if (!n) return '—';
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${k}/${n} = ${(100 * p).toFixed(0)}% [${(100 * (c - h)).toFixed(0)}, ${(100 * (c + h)).toFixed(0)}]`;
};

const both = [...key.keys()].filter(
  (c) => A.labels[c]?.verdict && B.labels[c]?.verdict
);
console.log(
  `annotators ${A.annotator ?? 'A'} / ${B.annotator ?? 'B'}: ${Object.keys(A.labels).length} / ${Object.keys(B.labels).length} labels; ${both.length} cases labelled by both of ${key.size}`
);

const four = both.map(
  (c) => [A.labels[c].verdict, B.labels[c].verdict] as [string, string]
);
const bin = (v: string) => (v === 'correct' ? 'correct' : 'not');
const two = four.map(([a, b]) => [bin(a), bin(b)] as [string, string]);
console.log(`\nInter-annotator agreement`);
console.log(
  `  4-way verdict: raw ${((100 * four.filter(([a, b]) => a === b).length) / four.length).toFixed(1)}%, Cohen's kappa ${kappa(four).toFixed(2)}`
);
console.log(
  `  correct vs not: raw ${((100 * two.filter(([a, b]) => a === b).length) / two.length).toFixed(1)}%, Cohen's kappa ${kappa(two).toFixed(2)}`
);

// Consensus: both say correct -> correct; both say not -> not; disagreements reported separately.
const consensus = both.filter(
  (c) => bin(A.labels[c].verdict) === bin(B.labels[c].verdict)
);
for (const [name, field] of [
  ['lenient', 'f1'],
  ['strict', 'strictF1'],
] as const) {
  const exact = (c: string) => key.get(c)![field] >= 0.999;
  const correct = (c: string) => A.labels[c].verdict === 'correct';
  const ex = consensus.filter(exact),
    nonEx = consensus.filter((c) => !exact(c));
  console.log(
    `\nExact match (${name} scorer) vs. consensus (${consensus.length} cases where both agree on correct/not)`
  );
  console.log(
    `  F1 = 1 judged correct (precision of exact match): ${wilson(ex.filter(correct).length, ex.length)}`
  );
  console.log(
    `  F1 < 1 judged correct (exact match too conservative): ${wilson(nonEx.filter(correct).length, nonEx.length)}`
  );
  for (const [who, d] of [
    ['A', A],
    ['B', B],
  ] as const) {
    const pairs = both.map(
      (c) =>
        [exact(c) ? 'correct' : 'not', bin(d.labels[c].verdict)] as [
          string,
          string,
        ]
    );
    console.log(
      `  annotator ${who} vs exact match: kappa ${kappa(pairs).toFixed(2)}`
    );
  }
}
const doubts = both.filter(
  (c) => A.labels[c].referenceDoubt || B.labels[c].referenceDoubt
);
console.log(
  `\nReference answer doubted by at least one annotator: ${doubts.length} cases ${doubts.join(', ')}`
);
const errs: Record<string, number> = {};
for (const c of both)
  for (const d of [A, B])
    for (const e of d.labels[c].errors ?? []) errs[e] = (errs[e] ?? 0) + 1;
console.log(`Error types (both annotators): ${JSON.stringify(errs)}`);
const disagree = both.filter(
  (c) => bin(A.labels[c].verdict) !== bin(B.labels[c].verdict)
);
console.log(
  `Disagreements on correct/not (to adjudicate): ${disagree.join(', ') || 'none'}`
);
