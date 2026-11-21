/**
 * Blind two-annotator audit: draw a stratified sample of executable runs and
 * write
 *   audit/blind/items.json  — what annotators see (question, system query and
 *                             rows, reference query and rows); no score, config,
 *                             model, or run. Published with the audit page.
 *   audit/blind/key.json    — case → item, config, model, run, lenient/strict F1.
 *                             Stays local; never published.
 *
 * Strata: lenient F1 bin (0, (0,0.5), [0.5,1), 1) × question set, equal shares.
 * Excludes the 40 cases of the earlier, unblinded audit (audit/key.json) and runs
 * with no rows (nothing to judge). At most two cases per question.
 *
 *   npx tsx scripts/eval/audit/build-blind-sample.ts --n 80 \
 *     runs/v2-curated-haiku-5.5.jsonl:data/gold-results-curated.json:data/curated-cqs.json ...
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreTables, scoreTablesStrict, type ResultTable } from '../common.js';
import type { RunRecord } from '../pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const n = Number(args.includes('--n') ? args[args.indexOf('--n') + 1] : 80);
const triples = args.filter((a) => a.split(':').length === 3);
const MAX_ROWS = 30;

let seed = 20271;
const rand = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const previous = new Set(
  (
    JSON.parse(readFileSync(join(here, 'key.json'), 'utf8')) as {
      item: string;
      config: string;
    }[]
  ).map((k) => `${k.item}|${k.config}|claude-haiku-5.5|1`)
);

type Cand = {
  rec: RunRecord;
  set: string;
  f1: number;
  strict: number;
  question: string;
  template: string;
  goldQueries: string[];
  goldTables: ResultTable[];
};
const cands: Cand[] = [];
for (const t of triples) {
  const [runs, goldPath, dsPath] = t.split(':');
  const gold = new Map(
    (
      JSON.parse(readFileSync(goldPath, 'utf8')).items as {
        id: string;
        results: {
          ok: boolean;
          vars?: string[];
          rows?: Record<string, string>[];
        }[];
      }[]
    ).map((g) => [g.id, g])
  );
  const ds = new Map(
    (
      JSON.parse(readFileSync(dsPath, 'utf8')).items as {
        id: string;
        question: string;
        templateTitle?: string;
        goldQueries: string[];
        dataset: string;
      }[]
    ).map((d) => [d.id, d])
  );
  for (const line of readFileSync(runs, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as RunRecord;
    const g = gold.get(rec.itemId);
    const item = ds.get(rec.itemId);
    if (!g || !item || !rec.executable || !rec.nonEmpty || rec.error) continue;
    const model = rec.model.split('/').pop()!;
    if (previous.has(`${rec.itemId}|${rec.config}|${model}|${rec.run}`))
      continue;
    const goldTables = g.results
      .filter((r) => r.ok)
      .map((r) => ({ vars: r.vars ?? [], rows: r.rows ?? [] }));
    if (goldTables.every((x) => x.rows.length === 0)) continue;
    cands.push({
      rec,
      set: item.dataset,
      question: item.question,
      template: item.templateTitle ?? rec.templateId,
      goldQueries: item.goldQueries,
      goldTables,
      f1: scoreTables(goldTables, rec.finalTables).f1,
      strict: scoreTablesStrict(goldTables, rec.finalTables).f1,
    });
  }
}

const bins: [string, (f: number) => boolean][] = [
  ['0', (f) => f === 0],
  ['(0,0.5)', (f) => f > 0 && f < 0.5],
  ['[0.5,1)', (f) => f >= 0.5 && f < 0.999],
  ['1', (f) => f >= 0.999],
];
const sets = [...new Set(cands.map((c) => c.set))].sort();
const perStratum = Math.ceil(n / (bins.length * sets.length));
const picked: Cand[] = [];
const perQuestion = new Map<string, number>();
for (const [, inBin] of bins)
  for (const s of sets) {
    let k = 0;
    for (const c of shuffle(cands.filter((x) => x.set === s && inBin(x.f1)))) {
      if (k >= perStratum) break;
      if ((perQuestion.get(c.rec.itemId) ?? 0) >= 2) continue;
      perQuestion.set(c.rec.itemId, (perQuestion.get(c.rec.itemId) ?? 0) + 1);
      picked.push(c);
      k++;
    }
  }
const order = shuffle(picked).slice(0, n);

const ORKG = /^https?:\/\/orkg\.org\/orkg\/(resource|predicate|class)\//;
const short = (v: string) => (v ?? '').replace(ORKG, '');
const IDENT =
  /^(paper|paperlabel|paper_label|papertitle|title|contribution|contri|year|doi|paperuri)$/i;
const isNum = (v: string) => /^-?\d+(\.\d+)?$/.test((v ?? '').trim());

/**
 * Shape-neutral overview, computed the same way for system and reference on the
 * FULL table: rows, distinct papers (when a paper column exists), and per answer
 * column its distinct values with the number of papers (or rows) stating each.
 * Aggregated tables (no paper column, a numeric column) are shown as label → number.
 * No score and no cross-side matching.
 */
const overview = (t: ResultTable) => {
  const paperCol =
    t.vars.find((v) => /^paper$/i.test(v)) ??
    t.vars.find(
      (v) =>
        /paper/i.test(v) &&
        t.rows.every((r) => !r[v] || /^R\d+$/.test(short(r[v])))
    );
  const answer0 = t.vars.filter(
    (v) => v !== paperCol && !IDENT.test(v) && t.rows.some((r) => r[v])
  );
  // Hide pure-ID columns (resource or Wikidata IDs) when a readable column is also returned.
  const idOnly = (v: string) =>
    t.rows.every(
      (r) => !r[v] || /^(R\d+|wikidata:Q\d+|https?:\/\/\S+)$/.test(short(r[v]))
    );
  const readable = answer0.filter((v) => !idOnly(v));
  const answer = readable.length ? readable : answer0;
  const numeric = answer.filter(
    (v) => t.rows.length > 0 && t.rows.every((r) => !r[v] || isNum(r[v]))
  );
  const base = {
    rows: t.rows.length,
    papers: paperCol
      ? new Set(t.rows.map((r) => r[paperCol]).filter(Boolean)).size
      : null,
  };
  if (!paperCol && numeric.length === 1 && answer.length >= 2) {
    const labels = answer.filter((v) => v !== numeric[0]);
    const pairs = t.rows
      .map(
        (r) =>
          [
            labels.map((l) => short(r[l] ?? '')).join(' · '),
            Number(r[numeric[0]]),
          ] as [string, number]
      )
      .sort((a, b) => b[1] - a[1]);
    return {
      ...base,
      kind: 'aggregate',
      columns: [
        {
          name: `${labels.join(' · ')} → ${numeric[0]}`,
          distinct: pairs.length,
          top: pairs.slice(0, 15).map(([v, n]) => [v.slice(0, 120), n]),
        },
      ],
    };
  }
  const columns = answer.slice(0, 4).map((v) => {
    const by = new Map<string, Set<string>>();
    t.rows.forEach((r, i) => {
      const val = short(r[v] ?? '');
      if (!val) return;
      if (!by.has(val)) by.set(val, new Set());
      by.get(val)!.add(paperCol ? r[paperCol] : String(i));
    });
    const top = [...by]
      .map(([val, ps]) => [val.slice(0, 120), ps.size] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { name: v, distinct: by.size, top: top.slice(0, 15) };
  });
  return { ...base, kind: paperCol ? 'per-paper' : 'list', columns };
};

const clip = (t: ResultTable) => ({
  columns: t.vars,
  total: t.rows.length,
  rows: t.rows
    .slice(0, MAX_ROWS)
    .map((r) => t.vars.map((v) => short(r[v] ?? '').slice(0, 160))),
  overview: overview(t),
});

/** Minimal SPARQL layout: newline after '{' and ' . ', before '}', indented by depth. */
const pretty = (q: string) => {
  const flat = q
    .replace(/^\s*PREFIX[^\n]*\n/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
  let out = '',
    depth = 0,
    inStr: string | null = null;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && flat[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      out += ch;
      continue;
    }
    if (ch === '{') {
      depth++;
      out += '{\n' + '  '.repeat(depth);
      while (flat[i + 1] === ' ') i++;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      out = out.trimEnd() + '\n' + '  '.repeat(depth) + '}';
      continue;
    }
    if (
      ch === '.' &&
      flat[i - 1] === ' ' &&
      (flat[i + 1] === ' ' || flat[i + 1] === undefined)
    ) {
      out += '.\n' + '  '.repeat(depth);
      while (flat[i + 1] === ' ') i++;
      continue;
    }
    out += ch;
  }
  return out
    .replace(/\n\s*\n/g, '\n')
    .replace(
      /\} (FILTER|OPTIONAL|GROUP|ORDER|LIMIT|UNION|BIND|VALUES|\?)/g,
      '}\n' + '$1'
    )
    .trim();
};
const stripPrefixes = pretty;

const outDir = join(here, 'blind');
mkdirSync(outDir, { recursive: true });
const items = order.map((c, i) => ({
  case: `C${String(i + 1).padStart(3, '0')}`,
  question: c.question,
  template: c.template,
  systemQueries: c.rec.finalQueries.map(stripPrefixes),
  systemTables: c.rec.finalTables.map(clip),
  referenceQueries: c.goldQueries.map(stripPrefixes),
  referenceTables: c.goldTables.map(clip),
}));
writeFileSync(
  join(outDir, 'items.json'),
  JSON.stringify({ version: 1, items })
);
writeFileSync(
  join(outDir, 'key.json'),
  JSON.stringify(
    order.map((c, i) => ({
      case: items[i].case,
      item: c.rec.itemId,
      set: c.set,
      config: c.rec.config,
      model: c.rec.model,
      run: c.rec.run,
      f1: c.f1,
      strictF1: c.strict,
    })),
    null,
    1
  )
);
const dist: Record<string, number> = {};
for (const c of order) {
  const b = bins.find(([, f]) => f(c.f1))![0];
  dist[`${c.set} ${b}`] = (dist[`${c.set} ${b}`] ?? 0) + 1;
}
console.log(
  `${order.length} cases from ${cands.length} candidates; ${new Set(order.map((c) => c.rec.itemId)).size} questions`
);
console.log(dist);
console.log(
  `configs: ${JSON.stringify(Object.fromEntries([...new Set(order.map((c) => c.rec.config))].map((k) => [k, order.filter((c) => c.rec.config === k).length])))}`
);
console.log(
  `models: ${JSON.stringify(Object.fromEntries([...new Set(order.map((c) => c.rec.model.split('/').pop()))].map((k) => [k, order.filter((c) => c.rec.model.endsWith(k!)).length])))}`
);
