// api/rss.ts
export default async function handler(req: any, res: any) {
  const setCors = () => {
    res.removeHeader?.("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  };

  setCors();

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  const url = String(req.query.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).send("Invalid url");

  try {
    const upstream = await fetch(url, { headers: { "User-Agent": "rappu-rss-proxy" } });
    if (!upstream.ok) return res.status(upstream.status).send("Upstream error");
    const text = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/rss+xml; charset=utf-8");
    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).send(`Proxy failed: ${e?.message || String(e)}`);
  }
}
