// api/serve-ruutu.ts
export const config = { runtime: "edge" };

import { list } from "@vercel/blob";

/**
 * Usage via vercel.json rewrite:
 *   /ruutu/<file>  →  /api/serve-ruutu?key=ruutu/<file>
 */
export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response("Missing ?key=ruutu/<file>", { status: 400 });
    }

    // Try exact match first
    const exact = await list({ prefix: key, limit: 1 });
    const entry = exact.blobs.find(b => b.pathname === key) ?? exact.blobs[0];

    if (!entry) {
      return new Response("Not Found", { status: 404 });
    }

    // Permanent redirect to the Blob's public URL
    return Response.redirect(entry.url, 302);
  } catch (err: any) {
    return new Response(`Error: ${err?.message || String(err)}`, { status: 500 });
  }
}
