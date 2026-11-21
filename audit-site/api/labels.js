import { sql, ensureSchema, ANNOTATOR_RE } from './_db.js';

const MAX_BODY = 256 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const annotator = String(req.query.annotator || '');
      if (!ANNOTATOR_RE.test(annotator))
        return res.status(400).json({ error: 'bad annotator' });
      const rows =
        await sql`SELECT labels, updated_at FROM audit_labels WHERE annotator = ${annotator}`;
      return res
        .status(200)
        .json(
          rows[0]
            ? {
                annotator,
                labels: rows[0].labels,
                updatedAt: rows[0].updated_at,
              }
            : { annotator, labels: {} }
        );
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (JSON.stringify(body ?? null).length > MAX_BODY)
        return res.status(413).json({ error: 'too large' });
      const annotator = String(body?.annotator || '');
      const labels = body?.labels;
      if (!ANNOTATOR_RE.test(annotator))
        return res.status(400).json({ error: 'bad annotator' });
      if (!labels || typeof labels !== 'object' || Array.isArray(labels))
        return res.status(400).json({ error: 'bad labels' });
      const json = JSON.stringify(labels);
      const ua = String(req.headers['user-agent'] || '').slice(0, 300);
      // Merge per case so two tabs/devices never wipe each other's cases.
      await sql`INSERT INTO audit_labels (annotator, labels, updated_at) VALUES (${annotator}, ${json}::jsonb, now())
        ON CONFLICT (annotator) DO UPDATE SET labels = audit_labels.labels || EXCLUDED.labels, updated_at = now()`;
      await sql`INSERT INTO audit_saves (annotator, labels, user_agent) VALUES (${annotator}, ${json}::jsonb, ${ua})`;
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
