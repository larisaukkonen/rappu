import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import ruutuIndexHandler from "./api/ruutu/index.ts";
import ruutuSerialHandler from "./api/ruutu/[serial].ts";
import logoHandler from "./api/logo.ts";
import rssHandler from "./api/rss.ts";
import serveRuutuHandler from "./api/serve-ruutu.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.set("trust proxy", true);

// Keep body as raw text so existing handlers can JSON.parse as needed.
app.use(express.text({ type: "*/*", limit: "25mb" }));

const wrap = (handler: (req: any, res: any) => Promise<void> | void) => {
  return (req: any, res: any) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      res.status(500).send(`Error: ${err?.message || String(err)}`);
    });
  };
};

// API routes (Vercel-style handlers)
app.all("/api/ruutu", wrap(ruutuIndexHandler));
app.all("/api/ruutu/:serial", (req, res) => {
  req.query = { ...req.query, serial: req.params.serial };
  return wrap(ruutuSerialHandler)(req, res);
});
app.all("/api/logo", wrap(logoHandler));
app.all("/api/rss", wrap(rssHandler));
app.all("/api/serve-ruutu", wrap(serveRuutuHandler));

// /ruutu/* rewrite to /api/serve-ruutu?key=ruutu/<file>
app.all("/ruutu/*", (req, res) => {
  const file = req.params[0] || "";
  req.query = { ...req.query, key: `ruutu/${file}` };
  return wrap(serveRuutuHandler)(req, res);
});

// Simple /api/hello for sanity checks
app.get("/api/hello", (_req, res) => {
  res.setHeader("content-type", "application/json");
  res.status(200).send(JSON.stringify({ ok: true, hello: "world" }));
});

// Serve Vite build output
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir, { index: false }));

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Rappu listening on http://0.0.0.0:${port}`);
});
