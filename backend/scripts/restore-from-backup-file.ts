/**
 * Restore a full Firestore backup JSON file using Firebase Admin (same logic as POST /api/restore).
 *
 * Loads env from backend/.env (FIREBASE_SERVICE_ACCOUNT_KEY required).
 *
 * Usage (from repo root):
 *   cd backend && npx tsx scripts/restore-from-backup-file.ts ../backups/firebase-backup-2026-05-08T20-13-15-527Z.json
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      'Usage: npx tsx scripts/restore-from-backup-file.ts <path-to-backup.json>'
    );
    process.exit(1);
  }

  const { restoreFromBackup } = await import(
    '../src/services/restoreService.js'
  );

  const backupContent = readFileSync(filePath, 'utf-8');
  console.log(`Restoring from ${filePath} ...`);

  const result = await restoreFromBackup(backupContent, (p) => {
    console.log(
      `[${p.collectionsProcessed}/${p.totalCollections}] ${p.currentCollection}: ${p.documentsProcessed}/${p.totalDocuments} docs`
    );
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
