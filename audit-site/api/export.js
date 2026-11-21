import { sql, ensureSchema } from './_db.js';
import { timingSafeEqual } from 'node:crypto';

const ok = (given) => {
  const want = process.env.EXPORT_TOKEN || '';
  const a = Buffer.from(String(given || '')),
    b = Buffer.from(want);
  return want.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
  if (!ok(token)) return res.status(401).json({ error: 'unauthorized' });
  try {
    await ensureSchema();
    const rows =
      await sql`SELECT annotator, labels, updated_at FROM audit_labels ORDER BY annotator`;
    if (req.query.history === '1') {
      const saves =
        await sql`SELECT annotator, labels, user_agent, saved_at FROM audit_saves ORDER BY saved_at`;
      return res.status(200).json({ annotators: rows, saves });
    }
    return res.status(200).json({ annotators: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
