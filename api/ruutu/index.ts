// api/ruutu/index.ts  (fallback: vaatii filename:n)
import { put } from "@vercel/blob";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).send("Invalid JSON body"); }

  const html = body?.html;
  const filenameRaw = body?.filename;
  if (!html || typeof html !== "string") return res.status(400).send("Missing html");
  if (!filenameRaw) return res.status(400).send("Missing filename");

  const dir = (body?.dir || "ruutu").replace(/^\/*|\/*$/g, "");
  const filename = String(filenameRaw).replace(/[^a-zA-Z0-9._-]/g, "");
  const key = `${dir}/${filename}`;

  try {
    const { url } = await put(key, Buffer.from(html, "utf8"), {
      access: "public",
      addRandomSuffix: false,
      contentType: "text/html; charset=utf-8",
      cacheControlMaxAge: 0,
    });
    return res.status(200).json({ ok: true, url, key });
  } catch (e: any) {
    return res.status(500).send(`Blob save failed: ${e?.message || String(e)}`);
  }
}
