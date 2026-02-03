import path from "path";
import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { Request } from "express";
import { list, put } from "@vercel/blob";

type Driver = "vercel" | "local";

const getDriver = (): Driver => {
  const v = String(process.env.STORAGE_DRIVER || "vercel").toLowerCase();
  return v === "local" ? "local" : "vercel";
};

const getDataDir = () => {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
};

const ensureDir = async (filePath: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
};

const withRandomSuffix = (filename: string) => {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const suffix = randomBytes(6).toString("hex");
  return `${base}-${suffix}${ext}`;
};

const getBaseUrl = (req: Request | undefined) => {
  const envBase = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const proto = (req?.headers["x-forwarded-proto"] as string) || req?.protocol || "http";
  const host = req?.headers["host"];
  return host ? `${proto}://${host}` : "";
};

export const storage = {
  driver: getDriver,

  async saveHtml(opts: {
    key: string;
    html: string;
    addRandomSuffix: boolean;
    req?: Request;
  }): Promise<{ url: string; key: string }> {
    if (getDriver() === "local") {
      const dataDir = getDataDir();
      const key = opts.addRandomSuffix ? withRandomSuffix(opts.key) : opts.key;
      const filePath = path.join(dataDir, key);
      await ensureDir(filePath);
      await writeFile(filePath, opts.html, "utf8");
      const base = getBaseUrl(opts.req);
      const url = base ? `${base}/files/${key}` : `/files/${key}`;
      return { url, key };
    }

    const { url } = await put(opts.key, Buffer.from(opts.html, "utf8"), {
      access: "public",
      addRandomSuffix: opts.addRandomSuffix,
      contentType: "text/html; charset=utf-8",
      cacheControlMaxAge: 0,
    });
    return { url, key: opts.key };
  },

  async saveBinary(opts: {
    key: string;
    buffer: Buffer;
    contentType: string;
    addRandomSuffix: boolean;
    req?: Request;
  }): Promise<{ url: string; key: string }> {
    if (getDriver() === "local") {
      const dataDir = getDataDir();
      const key = opts.addRandomSuffix ? withRandomSuffix(opts.key) : opts.key;
      const filePath = path.join(dataDir, key);
      await ensureDir(filePath);
      await writeFile(filePath, opts.buffer);
      const base = getBaseUrl(opts.req);
      const url = base ? `${base}/files/${key}` : `/files/${key}`;
      return { url, key };
    }

    const { url } = await put(opts.key, opts.buffer, {
      access: "public",
      addRandomSuffix: opts.addRandomSuffix,
      contentType: opts.contentType,
      cacheControlMaxAge: 0,
    });
    return { url, key: opts.key };
  },

  async getHtmlByKey(opts: {
    key: string;
  }): Promise<string | null> {
    if (getDriver() === "local") {
      const dataDir = getDataDir();
      const filePath = path.join(dataDir, opts.key);
      try {
        return await readFile(filePath, "utf8");
      } catch {
        return null;
      }
    }

    const { blobs } = await list({ prefix: opts.key, limit: 1 });
    const entry = blobs.find((b) => b.pathname === opts.key) ?? blobs[0];
    if (!entry) return null;
    const sep = entry.url.includes("?") ? "&" : "?";
    const freshUrl = `${entry.url}${sep}ts=${Date.now()}`;
    const r = await fetch(freshUrl);
    if (!r.ok) return null;
    return await r.text();
  },
};
