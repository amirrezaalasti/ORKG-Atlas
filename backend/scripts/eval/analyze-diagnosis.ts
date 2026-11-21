/**
 * Offline evaluation of the empty-result diagnosis (shared/instanceProfile.ts,
 * diagnoseEmptyResult) on existing run logs, against frozen profiles.
 *
 * Every executable run whose final result is empty is diagnosed. Ground truth:
 *  - a data gap is correct when the question asks for a declared property no
 *    instance states (empty set: kind "absent-property"; sampled/stress: kind or
 *    stress "unused");
 *  - for every other question (impossible filters, zero counts, questions with a
 *    non-empty gold) a data-gap label is a false alarm.
 *
 *   npx tsx scripts/eval/analyze-diagnosis.ts runs/*.jsonl --sets data/empty-cqs.json,data/curated-cqs.json,...
 */
import { readFileSync } from 'node:fs';
import { diagnoseEmptyResult } from '../../../shared/instanceProfile.js';
import { instanceProfile, type RunRecord } from './pipeline.js';

const args = process.argv.slice(2);
const setArg = args.includes('--sets') ? args[args.indexOf('--sets') + 1] : '';
const files = args.filter((a) => a.endsWith('.jsonl'));

type Item = { id: string; kind?: string; stress?: string; divergence?: string };
type Truth = 'data-gap' | 'substitution' | 'none';
const truth = new Map<string, Truth>();
for (const f of setArg.split(',').filter(Boolean))
  for (const it of (JSON.parse(readFileSync(f, 'utf8')) as { items: Item[] })
    .items)
    truth.set(
      it.id,
      it.kind === 'absent-property' ||
        it.kind === 'unused' ||
        it.stress === 'unused'
        ? 'data-gap'
        : it.stress === 'mismatch' ||
            it.kind === 'mismatch' ||
            it.divergence === 'substitution'
          ? 'substitution'
          : 'none'
    );

const latest = new Map<string, RunRecord>();
for (const f of files)
  for (const line of readFileSync(f, 'utf8').split('\n'))
    if (line.trim()) {
      const r = JSON.parse(line) as RunRecord;
      if (truth.has(r.itemId))
        latest.set(`${r.itemId}|${r.config}|${r.model}|${r.run}`, r);
    }

// confusion[truth][predicted]
const kinds = ['data-gap', 'substitution', 'unknown'] as const;
const conf: Record<Truth, Record<string, number>> = {
  'data-gap': { 'data-gap': 0, substitution: 0, unknown: 0 },
  substitution: { 'data-gap': 0, substitution: 0, unknown: 0 },
  none: { 'data-gap': 0, substitution: 0, unknown: 0 },
};
const wrong: string[] = [];
for (const r of latest.values()) {
  if (!r.executable || r.nonEmpty || !r.finalQueries.length) continue;
  const d = diagnoseEmptyResult(
    r.finalQueries.join('\n'),
    await instanceProfile(r.templateId)
  );
  const t = truth.get(r.itemId)!;
  conf[t][d.kind]++;
  if (d.kind !== 'unknown' && d.kind !== t)
    wrong.push(
      `${r.itemId} [${r.config}] truth=${t} said=${d.kind} ${d.predicates.join(',')}`
    );
}
console.log('truth \\ diagnosis\t' + kinds.join('\t'));
for (const t of ['data-gap', 'substitution', 'none'] as Truth[])
  console.log(`${t}\t${kinds.map((k) => conf[t][k]).join('\t')}`);
const claims =
  conf['data-gap']['data-gap'] +
  conf['data-gap'].substitution +
  conf.substitution['data-gap'] +
  conf.substitution.substitution +
  conf.none['data-gap'] +
  conf.none.substitution;
const right = conf['data-gap']['data-gap'] + conf.substitution.substitution;
console.log(
  `claims ${claims}, correct ${right} (precision ${(right / Math.max(1, claims)).toFixed(2)}); recall data-gap ${(
    conf['data-gap']['data-gap'] /
    Math.max(
      1,
      kinds.reduce((s, k) => s + conf['data-gap'][k], 0)
    )
  ).toFixed(2)}, substitution ${(
    conf.substitution.substitution /
    Math.max(
      1,
      kinds.reduce((s, k) => s + conf.substitution[k], 0)
    )
  ).toFixed(2)}`
);
if (wrong.length)
  console.log('wrong claims:\n  ' + wrong.slice(0, 15).join('\n  '));
