/**
 * Updates HomeContent/sections in repo backup JSON + Firestore.
 *
 *   cd backend && npx tsx scripts/sync-home-content-backup-and-firestore.ts
 *
 * Loads backend/.env (FIREBASE_SERVICE_ACCOUNT_KEY).
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const BACKUP_ABS = path.join(
  __dirname,
  '../../backups/firebase-backup-2026-05-08T20-13-15-527Z.json'
);

async function initFirebaseDb() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw?.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  }
  const credJson = JSON.parse(raw) as Record<string, unknown>;
  if (!getApps().length) {
    initializeApp({ credential: cert(credJson) });
  }
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function main() {
  const { defaultHomeContent } = await import(
    '../../src/firestore/homeContentModel.ts'
  );

  const parsed = JSON.parse(readFileSync(BACKUP_ABS, 'utf-8')) as {
    HomeContent?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };

  const homeArr = parsed.HomeContent;
  if (!Array.isArray(homeArr)) {
    throw new Error('Backup missing HomeContent array');
  }

  const idx = homeArr.findIndex((d) => d?.id === 'sections');
  if (idx < 0) {
    throw new Error('No HomeContent document with id "sections"');
  }

  const old = homeArr[idx] as {
    partners?: {
      partners?: Array<{ label: string; link: string; logoUrl: string }>;
    };
  };

  const nlpPartner = old.partners?.partners?.find((p) =>
    p.label.toLowerCase().includes('nlp4re')
  );

  const basePartners = [...defaultHomeContent.partners.partners];
  if (
    nlpPartner &&
    !basePartners.some((p) => p.label.toLowerCase().includes('nlp4re'))
  ) {
    basePartners.push(nlpPartner);
  }

  const newSections = {
    id: 'sections',
    ...defaultHomeContent,
    partners: {
      ...defaultHomeContent.partners,
      partners: basePartners,
    },
    updatedAt: new Date().toISOString(),
  };

  homeArr[idx] = newSections;

  writeFileSync(BACKUP_ABS, JSON.stringify(parsed, null, 2), 'utf-8');
  console.log(`Patched backup: ${BACKUP_ABS}`);

  const db = await initFirebaseDb();
  await db
    .collection('HomeContent')
    .doc('sections')
    .set(newSections, { merge: true });

  console.log(
    `Firestore updated: HomeContent/sections at ${newSections.updatedAt}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
