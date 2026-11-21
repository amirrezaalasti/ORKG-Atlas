import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

let ready;
export const ensureSchema = () =>
  (ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS audit_labels (
      annotator text PRIMARY KEY,
      labels jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS audit_saves (
      id bigserial PRIMARY KEY,
      annotator text NOT NULL,
      labels jsonb NOT NULL,
      user_agent text,
      saved_at timestamptz NOT NULL DEFAULT now()
    )`;
  })().catch((e) => {
    ready = undefined;
    throw e;
  }));

export const ANNOTATOR_RE = /^[A-Za-z0-9_-]{1,12}$/;
