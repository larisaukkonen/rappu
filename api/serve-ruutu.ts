// api/serve-ruutu.ts
import { list } from "@vercel/blob";

// /ruutu/<file> â†’ /api/serve-ruutu?key=ruutu/<file>
export default async function handler(req: any, res: any) {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.removeHeader?.("X-Frame-Options");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      return res.status(204).end();
    }
    const key = (req.query?.key as string) || "";
    if (!key) return res.status(400).send("Missing ?key=ruutu/<file>");

    // Poimi sarja: ruutu/ABC123.html â†’ ABC123
    const m = key.match(/^ruutu\/([^/]+)\.html$/i);
    const serial = m?.[1] || "";

    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const isTv = /webos|web0s|smarttv|netcast|lg\s?tv/.test(ua);

    // Case-insensitive query param lookup and tolerant truthy values
    const getQuery = (name: string): string => {
      const q = (req.query ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(q)) {
        if (k.toLowerCase() === name.toLowerCase()) {
          const v = q[k];
          return Array.isArray(v) ? String(v[0]) : String(v ?? "");
        }
      }
      return "";
    };
    const isTruthy = (v: string) => /^(1|true|yes)$/i.test(v);
    const hasTvParam = isTruthy(getQuery("tv"));
    const wantsRaw = isTruthy(getQuery("raw"));

    // Etsi blob
    const { blobs } = await list({ prefix: key, limit: 1 });
    const entry = blobs.find((b) => b.pathname === key) ?? blobs[0];
    if (!entry) return res.status(404).send("Not Found");

    // Headers to allow embedding (iframe) and cross-origin resource loads
    const allowEmbed = () => {
      const frameAncestors = (process.env.FRAME_ANCESTORS || "*").trim();
      // Ensure no legacy XFO blocks us (if set by platform defaults)
      res.removeHeader?.("X-Frame-Options");
      res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
      // CORS: keep permissive for served HTML; can be tightened later.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Referrer-Policy", "no-referrer");
    };

    // 1) Adminin raakapyyntÃ¶
    if (wantsRaw) {
      const sep = entry.url.includes('?') ? '&' : '?';
      const freshUrl = `${entry.url}${sep}ts=${Date.now()}`;
      const r = await fetch(freshUrl);
      if (!r.ok) return res.status(502).send("Upstream fetch failed");
      const html = await r.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      allowEmbed();
      return res.status(200).send(html);
    }

    // 2) Selain â†’ adminiin
    if (!isTv && !hasTvParam && serial) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, `/?serial=${encodeURIComponent(serial)}`);
    }

    // 3) TV/webview â†’ Blobin julkiseen URL:iin
    if (isTv || hasTvParam) {
      const sep = entry.url.includes('?') ? '&' : '?';
      const freshUrl = `${entry.url}${sep}ts=${Date.now()}`;
      const r = await fetch(freshUrl);
      if (!r.ok) return res.status(502).send("Upstream fetch failed");
      const html = await r.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      allowEmbed();
      return res.status(200).send(html);
    }

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.redirect(302, entry.url);
  } catch (err: any) {
    return res.status(500).send(`Error: ${err?.message || String(err)}`);
  }
}

