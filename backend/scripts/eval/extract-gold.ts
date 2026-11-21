/**
 * Extract the curated CQ–SPARQL gold pairs (KG-EmpiRE + NLP4RE dashboards)
 * from a Firestore backup into scripts/eval/data/curated-cqs.json.
 *
 * Usage: npx tsx scripts/eval/extract-gold.ts <path-to-firebase-backup.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: extract-gold.ts <firebase-backup.json>');
  process.exit(1);
}

type BackupQuestion = {
  uid: string;
  title?: string;
  sparqlQuery?: string;
  sparqlQuery2?: string;
  gridOptions?: { defaultColumns?: string[] };
  dataAnalysisInformation?: { question?: string };
};

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const items = [];
for (const tpl of backup.Templates ?? []) {
  for (const q of (tpl.Questions ?? []) as BackupQuestion[]) {
    const goldQueries = [q.sparqlQuery, q.sparqlQuery2].filter(
      (s): s is string => !!s && s.trim().length > 0
    );
    if (goldQueries.length === 0) continue;
    const question = stripHtml(q.dataAnalysisInformation?.question ?? '');
    items.push({
      id: `${tpl.id}/${q.uid}`,
      dataset: 'curated',
      templateId: tpl.id as string,
      templateTitle: tpl.title as string,
      title: q.title ?? '',
      question: question || q.title || '',
      goldQueries,
    });
  }
}

items.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
const out = join(here, 'data', 'curated-cqs.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    { source: backupPath.split('/').pop(), count: items.length, items },
    null,
    2
  )
);
const perTemplate = items.reduce<Record<string, number>>((acc, i) => {
  acc[i.templateId] = (acc[i.templateId] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `Wrote ${items.length} questions (${items.reduce((n, i) => n + i.goldQueries.length, 0)} gold queries) to ${out}`,
  perTemplate
);
