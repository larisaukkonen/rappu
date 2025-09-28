import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { html, filename, dir = 'ruutu' } = req.body || {};
    if (!html || !filename) return res.status(400).json({ ok:false, error:'Missing html or filename' });

    const key = `${dir}/${filename}`;
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
