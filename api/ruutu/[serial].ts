// api/ruutu/[serial].ts
import { put } from "@vercel/blob";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const serial = String(req.query.serial || "").trim().toUpperCase();
  if (!serial) return res.status(400).send("Missing serial in URL");

  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).send("Invalid JSON body"); }

  const html = body?.html;
  if (!html || typeof html !== "string") return res.status(400).send("Missing html");

  const dir = (body?.dir || "ruutu").replace(/^\/*|\/*$/g, "");
  const filename = (body?.filename || `${serial}.html`).replace(/[^a-zA-Z0-9._-]/g, "");
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
