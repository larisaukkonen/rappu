
export const runtime = 'edge';
export async function POST(req: Request, ctx: { params: { serial: string } }) {
  try {
    const { html, filename, dir } = await req.json();
    if (!html) return new Response(JSON.stringify({ ok: false, error: 'Missing html' }), { status: 400 });
    const serial = (ctx.params?.serial || '').toUpperCase().trim();
    if (!serial) return new Response(JSON.stringify({ ok: false, error: 'Missing serial' }), { status: 400 });
    const targetFile = filename || `${serial}.html`;
    const { put } = await import('@vercel/blob');
    const key = `${dir || 'ruutu'}/${targetFile}`;
    const blob = await put(key, new Blob([html], { type: 'text/html' }), { access: 'public' });
    return new Response(JSON.stringify({ ok: true, url: blob.url, key }), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
