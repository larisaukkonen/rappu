
export const runtime = 'edge';
export async function POST(req: Request) {
  try {
    const { html, filename, dir } = await req.json();
    if (!html) return new Response(JSON.stringify({ ok: false, error: 'Missing html' }), { status: 400 });
    // Serial-less save is not recommended; require filename.
    if (!filename) return new Response(JSON.stringify({ ok: false, error: 'Filename required' }), { status: 400 });
    const { put } = await import('@vercel/blob');
    const key = `${dir || 'ruutu'}/${filename}`;
    const blob = await put(key, new Blob([html], { type: 'text/html' }), { access: 'public' });
    return new Response(JSON.stringify({ ok: true, url: blob.url, key }), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
