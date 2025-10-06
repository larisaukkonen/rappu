// Tallettaa HTML:n polkuun ruutu/<serial>.html
import { put } from "@vercel/blob";

type SaveBody = {
  html?: string;
  filename?: string; // admin lähettää esim. "ABC123.html" – ok
  dir?: string;      // "ruutu" (oletus)
  hallway?: unknown; // ei pakollinen
};

function sanitizeFileName(name: string) {
  // salli kirjaimet, numerot, .-_  (ei polunvaihtoja)
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const serial = String(req.query.serial || "").trim().toUpperCase();
  if (!serial) return res.status(400).send("Missing serial in URL");

  let body: SaveBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).send("Invalid JSON body");
  }

  const html = body?.html ?? "";
  if (!html || typeof html !== "string") return res.status(400).send("Missing html");

  const dir = (body?.dir || "ruutu").replace(/^\/*|\/*$/g, ""); // poista alku/loppuslashit
  // käytä annettua tiedostonimeä jos järkevä, muuten pakota <serial>.html
  const file = sanitizeFileName(body?.filename || `${serial}.html`);
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
