// api/logo.ts
import { storage } from "./storage";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.removeHeader?.("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).send("Invalid JSON body"); }

  const dataUrl = String(body?.dataUrl || "");
  const filenameRaw = String(body?.filename || "");
  const serialRaw = String(body?.serial || "");
  if (!dataUrl.startsWith("data:") || !dataUrl.includes(";base64,")) {
    return res.status(400).send("Invalid dataUrl");
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return res.status(400).send("Invalid dataUrl");
  const contentType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  const safeName = filenameRaw.replace(/[^a-zA-Z0-9._-]/g, "") || `logo-${Date.now()}`;
  const safeSerial = serialRaw.trim().replace(/[^a-zA-Z0-9._-]/g, "");
  const key = safeSerial ? `logos/${safeSerial}/${safeName}` : `logos/${safeName}`;

  try {
    const { url } = await storage.saveBinary({
      key,
      buffer,
      contentType,
      addRandomSuffix: true,
      req,
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ ok: true, url, name: filenameRaw.replace(/\.[^.]+$/, "") });
  } catch (e: any) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).send(`Blob save failed: ${e?.message || String(e)}`);
  }
}
