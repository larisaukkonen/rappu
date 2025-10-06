// api/serve-ruutu.ts
import { list } from "@vercel/blob";

// /ruutu/<file> → /api/serve-ruutu?key=ruutu/<file>
export default async function handler(req: any, res: any) {
  try {
    const key = (req.query?.key as string) || "";
    if (!key) return res.status(400).send("Missing ?key=ruutu/<file>");

    // Poimi sarja: ruutu/ABC123.html → ABC123
    const m = key.match(/^ruutu\/([^/]+)\.html$/i);
    const serial = m?.[1] || "";

    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const isTv = /webos|web0s|smarttv|netcast|lg\s?tv/.test(ua);
    const hasTvParam = String(req.query?.tv || "") === "1";
    const wantsRaw = String(req.query?.raw || "") === "1";

    // Etsi blob
    const { blobs } = await list({ prefix: key, limit: 1 });
    const entry = blobs.find((b) => b.pathname === key) ?? blobs[0];
    if (!entry) return res.status(404).send("Not Found");

    // 1) Adminin raakapyyntö
    if (wantsRaw) {
      const r = await fetch(entry.url);
      if (!r.ok) return res.status(502).send("Upstream fetch failed");
      const html = await r.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(html);
    }

    // 2) Selain → adminiin
    if (!isTv && !hasTvParam && serial) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, `/?serial=${encodeURIComponent(serial)}`);
    }

    // 3) TV/webview → Blobin julkiseen URL:iin
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.redirect(302, entry.url);
  } catch (err: any) {
    return res.status(500).send(`Error: ${err?.message || String(err)}`);
  }
}
