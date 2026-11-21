/**
 * H3 (indirect): apply the template validator offline to every final query of the
 * given runs, including configurations that ran without it (no-schema, no-validator).
 * Reports how many queries the validator would have rejected and their mean F1.
 * No LLM calls.
 *
 * Usage: npx tsx scripts/eval/validate-offline.ts runs/a.jsonl [runs/b.jsonl …]
 */
import { readFileSync } from 'node:fs';
import { loadTemplateFlow } from '../../src/services/orkg/templateFlow.js';
import { validateTemplateScopedSparql } from '../../src/services/sparqlTemplateValidation.js';

type Rec = {
  itemId: string;
  templateId: string;
  config: string;
  model: string;
  run: number;
  finalQueries?: string[];
  executable?: boolean;
  nonEmpty?: boolean;
  error?: string;
};

const latest = new Map<string, Rec>();
for (const f of process.argv.slice(2)) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Rec;
    latest.set(`${r.itemId}|${r.config}|${r.model}|${r.run}`, r);
  }
}

const classOf = new Map<string, string | undefined>();
for (const r of latest.values()) {
  if (!classOf.has(r.templateId)) {
    const { targetClassId } = await loadTemplateFlow(r.templateId);
    classOf.set(r.templateId, targetClassId);
  }
}

type Agg = {
  n: number;
  rejected: number;
  rejEmpty: number;
  kinds: Map<string, number>;
};
const agg = new Map<string, Agg>();
for (const r of latest.values()) {
  if (r.error) continue;
  const key = `${r.model.split('/').pop()}\t${r.config}`;
  const a = agg.get(key) ?? {
    n: 0,
    rejected: 0,
    rejEmpty: 0,
    kinds: new Map(),
  };
  a.n++;
  const issue = (r.finalQueries ?? [])
    .map((q) =>
      validateTemplateScopedSparql(q, {
        templateId: r.templateId,
        targetClassId: classOf.get(r.templateId),
      })
    )
    .find((x) => !!x);
  if (issue) {
    a.rejected++;
    if (!r.nonEmpty) a.rejEmpty++;
    const kind = issue.message.includes('used as an RDF class')
      ? 'template-as-class'
      : issue.message.includes('requires orkgc')
        ? 'wrong-class'
        : 'missing-class';
    a.kinds.set(kind, (a.kinds.get(kind) ?? 0) + 1);
  }
  agg.set(key, a);
}

console.log('model\tconfig\tn\twould-reject\tof which empty/failed\tkinds');
for (const [k, a] of [...agg.entries()].sort()) {
  console.log(
    `${k}\t${a.n}\t${a.rejected}\t${a.rejEmpty}\t${[...a.kinds].map(([x, c]) => `${x}:${c}`).join(' ')}`
  );
}
