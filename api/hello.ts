
export const runtime = 'edge';
export async function GET() {
  return new Response(JSON.stringify({ ok: true, hello: 'world' }), {
    headers: { 'content-type': 'application/json' }
  });
}
