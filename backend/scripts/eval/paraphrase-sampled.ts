/**
 * Label-free paraphrases of the sampled questions (review concern: sampled questions
 * name properties by their template labels, which favours prompts that surface them).
 *
 * An open-weight model that is not among the evaluated ones rewrites each question as a
 * researcher might ask it, describing the property instead of quoting its label; the
 * template name and filter values stay verbatim, so the gold is unchanged. Paraphrases
 * that still contain a content word of the label are flagged. Every paraphrase must be
 * checked by hand (data/sampled-para-review.md) before the set is used.
 *
 *   OPENROUTER_API_KEY=... npx tsx scripts/eval/paraphrase-sampled.ts [--limit N] [--model id]
 * Writes data/sampled-para-cqs.json (same ids and gold as sampled) and data/sampled-para-review.md.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatCompletion } from './openrouter.js';
import { mapLimit } from './common.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k: string) =>
  args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
const model = opt('--model') ?? 'meta-llama/llama-3.3-70b-instruct';
const limit = opt('--limit') ? Number(opt('--limit')) : undefined;

type Item = {
  id: string;
  kind: string;
  templateTitle: string;
  question: string;
  filterValue?: string;
  [k: string]: unknown;
};
const data = JSON.parse(
  readFileSync(join(here, 'data', 'sampled-cqs.json'), 'utf8')
) as { items: Item[]; [k: string]: unknown };
const items = limit ? data.items.slice(0, limit) : data.items;

/** Property labels the generator put into the question. */
const labelsOf = (it: Item): string[] => {
  const q = it.question.replace(
    /^For the papers described with the "[^"]*" template,?\s*/,
    ''
  );
  const m =
    q.match(/^how many different values of (.+) does each paper report\?$/) ??
    q.match(/^what (.+) is given for their (.+)\?$/) ??
    q.match(/^whose (.+) is "[^"]*", what (.+) does each paper report\?$/) ??
    q.match(/^what (.+) does each paper report\?$/);
  return m ? m.slice(1).filter(Boolean) : [];
};
const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'has',
  'have',
  'value',
  'values',
  'type',
  'used',
  'number',
  'from',
  'that',
  'this',
]);
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

const instructions = (
  it: Item,
  labels: string[]
) => `Rewrite this question the way a researcher in the field would ask it.

Question: ${it.question}

Rules:
- Keep exactly the same meaning: the same property, the same per-paper answer, the same counting ("how many different values ... each paper") and the same filter.
- Keep the template name "${it.templateTitle}" verbatim, in quotes.${it.filterValue !== undefined ? `\n- Keep the filter value "${it.filterValue}" verbatim, in quotes.` : ''}
- Do not use the property label${labels.length > 1 ? 's' : ''} ${labels.map((l) => `"${l}"`).join(' and ')} or their words; describe what is meant in other words (a synonym or a short description). If no other wording exists, keep the label.
- One sentence. Reply with the question only.`;

let cost = 0;
const out: Item[] = [];
const review: string[] = [
  '# Sampled paraphrases: manual check',
  '',
  `Model: \`${model}\`. Mark each row ok / fix (and write the fix). Flagged rows still use label words.`,
  '',
  '| id | kind | original | paraphrase | flag | ok? |',
  '|---|---|---|---|---|---|',
];
await mapLimit(items, 5, async (it) => {
  const labels = labelsOf(it);
  const c = await chatCompletion(
    model,
    [{ role: 'user', content: instructions(it, labels) }],
    { maxTokens: 300 }
  );
  cost += c.costUsd;
  const para = c.text.trim().replace(/^"|"$/g, '').split('\n')[0];
  const leak = [...new Set(labels.flatMap(words))].filter((w) =>
    words(para).includes(w)
  );
  const keepsTemplate = para.includes(`"${it.templateTitle}"`);
  const keepsFilter =
    it.filterValue === undefined || para.includes(`"${it.filterValue}"`);
  const flags = [
    leak.length ? `label words: ${leak.join(', ')}` : '',
    keepsTemplate ? '' : 'template name changed',
    keepsFilter ? '' : 'filter value changed',
  ].filter(Boolean);
  out.push({
    ...it,
    question: para,
    paraphraseOf: it.question,
    paraphraseModel: model,
    ...(flags.length ? { paraphraseFlags: flags } : {}),
  });
});
out.sort(
  (a, b) =>
    data.items.findIndex((x) => x.id === a.id) -
    data.items.findIndex((x) => x.id === b.id)
);
for (const it of out)
  review.push(
    `| ${it.id} | ${it.kind} | ${String(it.paraphraseOf).replace(/\|/g, '\\|')} | ${it.question.replace(/\|/g, '\\|')} | ${((it.paraphraseFlags as string[]) ?? []).join('; ')} |  |`
  );
writeFileSync(
  join(here, 'data', 'sampled-para-cqs.json'),
  JSON.stringify(
    {
      ...data,
      source: `paraphrases of sampled-cqs.json by ${model} (paraphrase-sampled.ts)`,
      count: out.length,
      items: out,
    },
    null,
    1
  )
);
writeFileSync(
  join(here, 'data', 'sampled-para-review.md'),
  review.join('\n') + '\n'
);
const flagged = out.filter((it) => it.paraphraseFlags).length;
console.log(
  `${out.length} paraphrases, ${flagged} flagged, cost $${cost.toFixed(4)}`
);
