// api/serve-ruutu.ts
import { storage } from "./storage.ts";

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

    // 1) Adminin raakapyyntö
    if (wantsRaw) {
      const html = await storage.getHtmlByKey({ key });
      if (!html) return res.status(404).send("Not Found");
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

    // 3) TV/webview → serve HTML
    if (isTv || hasTvParam) {
      const html = await storage.getHtmlByKey({ key });
      if (!html) return res.status(404).send("Not Found");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      allowEmbed();
      return res.status(200).send(html);
    }

    const html = await storage.getHtmlByKey({ key });
    if (!html) return res.status(404).send("Not Found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    allowEmbed();
    return res.status(200).send(html);
  } catch (err: any) {
    return res.status(500).send(`Error: ${err?.message || String(err)}`);
  }
}

