// api/serve-ruutu.ts
import { list } from "@vercel/blob";

/**
 * Access via rewrite:
 *   /ruutu/<file> → /api/serve-ruutu?key=ruutu/<file>
 */
export default async function handler(req: any, res: any) {
  try {
    const key = (req.query?.key as string) || "";
    if (!key) return res.status(400).send("Missing ?key=ruutu/<file>");

    // Exact match or first under the prefix
    const { blobs } = await list({ prefix: key, limit: 1 });
    const entry = blobs.find((b) => b.pathname === key) ?? blobs[0];
    if (!entry) return res.status(404).send("Not Found");

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.redirect(302, entry.url);
  } catch (err: any) {
    return res.status(500).send(`Error: ${err?.message || String(err)}`);
  }
}
