/**
 * Copy shared/ into backend/src/_shared for Vercel deploys (backend-only root).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const repoShared = join(backendRoot, '..', 'shared');
const dest = join(backendRoot, 'src', '_shared');

if (!existsSync(repoShared)) {
  console.warn('sync-shared: repo shared/ not found, skipping');
  process.exit(0);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(repoShared, dest, { recursive: true });
console.log('sync-shared: copied shared/ → backend/src/_shared');
