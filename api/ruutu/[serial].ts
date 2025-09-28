import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { html, filename, dir = 'ruutu' } = req.body || {};
    const { serial } = req.query as { serial?: string };
    const finalName = (filename as string) || `${serial}.html`;
    if (!html || !finalName) return res.status(400).json({ ok:false, error:'Missing html' });

    const key = `${dir}/${finalName}`;
    const { url } = await put(key, html as string, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'text/html; charset=utf-8',
    });

    return res.status(200).json({ ok:true, url, path:`/${key}` });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error:e?.message || 'Upload failed' });
  }
}
