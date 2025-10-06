// Tallettaa HTML:n kun sarjanumeroa ei ole urlissa (fallback), vaatii kelvon filename:n
import { put } from "@vercel/blob";

type SaveBody = {
  html?: string;
  filename?: string; // PAKOLLINEN tässä versiossa
  dir?: string;      // "ruutu" (oletus)
  hallway?: unknown;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body: SaveBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).send("Invalid JSON body");
  }

  const html = body?.html ?? "";
  const rawFilename = body?.filename ?? "";
  if (!html || typeof html !== "string") return res.status(400).send("Missing html");
  if (!rawFilename) return res.status(400).send("Missing filename");

  const dir = (body?.dir || "ruutu").replace(/^\/*|\/*$/g, "");
  const file = sanitizeFileName(rawFilename);
  const key = `${dir}/${file}`;

  try {
    const { url } = await put(
      key,
      Buffer.from(html, "utf8"),
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "text/html; charset=utf-8",
        cacheControlMaxAge: 0
      }
    );
    return res.status(200).json({ ok: true, url, key });
  } catch (err: any) {
    return res.status(500).send(`Blob save failed: ${err?.message || String(err)}`);
  }
}
