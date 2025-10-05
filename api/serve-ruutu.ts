
export const runtime = 'edge';
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });
  try {
    const { get } = await import('@vercel/blob');
    const file = await get(key);
    if (!file) return new Response('Not found', { status: 404 });
    const blobRes = await fetch(file.url);
    if (!blobRes.ok) return new Response('Not found', { status: 404 });
    const headers = new Headers(blobRes.headers);
    headers.set('cache-control', 'public, max-age=0, s-maxage=31536000, immutable');
    return new Response(blobRes.body, { status: 200, headers });
  } catch (e) {
    return new Response('Not found', { status: 404 });
  }
}
