import type { VercelRequest, VercelResponse } from '@vercel/node';
import { head } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const file = (req.query.file as string) || '';
    if (!file) return res.status(400).send('Missing file');

    const key = `ruutu/${file}`;
    const meta = await head(key); // heittää virheen jos puuttuu
    const r = await fetch(meta.downloadUrl ?? meta.url);
    if (!r.ok) return res.status(404).send('Not found');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    const buf = Buffer.from(await r.arrayBuffer());
    return res.status(200).send(buf);
  } catch {
    return res.status(404).send('Not found');
  }
}
