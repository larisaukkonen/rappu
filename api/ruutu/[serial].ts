// api/ruutu/[serial].ts
import { storage } from "../storage";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.removeHeader?.("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const serial = String(req.query.serial || "").trim().toUpperCase();
  if (!serial) return res.status(400).send("Missing serial in URL");

  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).send("Invalid JSON body"); }

  const html = body?.html;
  if (!html || typeof html !== "string") return res.status(400).send("Missing html");

  const dir = (body?.dir || "ruutu").replace(/^\/*|\/*$/g, "");
  const filename = String(body?.filename || `${serial}.html`).replace(/[^a-zA-Z0-9._-]/g, "");
  const key = `${dir}/${filename}`;

  try {
    const { url, key: savedKey } = await storage.saveHtml({
      key,
      html,
      addRandomSuffix: false,
      req,
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ ok: true, url, key: savedKey });
  } catch (e: any) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).send(`Blob save failed: ${e?.message || String(e)}`);
  }
}
