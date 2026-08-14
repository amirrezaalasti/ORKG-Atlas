/**
 * Copy Templates (with Questions + Statistics) from EmpiRE Compass Firestore
 * into the Atlas Firestore project.
 *
 *   cd backend && npx tsx scripts/sync-templates-from-empire.ts
 *   cd backend && npx tsx scripts/sync-templates-from-empire.ts --overrides-only
 *   cd backend && npx tsx scripts/sync-templates-from-empire.ts --from-backup ../backups/firebase-backup-2026-05-08T20-13-15-527Z.json
 *
 * Dest is FIREBASE_SERVICE_ACCOUNT_KEY (Atlas).
 * Source is SOURCE_FIREBASE_SERVICE_ACCOUNT_KEY, or empire-compass-sandbox
 * credentials found in backend/.env (active or commented).
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_PATH });

const TEMPLATE_IDS = ['R186491', 'R1544125'];
const BATCH_SIZE = 400;

type ServiceAccount = {
  project_id: string;
  [key: string]: unknown;
};

type QuestionDoc = Record<string, unknown> & {
  id?: unknown;
  uid?: unknown;
};

type TemplateDoc = Record<string, unknown> & {
  id: string;
  Questions?: QuestionDoc[];
  Statistics?: Record<string, unknown>[];
};

function parseServiceAccountsFromEnvFile(envText: string): ServiceAccount[] {
  const accounts: ServiceAccount[] = [];
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let jsonText = line.slice(eq + 1).trim();
    if (jsonText.startsWith("'") || jsonText.startsWith('"')) {
      jsonText = jsonText.slice(1, -1);
    }
    const start = jsonText.indexOf('{');
    if (start < 0) continue;
    try {
      const parsed = JSON.parse(jsonText.slice(start)) as ServiceAccount;
      if (parsed?.project_id) accounts.push(parsed);
    } catch {
      // skip malformed blobs
    }
  }
  return accounts;
}

function uniqueByProject(accounts: ServiceAccount[]): ServiceAccount[] {
  const seen = new Set<string>();
  const out: ServiceAccount[] = [];
  for (const account of accounts) {
    if (seen.has(account.project_id)) continue;
    seen.add(account.project_id);
    out.push(account);
  }
  return out;
}

function initNamedApp(name: string, account: ServiceAccount): Firestore {
  const existing = getApps().find((app) => app.name === name);
  const app: App = existing
    ? existing
    : initializeApp({ credential: cert(account as never) }, name);
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings can only be applied once per app
  }
  return db;
}

function parseBackupTemplates(filePath: string): TemplateDoc[] {
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as
    | { data?: { Templates?: TemplateDoc[] }; Templates?: TemplateDoc[] }
    | TemplateDoc[];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.Templates)) return parsed.Templates;
  if (Array.isArray(parsed.data?.Templates)) return parsed.data.Templates;
  throw new Error(`No Templates array in backup ${filePath}`);
}

async function loadTemplatesFromFirestore(db: Firestore): Promise<TemplateDoc[]> {
  const snap = await db.collection('Templates').get();
  const templates: TemplateDoc[] = [];
  for (const doc of snap.docs) {
    const [questionsSnap, statsSnap] = await Promise.all([
      doc.ref.collection('Questions').get(),
      doc.ref.collection('Statistics').get(),
    ]);
    templates.push({
      id: doc.id,
      ...doc.data(),
      Questions: questionsSnap.docs.map((q) => {
        const data = q.data() as QuestionDoc;
        return {
          ...data,
          uid: data.uid || q.id,
          id: data.id,
        };
      }),
      Statistics: statsSnap.docs.map((s) => {
        const data = s.data() as Record<string, unknown>;
        return { ...data, id: data.id ?? s.id };
      }),
    });
  }
  return templates;
}

function questionDocId(question: QuestionDoc, fallbackIndex: number): string {
  const uid = typeof question.uid === 'string' ? question.uid.trim() : '';
  if (uid) return uid;
  const numeric =
    typeof question.id === 'number'
      ? question.id
      : typeof question.id === 'string' && /^\d+$/.test(question.id)
        ? Number(question.id)
        : null;
  if (numeric != null) return `query_${numeric}`;
  return `query_${fallbackIndex + 1}`;
}

function questionBody(question: QuestionDoc, docId: string): Record<string, unknown> {
  const { Questions: _q, Statistics: _s, ...rest } = question;
  const uid = typeof rest.uid === 'string' && rest.uid.trim() ? rest.uid : docId;
  const parsed = uid.match(/query_(\d+)/i);
  const id =
    typeof rest.id === 'number' && Number.isFinite(rest.id)
      ? rest.id
      : parsed
        ? Number(parsed[1])
        : rest.id;
  return { ...rest, uid, ...(id !== undefined ? { id } : {}) };
}

async function deleteSubcollection(
  db: Firestore,
  templateId: string,
  sub: 'Questions' | 'Statistics'
): Promise<number> {
  const col = db
    .collection('Templates')
    .doc(templateId)
    .collection(sub);
  const snap = await col.get();
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  return snap.size;
}

async function writeTemplates(
  dest: Firestore,
  templates: TemplateDoc[]
): Promise<void> {
  for (const template of templates) {
    const templateId = template.id;
    if (!templateId) continue;

    const deletedQuestions = await deleteSubcollection(
      dest,
      templateId,
      'Questions'
    );
    const deletedStats = await deleteSubcollection(
      dest,
      templateId,
      'Statistics'
    );

    const { Questions = [], Statistics = [], id: _id, ...fields } = template;
    await dest.collection('Templates').doc(templateId).set(fields);

    for (let i = 0; i < Questions.length; i += BATCH_SIZE) {
      const batch = dest.batch();
      const slice = Questions.slice(i, i + BATCH_SIZE);
      slice.forEach((question, offset) => {
        const docId = questionDocId(question, i + offset);
        const ref = dest
          .collection('Templates')
          .doc(templateId)
          .collection('Questions')
          .doc(docId);
        batch.set(ref, questionBody(question, docId));
      });
      await batch.commit();
    }

    for (let i = 0; i < Statistics.length; i += BATCH_SIZE) {
      const batch = dest.batch();
      const slice = Statistics.slice(i, i + BATCH_SIZE);
      slice.forEach((stat, offset) => {
        const statId = String(stat.id ?? stat.uid ?? `stat_${i + offset}`);
        const { id: _statId, ...statFields } = stat;
        const ref = dest
          .collection('Templates')
          .doc(templateId)
          .collection('Statistics')
          .doc(statId);
        batch.set(ref, { ...statFields, id: statId });
      });
      await batch.commit();
    }

    console.log(
      `${templateId}: replaced ${deletedQuestions} questions / ${deletedStats} stats with ${Questions.length} questions / ${Statistics.length} stats`
    );
  }
}

async function copyQuestionOverrides(
  source: Firestore,
  dest: Firestore
): Promise<number> {
  const snap = await source.collection('QuestionOverrides').get();
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = dest.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) {
      batch.set(dest.collection('QuestionOverrides').doc(doc.id), doc.data());
    }
    await batch.commit();
  }
  console.log(
    `QuestionOverrides: copied ${snap.size} docs (${snap.docs.map((d) => d.id).join(', ') || 'none'})`
  );
  return snap.size;
}

async function resolveSourceAccount(
  accounts: ServiceAccount[]
): Promise<ServiceAccount> {
  const sourceEnv = process.env.SOURCE_FIREBASE_SERVICE_ACCOUNT_KEY;
  const sourceAccount = sourceEnv
    ? (JSON.parse(sourceEnv) as ServiceAccount)
    : accounts.find((a) => a.project_id === 'empire-compass-sandbox');
  if (!sourceAccount) {
    throw new Error(
      'No EmpiRE Compass service account. Set SOURCE_FIREBASE_SERVICE_ACCOUNT_KEY'
    );
  }
  return sourceAccount;
}

async function main() {
  const backupArgIndex = process.argv.indexOf('--from-backup');
  const backupPath =
    backupArgIndex >= 0 ? process.argv[backupArgIndex + 1] : undefined;
  const overridesOnly = process.argv.includes('--overrides-only');

  const envText = readFileSync(ENV_PATH, 'utf-8');
  const accounts = uniqueByProject(parseServiceAccountsFromEnvFile(envText));
  const destAccount =
    accounts.find((a) => a.project_id === 'projectdbclass') ||
    accounts.find((a) => {
      try {
        return (
          JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}')
            .project_id === a.project_id
        );
      } catch {
        return false;
      }
    });
  if (!destAccount) {
    throw new Error('Could not find Atlas (projectdbclass) service account');
  }

  const destDb = initNamedApp('atlas', destAccount);
  console.log(`Atlas dest: ${destAccount.project_id}`);

  if (overridesOnly && backupPath) {
    throw new Error(
      'QuestionOverrides are not in the backup JSON. Omit --from-backup to copy them from live EmpiRE Compass.'
    );
  }

  if (!backupPath) {
    const sourceAccount = await resolveSourceAccount(accounts);
    const sourceDb = initNamedApp('empire', sourceAccount);
    console.log(`EmpiRE source: ${sourceAccount.project_id}`);

    if (overridesOnly) {
      await copyQuestionOverrides(sourceDb, destDb);
      console.log('Done.');
      return;
    }

    const templates = await loadTemplatesFromFirestore(sourceDb);
    const selected = templates.filter((t) => TEMPLATE_IDS.includes(t.id));
    if (selected.length === 0) {
      throw new Error(
        `No EmpiRE templates found. Have: ${templates.map((t) => t.id).join(', ') || '(none)'}`
      );
    }
    for (const t of selected) {
      console.log(
        `Source ${t.id}: ${(t.Questions || []).length} questions, ${(t.Statistics || []).length} stats`
      );
    }
    await writeTemplates(destDb, selected);
    await copyQuestionOverrides(sourceDb, destDb);
    console.log('Done.');
    return;
  }

  const abs = path.resolve(backupPath);
  const templates = parseBackupTemplates(abs);
  console.log(`Source: backup ${abs}`);
  const selected = templates.filter((t) => TEMPLATE_IDS.includes(t.id));
  if (selected.length === 0) {
    throw new Error(
      `No EmpiRE templates found. Have: ${templates.map((t) => t.id).join(', ') || '(none)'}`
    );
  }
  for (const t of selected) {
    console.log(
      `Source ${t.id}: ${(t.Questions || []).length} questions, ${(t.Statistics || []).length} stats`
    );
  }
  await writeTemplates(destDb, selected);
  console.log('Done.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
