import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, MonitorPlay, Users, Building2, Hash, ExternalLink, Newspaper, Settings, Type, Building, Megaphone, Info, CloudSun, Copy } from "lucide-react";
import { cn } from "@/lib/utils"; // jos projektissa ei ole tätä, voit korvata paikallisella apurilla (kommentti alla)
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import SlateEditor from "./components/SlateEditor";
import WeatherClock from "./components/WeatherClock";
import { FI_MUNICIPALITIES } from "./data/fi-municipalities";

// Varmuuden vuoksi: jos cn puuttuu projektistasi, kommentoi yllä oleva import ja käytä tätä:
// const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Asukasnäyttö - Asetukset + TV-esikatselu
 * - Admin vasemmalla, TV-esikatselu oikealla (tai keskitettynä kun esikatselu pois päältä)
 * - Tallennus tuottaa staattisen HTML:n (LG TV) ja yrittää tallettaa sen /api/ruutu -päähän
 * - Käynnistyspromptti: hae talletettu näkymä sarjanumerolla tai aloita tyhjästä
 */

// ---------- Tyypit ----------
export type Tenant = { id: string; surname: string };
export type Apartment = {
  id: string;
  number: string; // esim. "101"
  tenants: Tenant[]; // 1-2 sukunimeä
};
export type Floor = {
  id: string;
  label: string; // esim. "Kerros 3"
  level: number; // numeerinen järjestysavain
  apartments: Apartment[];
};
export type Orientation = "portrait" | "landscape";
export type Hallway = {
  id: string;
  name: string; // esim. "Porraskäytävä B itäsiipi"
  building?: string;
  isActive: boolean;
  orientation?: Orientation; // pysty (1080x1920) tai vaaka (1920x1080)
  serial?: string; // laitteen sarjanumero
  scale?: number;
  mainScale?: number;
  headerScale?: number;
  weatherScale?: number;
  newsScale?: number;
  infoScale?: number;
  logosScale?: number;
  screenColumns?: number;
  checkIntervalMinutes?: number;
  buildingScale?: number;
  nameScale?: number;
  apartmentsManual?: boolean;
  apartmentsExternalUrl?: string;
  apartmentsExternalLogin?: string;
  apartmentsExternalPassword?: string;
  // Weather and clock settings
  weatherCity?: string;
  weatherLat?: number;
  weatherLon?: number;
  clockMode?: "auto" | "manual";
  clockDate?: string; // YYYY-MM-DD
  clockTime?: string; // HH:MM
  weatherClockEnabled?: boolean;
  // News
  newsEnabled?: boolean;
  newsRssUrl?: string;
  newsLimit?: number;
  newsTitle?: string;
  newsTitlePx?: number;
  // Logos
  logos?: { id: string; url: string; name?: string }[];
  logosAnimate?: boolean;
  logosLimit?: number;
  logosEnabled?: boolean;
  logosBgColor?: string;
  logosSpeed?: number;
  logosGap?: number;
  // Info panel
  infoEnabled?: boolean;
  infoHtml?: string;
  infoPinBottom?: boolean;
  infoAlignRight?: boolean;
  floors: Floor[]; // lajiteltu level:n mukaan
};

// ---------- Apuja ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const apartmentPlaceholder = (level: number, idx: number) => `${level * 100 + idx + 1}`;
const floorTitle = (floor: Floor) => {
  const label = (floor.label || "").trim();
  return label ? label : `Kerros ${floor.level}`;
};
const emptyHallway = (partial?: Partial<Hallway>): Hallway => ({
  id: partial?.id || "demo-hallway",
  name: partial?.name || "Käytävä A",
  building: partial?.building || "Rakennus",
  isActive: partial?.isActive ?? true,
  orientation: partial?.orientation || "landscape",
  serial: partial?.serial || "",
  scale: partial?.scale ?? 1,
  mainScale: partial?.mainScale ?? 1,
  headerScale: partial?.headerScale ?? 1,
  weatherScale: partial?.weatherScale ?? 1,
  newsScale: partial?.newsScale ?? 1,
  infoScale: partial?.infoScale ?? 1,
  logosScale: partial?.logosScale ?? 1,
  weatherCity: partial?.weatherCity || "",
  weatherLat: partial?.weatherLat,
  weatherLon: partial?.weatherLon,
  clockMode: partial?.clockMode || "auto",
  clockDate: partial?.clockDate,
  clockTime: partial?.clockTime,
  weatherClockEnabled: partial?.weatherClockEnabled ?? false,
  newsEnabled: partial?.newsEnabled ?? false,
  newsRssUrl: partial?.newsRssUrl || "",
  newsLimit: typeof partial?.newsLimit === "number" ? partial?.newsLimit : 5,
  newsTitle: partial?.newsTitle || "Uutiset",
  newsTitlePx: typeof partial?.newsTitlePx === "number" ? partial?.newsTitlePx : 36,
  logos: partial?.logos || [],
  logosAnimate: partial?.logosAnimate ?? false,
  logosLimit: partial?.logosLimit,
  logosEnabled: partial?.logosEnabled ?? false,
  logosBgColor: partial?.logosBgColor || "",
  logosSpeed: typeof partial?.logosSpeed === "number" ? partial?.logosSpeed : 20,
  logosGap: typeof partial?.logosGap === "number" ? partial?.logosGap : 32,
  infoEnabled: partial?.infoEnabled ?? false,
  infoHtml: partial?.infoHtml || "",
  infoPinBottom: partial?.infoPinBottom ?? false,
  infoAlignRight: partial?.infoAlignRight ?? false,
  screenColumns: typeof partial?.screenColumns === "number" ? partial?.screenColumns : 1,
  checkIntervalMinutes: typeof partial?.checkIntervalMinutes === "number" ? partial?.checkIntervalMinutes : 5,
  buildingScale: partial?.buildingScale ?? 1,
  nameScale: partial?.nameScale ?? 1,
  apartmentsManual: partial?.apartmentsManual ?? true,
  apartmentsExternalUrl: partial?.apartmentsExternalUrl || "",
  apartmentsExternalLogin: partial?.apartmentsExternalLogin || "",
  apartmentsExternalPassword: partial?.apartmentsExternalPassword || "",
  floors: partial?.floors || [],
});

// ---------- Yhteiset sarakejako-funktiot ----------
function computeLandscapeCounts(n: number): number[] {
  if (n <= 0) return [];
  const map: Record<number, number[]> = {
    1: [1],
    2: [1, 1],
    3: [2, 1],
    4: [2, 2],
    5: [2, 2, 1],
    6: [2, 2, 2],
    7: [2, 2, 2, 1],
    8: [2, 2, 2, 2],
    9: [3, 2, 2, 2],
    10: [3, 3, 2, 2],
    11: [3, 3, 3, 2],
    12: [3, 3, 3, 3],
  };
  if (map[n]) return map[n];
  // Fallback > 12: täytä 3/kolumni ja lisää uusi kolumni tarvittaessa
  const base = 3;
  const minCols = 4;
  const cols = Math.ceil((n - 12) / base) + minCols;
  const counts = Array(cols - 1).fill(base);
  counts.push(Math.max(0, n - base * (cols - 1)));
  return counts;
}

function computePortraitCounts(n: number): number[] {
  if (n <= 0) return [];
  const map: Record<number, number[]> = {
    1: [1],
    2: [2],
    3: [3],
    4: [4],
    5: [3, 2],
    6: [3, 3],
    7: [4, 3],
    8: [4, 4],
    9: [5, 4],
    10: [5, 5],
    11: [6, 5],
    12: [6, 6],
    13: [5, 5, 3],
    14: [5, 5, 4],
    15: [5, 5, 5],
  };
  if (map[n]) return map[n];
  const base = 5; // Fallback > 15
  const cols = Math.ceil(n / base);
  const counts = Array(cols - 1).fill(base);
  counts.push(Math.max(0, n - base * (cols - 1)));
  return counts;
}

function buildColumnsShared(items: Floor[], orientation: Orientation): Floor[][] {
  const counts = orientation === "landscape" ? computeLandscapeCounts(items.length) : computePortraitCounts(items.length);
  const out: Floor[][] = [];
  let idx = 0;
  for (let c = 0; c < counts.length; c++) {
    const take = counts[c];
    out.push(items.slice(idx, idx + take).reverse()); // näytä alhaalta yläs
    idx += take;
  }
  return out;
}

function MiniScaleControl({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value?: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const scale = typeof value === "number" && isFinite(value) ? value : 1;
  const dec = () => onChange(Math.max(0.5, Math.round(((scale - 0.05) * 100)) / 100));
  const inc = () => onChange(Math.min(2, Math.round(((scale + 0.05) * 100)) / 100));
  return (
    <div className="flex items-center gap-2" aria-label={ariaLabel}>
      <Button type="button" variant="secondary" onClick={dec} disabled={disabled}>-</Button>
      <div className="w-14 text-center tabular-nums">{Math.round(scale * 100)}%</div>
      <Button type="button" variant="secondary" onClick={inc} disabled={disabled}>+</Button>
    </div>
  );
}

// Polku ruudun julkaisuihin
const RUUTU_DIR = "ruutu";

// ---------- Backend-API:t (sovita omaan ympäristään) ----------
async function fetchHallway(hallwayId: string): Promise<Hallway> {
  // Tässä demossa palautetaan tyhjä, jotta appi käynnistyy ilman backendia
  return emptyHallway({ id: hallwayId });
}

type SaveResult = { ok: boolean; status?: number; statusText?: string; error?: string };
async function saveRuutu(hallway: Hallway, html: string, filename: string): Promise<SaveResult> {
  try {
    const serial = (hallway.serial || "").trim();
    const endpoint = serial ? `/api/ruutu/${encodeURIComponent(serial)}` : `/api/ruutu`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hallway, html, filename, dir: RUUTU_DIR }),
    });
    if (!res.ok) return { ok: false, status: res.status, statusText: res.statusText };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// --- LG TV: staattisen HTML:n muodostus ---
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeInfoHtml(html: string): string {
  try {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  } catch { return ""; }
}

function buildStaticTvHtml(h: Hallway): string {
  const orientation: Orientation = h.orientation || "landscape";
  const buildId = Date.now();
  const floorsAsc = [...h.floors].sort((a, b) => a.level - b.level);
  const maxColumns = Math.min(3, Math.max(1, Math.floor(h.screenColumns ?? 1)));
  const totalFloors = floorsAsc.length;
  const columnsCount = Math.min(maxColumns, Math.max(1, totalFloors));
  const columns: Floor[][] = [];

  if (columnsCount === 1) {
    columns.push(floorsAsc.slice().reverse());
  } else {
    const base = Math.floor(totalFloors / columnsCount);
    const extra = totalFloors % columnsCount;
    let index = 0;
    for (let col = 0; col < columnsCount; col++) {
      const take = base + (col < extra ? 1 : 0);
      columns.push(floorsAsc.slice(index, index + take).reverse());
      index += take;
    }
  }

  const renderFloor = (floor: Floor) => {
    const apartmentsHtml = floor.apartments
      .map((apt) => {
        const tenants = (apt.tenants || [])
          .filter((t) => t && t.surname && t.surname.trim().length > 0)
          .map((t) => escapeHtml(t.surname.toUpperCase()));
        const first = tenants[0] || '<span class="empty">(tyhja)</span>';
        const rest = tenants.slice(1).map((n) => `<div class="apt-name">${n}</div>`).join("");
        return (
          `<div class="apt-row">` +
          `<div class="apt-num">${escapeHtml(apt.number || "-")}</div>` +
          `<div class="apt-names">` +
          `<div class="apt-name">${first}</div>` +
          `${rest}` +
          `</div>` +
          `</div>`
        );
      })
      .join("");
    return (
      `<div class="floor">` +
      `<div class="floor-title">${escapeHtml(floorTitle(floor))}</div>` +
      `<div class="apt-list">${apartmentsHtml}</div>` +
      `</div>`
    );
  };

  const floorsHtml =
    columns.length > 1
      ? `<div class="floors-columns">${columns
          .map((col) => `<div class="floors-col">${col.map(renderFloor).join("")}</div>`)
          .join("")}</div>`
      : columns[0].map(renderFloor).join("");

  const baseW = orientation === "portrait" ? 1080 : 1920;
  const contentHeight = orientation === "portrait" ? 1920 : 1080;

  const logosAll = (h.logos || []).filter((l) => l && l.url);
  const logosLimit = typeof h.logosLimit === "number" && h.logosLimit > 0 ? Math.floor(h.logosLimit) : null;
  const logos = logosLimit ? logosAll.slice(0, logosLimit) : logosAll;

  const mainScale = typeof h.mainScale === "number" && isFinite(h.mainScale) ? h.mainScale : 1;
  const headerScale = typeof h.headerScale === "number" && isFinite(h.headerScale) ? h.headerScale : 1;
  const weatherScale = typeof h.weatherScale === "number" && isFinite(h.weatherScale) ? h.weatherScale : 1;
  const newsScale = typeof h.newsScale === "number" && isFinite(h.newsScale) ? h.newsScale : 1;
  const infoScale = typeof h.infoScale === "number" && isFinite(h.infoScale) ? h.infoScale : 1;
  const logosScale = typeof h.logosScale === "number" && isFinite(h.logosScale) ? h.logosScale : 1;
  const logosHeight = 130 * logosScale;
  const logosSpeed = typeof h.logosSpeed === "number" && isFinite(h.logosSpeed) ? h.logosSpeed : 20;

  const logosBg = (h.logosBgColor || "").trim();
  const logosBgStyle = logosBg ? ` style="background:${escapeHtml(logosBg)}"` : "";
  const logosHtml = h.logosEnabled && logos.length
    ? `<div id="logos" data-animate="${h.logosAnimate ? "true" : "false"}"${logosBgStyle}>
         <div class="logos-track" id="logos-track" data-base-count="${logos.length}">
           ${logos
             .map(
               (logo) =>
                 `<div class="logo-item"><img class="logo-img" src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.name || "Logo")}"/><div class="logo-name">${escapeHtml(logo.name || "")}</div></div>`
             )
             .join("")}
         </div>
       </div>`
    : "";

  const css = `
*{box-sizing:border-box}html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}a{color:inherit}
#container{position:relative;height:100vh;width:100vw;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
#scale-root{max-width:100%}
#header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 20px 0 20px;margin-bottom:48px;max-width:100%}
#clock{max-width:100%}
#brand{background:transparent}
#brand .title{font-size:calc(28px * var(--header-scale, 1));font-weight:600;letter-spacing:.02em}
#brand .subtitle{opacity:.7;margin-top:-4px;font-size:calc(14px * var(--header-scale, 1))}
#clock{display:flex;align-items:center;gap:16px}
#clock .time{font-size:calc(28px * var(--clock-scale, 1));font-weight:600}
#clock .date{font-size:calc(12px * var(--clock-scale, 1));opacity:.7}
#clock .temps{font-size:calc(14px * var(--clock-scale, 1));line-height:1.1}
#clock .icon{width:calc(32px * var(--clock-scale, 1));height:calc(32px * var(--clock-scale, 1))}
#clock .icon svg{width:100%;height:100%}
#content{position:relative;padding:0;transform-origin:top left;display:flex;flex-direction:column;height:${contentHeight}px}
#main{flex:1;display:flex;align-items:stretch;overflow:hidden;min-height:0}
.cols{display:flex;gap:32px;align-items:stretch;min-height:0;padding:0 20px;flex:1 1 0;width:100%}
.col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;min-height:0;padding:8px}
.col-main{overflow:hidden}
.col > .vcenter{margin:auto 0}
.inner-pad{padding-left:0;padding-right:0}
.inner-pad-info{display:flex;flex-direction:column;height:100%;flex:1;padding-left:10%;padding-right:10%}
.inner-pad-info.pin-bottom{padding-bottom:10px}
.inner-pad-info.pin-bottom #news + .info-content{margin-top:0}
.inner-pad-info.pin-bottom .info-content{margin-top:0}
.info-spacer{flex:1}
.floors-columns{display:flex;gap:32px;align-items:stretch;width:100%}
.floors-col{flex:1 1 0;min-width:0}
.cols-1 .col{flex-basis:100%}
.cols-2 .col{flex-basis:50%}
.floor{margin-bottom:24px;padding-bottom:15px}
.floor-title{font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px;font-size:calc(22px * var(--main-scale, 1))}
.apt-list{display:flex;flex-direction:column;gap:12px}
.apt-row{display:grid;grid-template-columns:calc(30px * var(--main-scale, 1)) 1fr;column-gap:24px}
.apt-num{font-weight:700;font-variant-numeric:tabular-nums;font-size:calc(14px * var(--main-scale, 1));white-space:nowrap}
.apt-names{min-width:0}
.apt-name{font-weight:700;font-size:calc(14px * var(--main-scale, 1));line-height:1.4286}
.empty{opacity:.4}
#footer{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:10px;opacity:.7;padding:8px}
.info-content p:empty::before{content:'\\00a0';display:inline-block}
#news{margin-top:0}
#news > .news-title{font-weight:700;letter-spacing:.04em;margin-bottom:10px;font-size:calc(var(--news-title-px, 18px) * var(--news-scale, 1))}
.news-item .news-title{font-weight:400;font-size:100%}
#news .news-list{display:flex;flex-direction:column;gap:10px}
#news .news-item{display:flex;gap:8px;font-size:calc(14px * var(--news-scale, 1));line-height:1.2}
#news .news-num{font-weight:700;background:#fff;color:#000;padding:4px;display:block;border-radius:6px;margin-right:5px}
#news .news-text{display:flex;flex-direction:column;gap:2px}
#news .news-cat{font-weight:700;text-transform:uppercase;padding:2px 0;font-size:120%}
#news .news-title{font-weight:400;font-size:100%}
#news + .info-content{margin-top:48px;font-size:calc(16px * var(--info-scale, 1))}
.info-content{font-size:calc(16px * var(--info-scale, 1))}
.info-content h1{font-size:calc(28px * var(--info-scale, 1));font-weight:400;line-height:1.2;margin:.4em 0 .3em}
.info-content h2{font-size:calc(22px * var(--info-scale, 1));font-weight:400;line-height:1.25;margin:.4em 0 .2em}
.info-align-right{text-align:right}
.info-content p{margin:.4em 0}
.info-content blockquote{border-left:4px solid rgba(255,255,255,0.2);margin:.6em 0;padding-left:12px}
.info-content ul,.info-content ol{margin:.4em 0 .6em 1.3em}
.info-content ul{list-style:disc}
.info-content ol{list-style:decimal}
#logos{height:${logosHeight}px;width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
#logos.logos-animate{justify-content:flex-start}
#logos .logos-track{display:flex;align-items:center;gap:var(--logos-gap, 32px);height:100%;width:max-content;will-change:transform}
#logos .logo-item{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:120px}
#logos .logo-img{height:60%;width:auto;max-width:100%;object-fit:contain}
#logos .logo-name{display:none}
#logos.logos-animate .logos-track{animation:logos-marquee var(--logos-speed, 20s) linear infinite}
@keyframes logos-marquee{from{transform:translateX(var(--logos-start, 0px))}to{transform:translateX(var(--logos-end, -100%))}}
`;

  const jsonEmbedded = JSON.stringify(h).replace(/</g, "\u003c");
  const infoHtml = h.infoEnabled && (h.infoHtml || "").trim() ? sanitizeInfoHtml(h.infoHtml || "") : "";
  const newsEnabled = !!h.newsEnabled && (h.newsRssUrl || "").trim().length > 0;
  const newsLimit = typeof h.newsLimit === "number" && h.newsLimit > 0 ? Math.floor(h.newsLimit) : null;
  const newsTitle = (h.newsTitle || "Uutiset").trim() || "Uutiset";
  const newsTitlePx = typeof h.newsTitlePx === "number" && isFinite(h.newsTitlePx) ? h.newsTitlePx : 36;
  const infoPinBottom = !!h.infoPinBottom;
  const infoAlignRight = !!h.infoAlignRight;
  const apiOrigin = typeof window !== "undefined" && window.location ? window.location.origin : "";

  const buildingName = (h.building || "").trim();

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"/>
<meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet,noimageindex"/>
<meta name="referrer" content="no-referrer"/>
<meta http-equiv="cache-control" content="no-cache"/>
<meta http-equiv="expires" content="0"/>
<title>${escapeHtml(buildingName ? `${buildingName} - ` : "")}${escapeHtml(h.name)}</title>
<meta name="build-id" content="${buildId}"/>
<style>${css}</style>
</head>
<body data-scale="${Number(h.scale ?? 1)}" data-build-id="${buildId}">
<div id="container" style="--main-scale:${mainScale};--clock-scale:${weatherScale};--news-scale:${newsScale};--info-scale:${infoScale};--header-scale:${headerScale};--news-title-px:${newsTitlePx}px;--logos-gap:${typeof h.logosGap === "number" && isFinite(h.logosGap) ? h.logosGap : 32}px;--logos-speed:${logosSpeed}s;">
    <div id="header">
      <div id="brand">
        ${buildingName ? `<div class="title">${escapeHtml(buildingName)}</div>` : ""}
        <div class="subtitle">${escapeHtml(h.name)}</div>
      </div>
      ${h.weatherClockEnabled ? `
      <div id="clock" aria-label="Aika, päivämäärä ja sää">
        <div class="td">
          <div id="time" class="time">--.--</div>
          <div id="date" class="date">--.--.----</div>
        </div>
        <div id="wxicon" class="icon" aria-hidden="true"></div>
        <div class="temps">
          <div id="tmax">? °C</div>
          <div id="tmin" class="min">? °C</div>
        </div>
      </div>` : ""}
    </div>
    ${orientation === "portrait" ? `<div id="scale-root" style="width:${baseW}px">` : ""}
    <div id="content" style="width:${baseW}px">
      <div id="main">
        <div class="cols ${infoHtml || newsEnabled ? "cols-2" : "cols-1"}">
          <div class="col col-main">
            <div class="inner-pad">
              ${floorsHtml}
            </div>
          </div>
          ${infoHtml || newsEnabled ? `<div class="col col-info"><div class="inner-pad inner-pad-info${infoPinBottom ? " pin-bottom" : ""}">
            ${newsEnabled ? `<div id="news"><div class="news-title" style="font-size:calc(${newsTitlePx}px * var(--news-scale, 1))">${escapeHtml(newsTitle)}</div><div class="news-list" id="news-list"></div></div>` : ""}
            ${infoPinBottom ? `<div class="info-spacer"></div>` : ""}
            ${infoHtml ? `<div class="info-content${infoAlignRight ? " info-align-right" : ""}">${infoHtml}</div>` : ""}
          </div></div>` : ""}
        </div>
      </div>
      ${logosHtml}
    </div>
    ${orientation === "portrait" ? `</div>` : ""}
    <div id="footer"></div>
  </div>
  
<script>(function(){
  var USER_SCALE = ${Number(h.scale ?? 1)};
  var BUILD_ID = ${buildId};
  var CHECK_INTERVAL_MIN = ${Math.min(100, Math.max(1, Math.floor(h.checkIntervalMinutes ?? 5)))};
  var CLOCK_MODE = ${JSON.stringify(h.clockMode || "auto")};
  var CLOCK_DATE = ${JSON.stringify(h.clockDate || "")};
  var CLOCK_TIME = ${JSON.stringify(h.clockTime || "")};
  var CITY = ${JSON.stringify(h.weatherCity || "")};
  var LAT = ${typeof h.weatherLat === "number" ? h.weatherLat : "null"};
  var LON = ${typeof h.weatherLon === "number" ? h.weatherLon : "null"};
  var NEWS_ENABLED = ${newsEnabled ? "true" : "false"};
  var NEWS_URL = ${JSON.stringify((h.newsRssUrl || "").trim())};
  var NEWS_LIMIT = ${newsLimit ?? "null"};
  var API_ORIGIN = ${JSON.stringify(apiOrigin)};
  var IS_PORTRAIT = ${orientation === "portrait" ? "true" : "false"};
  function fit(){
    var C=document.getElementById('container');
    var H = document.getElementById('header');
    var G=document.getElementById(IS_PORTRAIT ? 'scale-root' : 'content');
    var F=document.getElementById('footer');
    if(!C||!G){return;}
    var ch=C.clientHeight; var cw=C.clientWidth;
    var usedTop=H?H.getBoundingClientRect().height:0;
    var usedBottom=F?F.getBoundingClientRect().height:0;
    var availH=Math.max(0,ch-usedTop-usedBottom);
    var innerW=Math.max(0, cw-20);
    var innerH=Math.max(0, availH-20);
    var scaleW=innerW/(G.scrollWidth||1);
    var scaleH=innerH/(G.scrollHeight||1);
    var s=Math.min(1, scaleW, scaleH) * (USER_SCALE>0?USER_SCALE:1);
    G.style.transform='translate(10px,10px) scale('+s+')';
    G.style.transformOrigin='center top';
    if(H){
      var scaledW = (G.scrollWidth||1) * s;
      H.style.width = scaledW + 'px';
      H.style.marginLeft = '10px';
      H.style.marginRight = '0px';
    }
  }
  function getNow(){
    if(CLOCK_MODE==='manual' && CLOCK_DATE && CLOCK_TIME){
      var d=new Date(CLOCK_DATE+'T'+CLOCK_TIME);
      if(!isNaN(d.getTime())) return d;
    }
    return new Date();
  }
  function pad2(n){return (n<10?'0':'')+n}
  function updateClock(){
    var d=getNow();
    var hh=pad2(d.getHours()); var mm=pad2(d.getMinutes());
    var t=hh+'.'+mm;
    var ds=pad2(d.getDate())+'.'+pad2(d.getMonth()+1)+'.'+d.getFullYear();
    var te=document.getElementById('time'); var de=document.getElementById('date');
    if(te) te.textContent=t;
    if(de) de.textContent=ds;
  }
  function setTemps(tmax,tmin){
    var a=document.getElementById('tmax'); var b=document.getElementById('tmin');
    if(a) a.textContent = (isFinite(tmax)? Math.round(tmax): '?') + ' °C';
    if(b) b.textContent = (isFinite(tmin)? Math.round(tmin): '?') + ' °C';
  }
  function iconFor(code){
    // Minimal inline SVG icons to avoid external deps
    var sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>';
    var cloud = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 18Z" fill="currentColor"/></svg>';
    var rain = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 14Z" fill="currentColor"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3"/></svg>';
    var snow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v16M7 7l10 10M17 7L7 17"/></svg>';
    var fog = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor"/><path d="M3 16h18M5 19h14"/></svg>';
    var thunder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor"/><path d="M13 13l-3 6h3l-1 4 4-7h-3l1-3z"/></svg>';
    if(code==null) return cloud;
    if(code===0) return sun;
    if([1,2,3].indexOf(code)>-1) return cloud;
    if([45,48].indexOf(code)>-1) return fog;
    if([51,53,55,56,57,61,63,65,66,67,80,81,82].indexOf(code)>-1) return rain;
    if([71,73,75,77,85,86].indexOf(code)>-1) return snow;
    if([95,96,99].indexOf(code)>-1) return thunder;
    return cloud;
  }
  function setIcon(code){
    var w=document.getElementById('wxicon');
    if(!w) return; w.innerHTML = iconFor(code);
  }
  function resolveUrl(base, params){
    var u = new URL(base);
    for(var k in params) u.searchParams.set(k, params[k]);
    return u.toString();
  }
  function loadWeather(){
    var fallbackCity = 'Helsinki';
    var fallbackCoords = { lat: 60.1699, lon: 24.9384 };
    var cityName = (CITY || '').trim() || fallbackCity;
    var geoPromise;
    if(LAT!==null && LON!==null) geoPromise = Promise.resolve({lat:LAT, lon:LON});
    else geoPromise = fetch(resolveUrl('https://geocoding-api.open-meteo.com/v1/search',{name:cityName,count:'1',language:'fi',format:'json'}),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('geo'); return r.json(); })
      .then(function(d){ var g=d&&d.results&&d.results[0]; if(!g) throw new Error('geo'); return {lat:g.latitude, lon:g.longitude}; })
      .catch(function(){ return fallbackCoords; });
    geoPromise.then(function(pos){
      return fetch(resolveUrl('https://api.open-meteo.com/v1/forecast',{
        latitude: String(pos.lat),
        longitude: String(pos.lon),
        daily: 'temperature_2m_max,temperature_2m_min,weathercode',
        timezone: 'auto'
      }),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('weather'); return r.json(); })
      .then(function(d){
        var i=0;
        var tMax = d&&d.daily&&d.daily.temperature_2m_max? d.daily.temperature_2m_max[i]: null;
        var tMin = d&&d.daily&&d.daily.temperature_2m_min? d.daily.temperature_2m_min[i]: null;
        var rawCode = (d&&d.daily&&d.daily.weathercode? d.daily.weathercode[i]: null);
        if(rawCode == null && d&&d.daily&&d.daily.weather_code) rawCode = d.daily.weather_code[i];
        var code = (typeof rawCode === 'string') ? Number(rawCode) : rawCode;
        setTemps(tMax, tMin); setIcon(typeof code === 'number' && isFinite(code) ? code : null);
      });
    }).catch(function(){ setTemps(null,null); setIcon(null); });
  }
  function loadNews(){
    if(!NEWS_ENABLED || !NEWS_URL){return;}
    var base = (API_ORIGIN && API_ORIGIN !== 'null') ? API_ORIGIN : '';
    fetch(base + '/api/rss?url='+encodeURIComponent(NEWS_URL),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('news'); return r.text(); })
      .then(function(t){
        var xml = new DOMParser().parseFromString(t, 'text/xml');
        var items = Array.from(xml.querySelectorAll('item'));
        if(!items.length) items = Array.from(xml.querySelectorAll('entry'));
        var list = items.map(function(item){
          var title = (item.querySelector('title')&&item.querySelector('title').textContent||'').trim();
          var cat = (item.querySelector('category')&&item.querySelector('category').textContent||'').trim();
          if(!cat){ var el = item.querySelector('dc\:subject'); cat = el? (el.textContent||'').trim(): ''; }
          if(!cat){ var term = item.querySelector('category')&&item.querySelector('category').getAttribute('term'); cat = (term||'').trim(); }
          return title ? { title: title, category: cat } : null;
        }).filter(function(x){ return !!x; });
        if(NEWS_LIMIT && list.length > NEWS_LIMIT) list = list.slice(0, NEWS_LIMIT);
        var listEl = document.getElementById('news-list');
        if(!listEl) return;
        listEl.innerHTML = list.length ? list.map(function(item, idx){
          var safeTitle = (item.title||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          var safeCat = (item.category||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return '<div class="news-item"><div class="news-num">'+(idx+1)+'.</div><div class="news-text">' +
            (safeCat ? '<div class="news-cat">'+safeCat+'</div>' : '') +
            '<div class="news-title">'+safeTitle+'</div></div></div>';
        }).join('') : '<div class="news-item opacity-60">-</div>';
      }).catch(function(){});
  }
  var logosAnim = null;
  var logosAnimMeta = null;
  var logosState = { repeat: 1, span: 0 };
  var logosReady = false;
  var logosRaf = 0;
  var logosRO = null;
  var logosImgListeners = [];
  function cleanupLogos(){
    if(logosAnim){ logosAnim.cancel(); logosAnim = null; }
    logosAnimMeta = null;
    logosReady = false;
    logosState = { repeat: 1, span: 0 };
    if(logosRO){ logosRO.disconnect(); logosRO = null; }
    logosImgListeners.forEach(function(x){ x.img.removeEventListener('load', x.fn); });
    logosImgListeners = [];
    if(logosRaf){ cancelAnimationFrame(logosRaf); logosRaf = 0; }
  }
  function setupLogos(){
    try{
      var logos = document.getElementById('logos');
      var track = document.getElementById('logos-track');
      cleanupLogos();
      if(!logos || !track) return;
      var animate = logos.getAttribute('data-animate') === 'true';
      if(animate) logos.classList.add('logos-animate');
      else logos.classList.remove('logos-animate');
      track.style.animation = animate ? 'none' : '';
      if(!animate) return;
      if(!track.getAttribute('data-original-html')){
        var baseCountAttr = parseInt(track.getAttribute('data-base-count') || '0', 10);
        var baseCountFromDom = track.children.length;
        var baseCountSeed = baseCountAttr > 0 ? Math.min(baseCountAttr, baseCountFromDom) : baseCountFromDom;
        var baseNodes = Array.prototype.slice.call(track.children, 0, baseCountSeed);
        var baseHtml = baseNodes.map(function(node){ return node.outerHTML; }).join('');
        track.setAttribute('data-original-html', baseHtml);
        track.setAttribute('data-original-count', String(baseCountSeed));
      }
      var baseHtml = track.getAttribute('data-original-html') || '';
      var baseCount = parseInt(track.getAttribute('data-original-count') || '0', 10);
      if(!baseHtml || !baseCount) return;
      function bindImages(){
        logosImgListeners.forEach(function(x){ x.img.removeEventListener('load', x.fn); });
        logosImgListeners = [];
        var imgs = Array.from(track.querySelectorAll('img'));
        imgs.forEach(function(img){
          var fn = function(){ scheduleMeasure(); };
          img.addEventListener('load', fn, { once: true });
          logosImgListeners.push({ img: img, fn: fn });
        });
      }
      function startAnim(span){
        var speedStr = getComputedStyle(logos).getPropertyValue('--logos-speed');
        var speed = parseFloat(speedStr) || 20;
        if(!logosAnimMeta || logosAnimMeta.span !== span || logosAnimMeta.speed !== speed){
          if(logosAnim) logosAnim.cancel();
          logosAnim = track.animate(
            [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(" + (-span) + "px, 0, 0)" }],
            { duration: speed * 1000, iterations: Infinity, easing: "linear" }
          );
          logosAnimMeta = { span: span, speed: speed };
        }
      }
      function buildTrack(repeat){
        var tiledHtml = '';
        for(var i=0;i<repeat;i++){ tiledHtml += baseHtml; }
        track.innerHTML = tiledHtml + tiledHtml;
        logosReady = false;
        bindImages();
      }
      function measure(){
        var measureRoot = document.createElement('div');
        measureRoot.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;height:0;overflow:hidden;white-space:nowrap;';
        measureRoot.innerHTML = baseHtml;
        document.body.appendChild(measureRoot);
        var lastBase = measureRoot.children[baseCount - 1];
        var baseWidth = lastBase ? (lastBase.offsetLeft + lastBase.offsetWidth) : 0;
        document.body.removeChild(measureRoot);
        if(!Number.isFinite(baseWidth) || baseWidth <= 0) return;
        var wrapWidth = logos.clientWidth;
        var nextRepeat = Math.max(1, Math.ceil(wrapWidth / baseWidth));
        if(logosState.repeat !== nextRepeat){
          logosState.repeat = nextRepeat;
          buildTrack(nextRepeat);
          scheduleMeasure();
          return;
        }
        var children = track.children;
        var setCount = baseCount * nextRepeat;
        var first = children[0];
        var second = children[setCount];
        var span = (first && second) ? (second.offsetLeft - first.offsetLeft) : (baseWidth * nextRepeat);
        logosState.span = span;
        if(!logosReady){
          var baseImages = Array.from(children).slice(0, baseCount).map(function(el){ return el.querySelector('img'); }).filter(Boolean);
          var allLoaded = baseImages.length > 0 && baseImages.every(function(img){ return img.complete; });
          if(allLoaded) logosReady = true;
        }
        if(logosReady) startAnim(span);
      }
      function scheduleMeasure(){
        if(logosRaf) cancelAnimationFrame(logosRaf);
        logosRaf = requestAnimationFrame(function(){ logosRaf = 0; measure(); });
      }
      buildTrack(logosState.repeat);
      scheduleMeasure();
      if(typeof ResizeObserver !== 'undefined'){
        logosRO = new ResizeObserver(scheduleMeasure);
        logosRO.observe(logos);
      } else {
        window.addEventListener('resize', scheduleMeasure);
      }
    }catch(e){}
  }
  window.addEventListener('resize', fit);
  window.addEventListener('resize', setupLogos);
  document.addEventListener('DOMContentLoaded', fit);
  setTimeout(fit, 50);
  function extractBuildId(html){
    var m = html.match(/name="build-id" content="(\d+)"/);
    return m && m[1] ? m[1] : null;
  }
  function checkForUpdate(){
    try{
      var url = location.pathname + '?raw=1&_=' + Date.now();
      fetch(url, { cache:'no-store' }).then(function(r){ return r.text(); }).then(function(t){
        var next = extractBuildId(t);
        if(next && String(next) !== String(BUILD_ID)) location.reload();
      }).catch(function(){});
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', function(){ updateClock(); setInterval(updateClock, 60000); loadWeather(); setInterval(loadWeather, 60000); loadNews(); setInterval(loadNews, 5 * 60000); setupLogos(); checkForUpdate(); setInterval(checkForUpdate, CHECK_INTERVAL_MIN * 60000); });
  window.addEventListener('load', setupLogos);
})();</script>
  <script id="__HALLWAY_DATA__" type="application/json">${jsonEmbedded}</script>
</body>
</html>`;
}
function parseHallwayFromStaticHtml(html: string): Hallway | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const el = doc.getElementById("__HALLWAY_DATA__");
    if (!el) return null;
    const raw = el.textContent || el.innerHTML || "";
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data as Hallway;
  } catch {
    return null;
  }
}

// Pääte-tiedostonimi (sarjanumero etusijalla)
function staticFilenameFor(h: Hallway): string {
  const serial = (h.serial || "").trim();
  if (serial) return `${serial}.html`;
  return `hallway-${h.id}-${h.orientation || "landscape"}.html`;
}

function openStaticPreviewTab(h: Hallway) {
  try {
    const html = buildStaticTvHtml(h);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    if (win && typeof win.focus === "function") win.focus();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    console.error("Esikatselun avaaminen epäonnistui", e);
  }
}

// ---------- Pääkomponentti ----------
export default function App({ hallwayId = "demo-hallway" }: { hallwayId?: string }) {
  const [hallway, setHallway] = useState<Hallway>(emptyHallway());
  const [activeTab, setActiveTab] = useState<"hallinta" | "otsikko" | "asunnot" | "saa" | "info" | "uutiset" | "mainokset">("hallinta");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [showSavedDialog, setShowSavedDialog] = useState<boolean>(false);
  const [showSerialDialog, setShowSerialDialog] = useState<boolean>(false);
  const [serialInput, setSerialInput] = useState<string>("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState<string>("");
  const [savedFilename, setSavedFilename] = useState<string>("");
  const [serverSaveWarning, setServerSaveWarning] = useState<string>("");
  const [isCityOpen, setIsCityOpen] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<string>("");
  const [logoUploading, setLogoUploading] = useState<boolean>(false);
  const [logoUploadItems, setLogoUploadItems] = useState<
    { id: string; name: string; status: "pending" | "uploading" | "done" | "error"; message?: string }[]
  >([]);
  const [activeLogoId, setActiveLogoId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logosSpeedInput, setLogosSpeedInput] = useState<string>("20");
  const [logosSpeedTouched, setLogosSpeedTouched] = useState<boolean>(false);

  // Käynnistyspromptti
  const [showStartupPrompt, setShowStartupPrompt] = useState<boolean>(true);
  const [startupSerial, setStartupSerial] = useState<string>("");
  const [startupError, setStartupError] = useState<string>("");

  // Lukitusluokka gridiin (ettei wrapata kolumnit rikki)
  const lockClass = showStartupPrompt ? "pointer-events-none select-none blur-[1px]" : "";

  const applySavedViewMeta = (serial: string, html: string) => {
    const normalized = serial.trim().toUpperCase();
    if (!normalized) return;
    const filename = staticFilenameFor({ ...hallway, serial: normalized });
    const relPath = `/${RUUTU_DIR}/${filename}`;
    const absUrl = new URL(relPath, window.location.origin);
    absUrl.searchParams.set("raw", "1");
    setSavedHtml(html);
    setSavedFilename(filename);
    setSavedUrl(absUrl.toString());
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchHallway(hallwayId).catch(() => emptyHallway());
        if (!mounted) return;
        // Esimerkkidata tyhjään näkymään
        if (!data.floors.length) {
          const f1: Floor = { id: uid(), label: "Kerros 1", level: 1, apartments: [] };
          const f2: Floor = { id: uid(), label: "Kerros 2", level: 2, apartments: [] };
          setHallway({ ...data, floors: [f2, f1], orientation: data.orientation || "landscape" });
        } else {
          setHallway({ ...data, orientation: data.orientation || "landscape" });
        }
      } catch (e: any) {
        setError(e?.message || "Tuntematon virhe");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hallwayId]);

  useEffect(() => {
    setLogosSpeedTouched(false);
  }, [hallway.id]);

  useEffect(() => {
    if (!logosSpeedTouched) {
      const next = typeof hallway.logosSpeed === "number" && isFinite(hallway.logosSpeed) ? String(hallway.logosSpeed) : "20";
      setLogosSpeedInput(next);
    }
  }, [hallway.id, hallway.logosSpeed, logosSpeedTouched]);

  // CRUD - kerrokset, asunnot, asukkaat
  const addFloor = () =>
    setHallway((h) => {
      const maxLevel = h.floors.reduce((m, f) => Math.max(m, f.level), 0);
      const newLevel = maxLevel + 1;
      return {
        ...h,
        floors: [...h.floors, { id: uid(), label: `Kerros ${newLevel}`, level: newLevel, apartments: [] }],
      };
    });
  const deleteFloor = (floorId: string) => setHallway((h) => ({ ...h, floors: h.floors.filter((f) => f.id !== floorId) }));
  const updateFloor = (floorId: string, patch: Partial<Floor>) =>
    setHallway((h) => ({ ...h, floors: h.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)) }));

  const addApartment = (floorId: string) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) =>
        f.id === floorId
          ? { ...f, apartments: [...f.apartments, { id: uid(), number: "", tenants: [{ id: uid(), surname: "" }] }] }
          : f
      ),
    }));

  const deleteApartment = (floorId: string, aptId: string) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) => (f.id === floorId ? { ...f, apartments: f.apartments.filter((a) => a.id !== aptId) } : f)),
    }));

  const updateApartment = (floorId: string, aptId: string, patch: Partial<Apartment>) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) =>
        f.id === floorId ? { ...f, apartments: f.apartments.map((a) => (a.id === aptId ? { ...a, ...patch } : a)) } : f
      ),
    }));

  const addTenant = (floorId: string, aptId: string) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) =>
        f.id === floorId
          ? { ...f, apartments: f.apartments.map((a) => (a.id === aptId ? { ...a, tenants: [...a.tenants, { id: uid(), surname: "" }] } : a)) }
          : f
      ),
    }));

  const deleteTenant = (floorId: string, aptId: string, tenantId: string) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) =>
        f.id === floorId
          ? { ...f, apartments: f.apartments.map((a) => (a.id === aptId ? { ...a, tenants: a.tenants.filter((t) => t.id !== tenantId) } : a)) }
          : f
      ),
    }));

  const updateTenant = (floorId: string, aptId: string, tenantId: string, patch: Partial<Tenant>) =>
    setHallway((h) => ({
      ...h,
      floors: h.floors.map((f) =>
        f.id === floorId
          ? { ...f, apartments: f.apartments.map((a) => (a.id === aptId ? { ...a, tenants: a.tenants.map((t) => (t.id === tenantId ? { ...t, ...patch } : t)) } : a)) }
          : f
      ),
    }));

  const sortedFloors = useMemo(() => [...hallway.floors].sort((a, b) => b.level - a.level), [hallway.floors]);
  const logosSpeedValue = logosSpeedInput.trim();
  const logosSpeedNum = logosSpeedValue ? Number(logosSpeedValue) : NaN;
  const logosSpeedValid = Number.isFinite(logosSpeedNum) && logosSpeedNum >= 5 && logosSpeedNum <= 120;

  // Jos URLissa on ?serial=ABC, yritä hakea talletettu näkymä automaattisesti adminissa
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('serial');
    if (s) {
      const serial = s.toUpperCase();
      setStartupSerial(serial);
      (async () => {
        try {
          setStartupError("");
          const res = await fetch(`/ruutu/${encodeURIComponent(serial)}.html?raw=1`, { cache: 'no-store' });
          if (!res.ok) { setStartupError('Antamallasi sarjanumerolla ei löydy tallennettua näkymää.'); return; }
          const text = await res.text();
          const data = parseHallwayFromStaticHtml(text);
          if (!data) { setStartupError('Antamallasi sarjanumerolla ei löydy tallennettua näkymää.'); return; }
          setHallway({ ...emptyHallway(), ...data, serial });
          applySavedViewMeta(serial, text);
          setShowStartupPrompt(false);
        } catch {
          setStartupError('Antamallasi sarjanumerolla ei löydy tallennettua näkymää.');
        }
      })();
    }
  }, []);
  // Käynnistyspromptin toiminnot
  const handleStartupFetch = async () => {
    const serial = startupSerial.trim().toUpperCase();
    if (!serial) {
      setStartupError("Syötä sarjanumero.");
      return;
    }
    try {
      setStartupError("");
      const res = await fetch(`/ruutu/${encodeURIComponent(serial)}.html?raw=1`, { cache: "no-store" });
      if (!res.ok) {
        setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näkymää.");
        return;
      }
      const text = await res.text();
      const data = parseHallwayFromStaticHtml(text);
      if (!data) {
        setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näkymää.");
        return;
      }
      setHallway({ ...emptyHallway(), ...data, serial });
      applySavedViewMeta(serial, text);
      setShowStartupPrompt(false);
    } catch (e) {
      setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näkymää.");
    }
  };
  const handleCreateNew = () => {
    setHallway(emptyHallway({ orientation: hallway.orientation }));
    setSavedHtml("");
    setSavedFilename("");
    setSavedUrl(null);
    setShowStartupPrompt(false);
    setError("");
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("file-read-failed"));
      reader.readAsDataURL(file);
    });

  const uploadLogoFile = async (file: File, signal?: AbortSignal) => {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, filename: file.name }),
      signal,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { url: String(data.url || ""), name: String(data.name || "") };
  };


  const logoUploadAbortRef = useRef<AbortController | null>(null);
  const logoUploadBatchIdsRef = useRef<string[]>([]);
  const logoUploadCancelledRef = useRef<boolean>(false);
  const clearLogoInput = () => {
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const cancelLogoUpload = () => {
    logoUploadCancelledRef.current = true;
    logoUploadAbortRef.current?.abort();
    logoUploadAbortRef.current = null;
    setLogoUploading(false);
    setLogoUploadItems([]);
    setLogoError("");
    clearLogoInput();
    const toRemove = new Set(logoUploadBatchIdsRef.current);
    if (toRemove.size) {
      setHallway((h) => ({ ...h, logos: (h.logos || []).filter((l) => !toRemove.has(l.id)) }));
    }
    logoUploadBatchIdsRef.current = [];
  };

  const handleLogoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const existingCount = (hallway.logos || []).length;
    if (existingCount + files.length > 20) {
      setLogoError("Enintään 20 logoa sallittu.");
      setLogoUploadItems([]);
      clearLogoInput();
      return;
    }
    setLogoError("");
    setLogoUploading(true);
    logoUploadCancelledRef.current = false;
    logoUploadBatchIdsRef.current = [];
    const controller = new AbortController();
    logoUploadAbortRef.current = controller;
    let hadError = false;
    try {
      const pending = Array.from(files).map((file) => ({ file, id: uid() }));
      setLogoUploadItems(pending.map((item) => ({ id: item.id, name: item.file.name, status: "pending" })));
      for (const item of pending) {
        if (logoUploadCancelledRef.current) break;
        setLogoUploadItems((prev) =>
          prev.map((entry) => (entry.id === item.id ? { ...entry, status: "uploading" } : entry))
        );
        try {
          const uploaded = await uploadLogoFile(item.file, controller.signal);
          const cleanName = item.file.name.replace(/\.[^.]+$/, "");
          const newId = uid();
          logoUploadBatchIdsRef.current.push(newId);
          setHallway((h) => ({ ...h, logos: [...(h.logos || []), { id: newId, url: uploaded.url, name: uploaded.name || cleanName }] }));
          setLogoUploadItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, status: "done" } : entry))
          );
        } catch (e: any) {
          if (logoUploadCancelledRef.current || e?.name === "AbortError") {
            break;
          }
          const message = e?.message || "Lataus epäonnistui";
          hadError = true;
          setLogoUploadItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, status: "error", message } : entry))
          );
        }
      }
    } catch (e: any) {
      if (!logoUploadCancelledRef.current) {
        hadError = true;
        setLogoError(e?.message || "Logo-upload epäonnistui");
      }
    } finally {
      logoUploadAbortRef.current = null;
      if (!logoUploadCancelledRef.current) {
        setLogoUploading(false);
        if (!hadError) {
          setLogoUploadItems([]);
        }
      }
      clearLogoInput();
    }
  };


  const moveLogo = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setHallway((h) => {
      const list = [...(h.logos || [])];
      const fromIdx = list.findIndex((l) => l.id === fromId);
      const toIdx = list.findIndex((l) => l.id === toId);
      if (fromIdx < 0 || toIdx < 0) return h;
      const [item] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, item);
      return { ...h, logos: list };
    });
  };

  const removeLogo = (logoId: string) =>
    setHallway((h) => ({ ...h, logos: (h.logos || []).filter((l) => l.id !== logoId) }));

  const saveWithSerial = async (serialOverride?: string) => {
    const serial = serialOverride ?? hallway.serial?.trim();
    if (!serial) return;
    const hallwayToSave = serialOverride ? { ...hallway, serial } : hallway;
    try {
      setError("");
      setStatus("Tallennetaan...");
      const html = buildStaticTvHtml(hallwayToSave);
      const fname = staticFilenameFor(hallwayToSave);
      const relPath = `/${RUUTU_DIR}/${fname}`;

      const saveRes = await saveRuutu(hallwayToSave, html, fname);
      if (!saveRes.ok) {
        setServerSaveWarning(
          `Palvelintallennus ep?onnistui (${saveRes.status ?? ""} ${saveRes.statusText ?? saveRes.error ?? ""}). ` +
            `Loin ja latasin HTML:n paikallisesti - muista siirt?? tiedosto palvelimelle polkuun ${relPath} jotta TV l?yt?? sen.`
        );
      } else {
        setServerSaveWarning("");
      }

      setSavedHtml(html);
      setSavedFilename(fname);
      const absUrl = new URL(relPath, window.location.origin);
      absUrl.searchParams.set("raw", "1");
      setSavedUrl(saveRes.ok ? absUrl.toString() : null);
      setShowSavedDialog(true);
      setStatus("Tallennettu");
      setTimeout(() => setStatus(""), 3000);
    } catch (e: any) {
      setStatus("");
      setError(e?.message || "Tallennus ep?onnistui");
    }
  };

  const handleSave = async () => {
    const serial = hallway.serial?.trim();
    if (!serial) {
      setSerialInput(hallway.serial || "");
      setShowSerialDialog(true);
      return;
    }
    await saveWithSerial();
  };

  // Dev-testit ("test cases")
  useEffect(() => {
    const eq = (a: number[], b: number[]) => a.join(",") === b.join(",");
    const expectedLandscape: Record<number, number[]> = {
      1: [1], 2: [1, 1], 3: [2, 1], 4: [2, 2], 5: [2, 2, 1], 6: [2, 2, 2], 7: [2, 2, 2, 1], 8: [2, 2, 2, 2], 9: [3, 2, 2, 2], 10: [3, 3, 2, 2], 11: [3, 3, 3, 2], 12: [3, 3, 3, 3],
    };
    const expectedPortrait: Record<number, number[]> = {
      1: [1], 2: [2], 3: [3], 4: [4], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [5, 4], 10: [5, 5], 11: [6, 5], 12: [6, 6], 13: [5, 5, 3], 14: [5, 5, 4], 15: [5, 5, 5],
    };
    for (let n = 1; n <= 12; n++) console.assert(eq(computeLandscapeCounts(n), expectedLandscape[n]), "Landscape rule mismatch", n);
    for (let n = 1; n <= 15; n++) console.assert(eq(computePortraitCounts(n), expectedPortrait[n]), "Portrait rule mismatch", n);

    const html = buildStaticTvHtml(hallway);
    console.assert(html.startsWith("<!doctype html>"), "Staattinen HTML ei ala doctype:lla");
    console.assert(html.includes('name="robots"') && html.includes("noindex"), "Robots meta puuttuu");
    console.assert(staticFilenameFor({ ...hallway, serial: "ABC123" }) === "ABC123.html", "Sarjanumero-tiedostonimi ei toimi");

    // Palauta ja tarkista JSON-upotus
    const restored = parseHallwayFromStaticHtml(html);
    console.assert(!!restored && typeof restored === "object", "Upotetun JSON:n palautus epäonnistui");
  }, [hallway]);

  const cityQuery = hallway.weatherCity || "";
  const cityMatches = useMemo(
    () =>
      FI_MUNICIPALITIES
        .filter((n) => n.toLowerCase().includes(cityQuery.trim().toLowerCase()))
        .slice(0, 8),
    [cityQuery]
  );
  const showCitySuggest =
    isCityOpen &&
    cityQuery.trim().length >= 2 &&
    cityMatches.length > 0 &&
    hallway.weatherClockEnabled;

  if (loading) {
    return <div className="p-6 text-sm opacity-70">Ladataan hallintaa...</div>;
  }

  return (
    <div
      className={cn(
        "p-4 lg:p-8 bg-[#dedede]",
        showPreview ? "grid grid-cols-1 lg:grid-cols-[minmax(500px,2fr)_minmax(0,3fr)] gap-6" : "flex flex-col items-center gap-6"
      )}
    >
      {/* Käynnistyspromptti (overlay) */}
      {showStartupPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white text-black p-6 shadow-2xl">
            <h2 className="text-xl font-semibold mb-4">Aloita</h2>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Laitteen sarjanumero</Label>
                <div className="flex gap-2">
                  <Input value={startupSerial} onChange={(e) => setStartupSerial(e.target.value.toUpperCase())} placeholder="LAITTEEN SARJANUMERO" className="uppercase" />
                  <Button type="button" onClick={handleStartupFetch}>Hae</Button>
                </div>
                {startupError && <div className="text-sm text-red-600 mt-2">{startupError}</div>}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-80">Aloita tyhjästä näkymästä..</div>
                <Button type="button" variant="secondary" onClick={handleCreateNew}>Luo uusi</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Top header: brand + tabs + save */}
      <div className="mb-4 border-b col-span-full w-full">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-semibold">Infovisio</div>
          <div role="tablist" className="flex gap-3">
            <button role="tab" aria-selected={activeTab === "hallinta"} onClick={() => setActiveTab("hallinta")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "hallinta" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Asetukset</button>
            <button role="tab" aria-selected={activeTab === "otsikko"} onClick={() => setActiveTab("otsikko")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "otsikko" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Otsikko</button>
            <button role="tab" aria-selected={activeTab === "asunnot"} onClick={() => setActiveTab("asunnot")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "asunnot" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Asunnot</button>
            <button role="tab" aria-selected={activeTab === "saa"} onClick={() => setActiveTab("saa")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "saa" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Sää + aika</button>
            <button role="tab" aria-selected={activeTab === "uutiset"} onClick={() => setActiveTab("uutiset")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "uutiset" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Uutiset</button>
            <button role="tab" aria-selected={activeTab === "mainokset"} onClick={() => setActiveTab("mainokset")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "mainokset" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Mainokset</button>
            <button role="tab" aria-selected={activeTab === "info"} onClick={() => setActiveTab("info")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "info" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Info</button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.max(0.5, Math.round((((h.scale ?? 1) - 0.05) * 100)) / 100) }))}>-</Button>
              <div className="w-14 text-center tabular-nums">{Math.round(((hallway.scale ?? 1) * 100))}%</div>
              <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.min(2, Math.round((((h.scale ?? 1) + 0.05) * 100)) / 100) }))}>+</Button>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="orientation" className="text-sm font-normal">Suunta</Label>
              <select
                id="orientation"
                value={hallway.orientation || "landscape"}
                onChange={(e) => setHallway((h) => ({ ...h, orientation: e.target.value as Orientation }))}
                className="h-9 px-2 rounded-md border bg-white text-black"
              >
                <option value="portrait">Pysty</option>
                <option value="landscape">Vaaka</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span>Esikatselu</span>
              <button
                type="button"
                role="switch"
                aria-checked={showPreview}
                onClick={() => setShowPreview((prev) => !prev)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  showPreview ? "bg-black" : "bg-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                    showPreview ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
            <span className="inline-flex" title={!hallway.serial?.trim() ? "Näkymää ei voi tallentaa ilman sarjanumeroa (määritetään Asetukset-välilehdellä)." : "Tallenna näkymä annetulla sarjanumerolla."}>
            <Button
              onClick={handleSave}
              className={cn("rounded-2xl px-4", !hallway.serial?.trim() && "text-red-700")}
            >
              <Save className="h-4 w-4 mr-2"/>Tallenna
            </Button>
            </span>
          </div>
        </div>
      </div>
      {/* Editori (kolumni 1) */}
      <div className={cn(showPreview ? "min-w-0 lg:min-w-[500px]" : "w-full max-w-4xl")}>        
        <Card className="shadow-lg">
          <CardHeader className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              {activeTab === 'hallinta' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Settings className="h-5 w-5"/>Asukasnäyttö - Asetukset</CardTitle>
                  <p className="text-sm opacity-70">Määritä laitteen asetukset ja tallennusväli. Muutokset näkyvät oikealla esikatselussa.</p>
                </>
              )}
              {activeTab === 'otsikko' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Type className="h-5 w-5"/>Asukasnäyttö - Otsikko</CardTitle>
                  <p className="text-sm opacity-70">Muokkaa rakennuksen ja käytävän otsikkoalueen tekstejä sekä zoomia.</p>
                </>
              )}
              {activeTab === 'asunnot' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Building className="h-5 w-5"/>Asukasnäyttö - Asunnot</CardTitle>
                  <p className="text-sm opacity-70">Muokkaa kerroksia, asuntoja ja asukkaiden sukunimiä. Muutokset näkyvät oikealla esikatselussa.</p>
                </>
              )}
              {activeTab === 'saa' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><CloudSun className="h-5 w-5"/>Asukasnäyttö - Sää + aika</CardTitle>
                  <p className="text-sm opacity-70">Määritä ruudulla näkyvä sää paikkakunnan mukaan. Voit käyttää myös automaattista tai manuaalista aikaa ja päivämäärää.</p>
                </>
              )}
              {activeTab === 'info' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Info className="h-5 w-5"/>Asukasnäyttö - Info</CardTitle>
                  <p className="text-sm opacity-70">Jos haluat tiedottaa yleisölle jotain, voit tehdä sen ottamalla infoalue käyttöön ja syöttämällä tekstiä ja antamalla sille haluamasi tyylit.</p>
                </>
              )}
              {activeTab === 'uutiset' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Newspaper className="h-5 w-5"/>Asukasnäyttö - Uutiset</CardTitle>
                  <p className="text-sm opacity-70">Näytä RSS-syötteestä uutiset ruudun oikeassa laidassa sään alapuolella. Määritä syötteen osoite ja halutessasi näytettävien uutisten määrä.</p>
                </>
              )}
              {activeTab === 'mainokset' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Megaphone className="h-5 w-5"/>Asukasnäyttö - Mainokset</CardTitle>
                  <p className="text-sm opacity-70">Lisää logot, järjestä ne vetämällä ja määritä näkyvien logoiden määrä.</p>
                </>
              )}
            </div>
            <div className="shrink-0">
              {activeTab === "otsikko" && (
                <MiniScaleControl value={hallway.headerScale} onChange={(v) => setHallway((h) => ({ ...h, headerScale: v }))} ariaLabel="Otsikon ja nimen zoom" />
              )}
              {activeTab === "asunnot" && (
                <MiniScaleControl value={hallway.mainScale} onChange={(v) => setHallway((h) => ({ ...h, mainScale: v }))} ariaLabel="Asukaslistan zoom" />
              )}
              {activeTab === "saa" && (
                <MiniScaleControl value={hallway.weatherScale} onChange={(v) => setHallway((h) => ({ ...h, weatherScale: v }))} ariaLabel="Sään zoom" disabled={!hallway.weatherClockEnabled} />
              )}
              {activeTab === "uutiset" && (
                <MiniScaleControl value={hallway.newsScale} onChange={(v) => setHallway((h) => ({ ...h, newsScale: v }))} ariaLabel="Uutisten zoom" disabled={!hallway.newsEnabled} />
              )}
              {activeTab === "info" && (
                <MiniScaleControl value={hallway.infoScale} onChange={(v) => setHallway((h) => ({ ...h, infoScale: v }))} ariaLabel="Info-zoom" disabled={!hallway.infoEnabled} />
              )}
              {activeTab === "mainokset" && (
                <MiniScaleControl value={hallway.logosScale} onChange={(v) => setHallway((h) => ({ ...h, logosScale: v }))} ariaLabel="Logo-zoom" disabled={!hallway.logosEnabled} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "hallinta" && (
              <>
                {/* Sarjanumero */}
                <div className="mb-4">
                  <Label htmlFor="device-serial">Uuden laitteen sarjanumero <span className="text-red-600" aria-hidden="true">*</span></Label>
                  <Input
                    id="device-serial"
                    value={hallway.serial || ""}
                    onChange={(e) => setHallway((h) => ({ ...h, serial: e.target.value.toUpperCase() }))}
                    placeholder="LAITTEEN SARJANUMERO"
                    className="uppercase"
                    required
                    aria-required="true"
                  />
                </div>

                <div className="mb-4">
                  <Label htmlFor="check-interval">Tarkistusväli</Label>
                  <Input
                    id="check-interval"
                    type="number"
                    min={1}
                    max={100}
                    value={hallway.checkIntervalMinutes ?? 5}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      const value = Number.isFinite(next) ? Math.min(100, Math.max(1, Math.floor(next))) : 5;
                      setHallway((h) => ({ ...h, checkIntervalMinutes: value }));
                    }}
                    className="w-48"
                  />
                  <div className="text-xs opacity-70 mt-1">Minuutteina (1-100). Määrittää kuinka usein ruutu tarkistaa uudet muutokset.</div>
                </div>

                <div className="mb-4">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={savedUrl || ""}
                      placeholder={"N\u00e4kym\u00e4\u00e4 ei ole tallennettu"}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => savedUrl && navigator.clipboard.writeText(savedUrl)}
                      disabled={!savedUrl}
                      className="rounded-2xl"
                      aria-label="Kopioi URL"
                      title="Kopioi URL"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mb-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => savedHtml && downloadStaticHtmlFile(savedFilename || "ruutu.html", savedHtml)}
                    disabled={!savedHtml}
                    className="rounded-2xl"
                  >
                    Lataa tallennettu HTML
                  </Button>
                </div>

                {!(hallway.apartmentsManual ?? true) && (
                  <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div className="md:col-span-3">
                          <Label htmlFor="apartments-url">Ulkoinen osoite (URI)</Label>
                          <Input
                            id="apartments-url"
                            value={hallway.apartmentsExternalUrl || ""}
                            onChange={(e) => setHallway((h) => ({ ...h, apartmentsExternalUrl: e.target.value }))}
                            placeholder="https://example.com/asunnot.json"
                          />
                        </div>
                        <div>
                          <Label htmlFor="apartments-login">Käyttäjätunnus</Label>
                          <Input
                            id="apartments-login"
                            value={hallway.apartmentsExternalLogin || ""}
                            onChange={(e) => setHallway((h) => ({ ...h, apartmentsExternalLogin: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="apartments-password">Salasana</Label>
                          <Input
                            id="apartments-password"
                            type="password"
                            value={hallway.apartmentsExternalPassword || ""}
                            onChange={(e) => setHallway((h) => ({ ...h, apartmentsExternalPassword: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="text-sm font-medium mb-2">Esimerkkirakenne (valinnainen: hallway)</div>
                      <pre className="text-xs bg-zinc-100 border border-zinc-200 rounded-lg p-3 overflow-auto">
                        <code>{`{
  "hallway": {
    "name": "Käytävä A",
    "floors": [
      {
        "name": "Kerros 1",
        "apartments": [
          {
            "number": "101",
            "tenants": [
              { "name": "Sukunimi" },
              { "name": "Sukunimi 2" }
            ]
          }
        ]
      }
    ]
  }
}`}</code>
                      </pre>
                      <div className="text-xs opacity-70 mt-2">
                        Jos <code>hallway</code> puuttuu, oletetaan että syöte koskee yhtä käytävää. <code>floors</code>, <code>name</code>, <code>apartments</code>, <code>number</code> ja <code>tenants</code> ovat pakollisia.
                      </div>
                  </>
                )}

                {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
                {status && <div className="mb-3 text-sm text-green-600">{status}</div>}
                {serverSaveWarning && (
                  <div className="mb-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-md p-2">{serverSaveWarning}</div>
                )}
              </>
            )}

            {activeTab === "otsikko" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <Label htmlFor="building-name">Rakennus</Label>
                    <Input id="building-name" value={hallway.building || ""} onChange={(e) => setHallway((h) => ({ ...h, building: e.target.value }))} placeholder="valinnainen" />
                  </div>
                  <div>
                    <Label htmlFor="hallway-name">Käytävän nimi</Label>
                    <Input id="hallway-name" value={hallway.name} onChange={(e) => setHallway((h) => ({ ...h, name: e.target.value }))} placeholder="esim. Porraskäytävä B - itäsiipi" />
                  </div>
                </div>
              </>
            )}

            {activeTab === "asunnot" && (
              <>
                {!(hallway.apartmentsManual ?? true) && (
                  <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                    Asuntojen manuaalinen määritys pois käytöstä. Hallintaportaali määrittää käytettävän tietolähteen.
                  </div>
                )}

                <div className="mb-4">
                  <Label htmlFor="screen-columns">Näytön sarakkeet</Label>
                  <Input
                    id="screen-columns"
                    type="number"
                    min={1}
                    max={3}
                    value={hallway.screenColumns ?? 1}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      const value = Number.isFinite(next) ? Math.min(3, Math.max(1, Math.floor(next))) : 1;
                      setHallway((h) => ({ ...h, screenColumns: value }));
                    }}
                    className="w-48"
                  />
                </div>

                <div className={cn(!(hallway.apartmentsManual ?? true) && "opacity-60 pointer-events-none")}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4"/>Kerrokset</h3>
                    <Button variant="secondary" onClick={addFloor} className="rounded-2xl"><Plus className="h-4 w-4 mr-1"/>Lisää kerros</Button>
                  </div>

                  <ScrollArea className="h-[60vh] pr-2">
                    <div className="space-y-4">
                      {sortedFloors.map((floor) => (
                        <motion.div key={floor.id} className="rounded-2xl p-3 pt-[35px] relative bg-[#dddddd]">
                          <button aria-label="Poista kerros" title="Poista kerros" onClick={() => deleteFloor(floor.id)} className="absolute top-5 right-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-12 md:col-span-6">
                              <Label>Otsikko</Label>
                              <Input value={floor.label} onChange={(e) => updateFloor(floor.id, { label: e.target.value })} placeholder={`Kerros ${floor.level}`} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Label>Taso (järjestys)</Label>
                              <Input type="number" value={floor.level} onChange={(e) => updateFloor(floor.id, { level: Number(e.target.value) })} />
                            </div>

                            <div className="col-span-12">
                              <div className="flex items-center justify-between mt-4">
                                <h4 className="font-medium flex items-center gap-2"><Hash className="h-4 w-4"/>Asunnot</h4>
                                <Button size="sm" variant="secondary" onClick={() => addApartment(floor.id)} className="rounded-2xl"><Plus className="h-4 w-4 mr-1"/>Lisää asunto</Button>
                              </div>

                              <div className="mt-2 grid grid-cols-1 gap-3">
                                {floor.apartments.map((apt, aptIdx) => (
                                  <motion.div
                                    key={apt.id}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    transition={{ duration: 0.1, ease: "linear" }}
                                    className="rounded-xl p-3 pb-4 bg-[#cccccc] relative"
                                    style={{ overflow: "hidden" }}
                                  >
                                    <button aria-label="Poista asunto" title="Poista asunto" onClick={() => deleteApartment(floor.id, apt.id)} className="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                                    <div className="grid grid-cols-1 md:grid-cols-[minmax(50px,1fr)_4fr] gap-x-4 gap-y-2">
                                      <Label>Numero</Label>
                                      <div className="flex items-center justify-between gap-2">
                                        <Label>Asukkaat (1-2)</Label>
                                      </div>
                                      <Input value={apt.number} onChange={(e) => updateApartment(floor.id, apt.id, { number: e.target.value })} placeholder={apartmentPlaceholder(floor.level, aptIdx)} className="w-full min-w-[50px]" />
                                      <div className="space-y-2">
                                        {apt.tenants.map((t, tenantIdx) => (
                                          <div key={t.id} className="flex flex-wrap items-center gap-2">
                                            <div className="w-full md:w-1/2">
                                              <Input value={t.surname} onChange={(e) => updateTenant(floor.id, apt.id, t.id, { surname: e.target.value })} placeholder="Sukunimi" className="w-full" />
                                            </div>
                                            {tenantIdx > 0 ? (
                                              <button aria-label="Poista asukas" title="Poista asukas" onClick={() => deleteTenant(floor.id, apt.id, t.id)} className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                                            ) : (
                                              <span className="inline-flex items-center justify-center bg-[#c9c9c9] text-zinc-600 rounded-2xl px-[3px] py-1" aria-hidden="true"><Trash2 className="h-4 w-4"/></span>
                                            )}
                                            {tenantIdx === 0 && (
                                              <Button size="sm" onClick={() => addTenant(floor.id, apt.id)} disabled={apt.tenants.length >= 2} className="rounded-2xl bg-[#bbbbbb] border border-[#aaaaaa] text-black hover:bg-[#b0b0b0] disabled:opacity-60 disabled:cursor-not-allowed" title={apt.tenants.length >= 2 ? "Asunnossa on jo 2 sukunimeä" : undefined}><Plus className="h-4 w-4 mr-1"/>Lisää asukas</Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              </>
            )}

            
{activeTab === "uutiset" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="news-enabled"
                    checked={!!hallway.newsEnabled}
                    onCheckedChange={(v) => setHallway((h) => ({ ...h, newsEnabled: v }))}
                  />
                  <Label htmlFor="news-enabled">Käytössä</Label>
                </div>

                <div>
                  <Label htmlFor="news-url">RSS-syötteen osoite</Label>
                  <Input
                    id="news-url"
                    value={hallway.newsRssUrl || ""}
                    onChange={(e) => setHallway((h) => ({ ...h, newsRssUrl: e.target.value }))}
                    placeholder="https://example.com/rss"
                    disabled={!hallway.newsEnabled}
                  />
                  <div className="text-xs opacity-70 mt-1">Syöte haetaan palvelimen kautta ja päivittyy automaattisesti.</div>
                </div>

                <div className="w-full">
                  <Label htmlFor="news-limit">Näytettävien uutisten määrä</Label>
                  <Input
                    id="news-limit"
                    type="number"
                    min={1}
                    value={hallway.newsLimit ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const num = v ? Number(v) : NaN;
                      setHallway((h) => ({
                        ...h,
                        newsLimit: Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined,
                      }));
                    }}
                    placeholder="Näytä kaikki"
                    className="w-full"
                    disabled={!hallway.newsEnabled}
                  />
                </div>
                <div className="w-full">
                  <Label htmlFor="news-title">Uutisotsikko</Label>
                  <Input
                    id="news-title"
                    value={hallway.newsTitle ?? "Uutiset"}
                    onChange={(e) => setHallway((h) => ({ ...h, newsTitle: e.target.value }))}
                    placeholder="Uutiset"
                    className="w-full"
                    disabled={!hallway.newsEnabled}
                  />
                </div>

                <div className="w-full">
                  <Label htmlFor="news-title-px">Uutisotsikon koko (px)</Label>
                  <Input
                    id="news-title-px"
                    type="number"
                    min={8}
                    value={hallway.newsTitlePx ?? 36}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const num = v ? Number(v) : NaN;
                      setHallway((h) => ({
                        ...h,
                        newsTitlePx: Number.isFinite(num) && num > 0 ? num : undefined,
                      }));
                    }}
                    className="w-full"
                    disabled={!hallway.newsEnabled}
                  />
                </div>
              </div>
            )}

            {activeTab === "mainokset" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="logos-enabled"
                    checked={!!hallway.logosEnabled}
                    onCheckedChange={(v) => setHallway((h) => ({ ...h, logosEnabled: v }))}
                  />
                  <Label htmlFor="logos-enabled">Käytössä</Label>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full">
                    <Label>{"Logoja n\u00e4kyviss\u00e4, (1-20)"}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={hallway.logosLimit ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const num = v ? Number(v) : NaN;
                        setHallway((h) => ({ ...h, logosLimit: Number.isFinite(num) ? Math.min(20, Math.max(1, num)) : undefined }));
                      }}
                      placeholder="N&auml;yt&auml; kaikki"
                      className="w-full"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full">
                    <Label>{"Logojen et\u00e4isyys (px), (0-320)"}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={hallway.logosGap ?? 32}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const num = v ? Number(v) : NaN;
                        setHallway((h) => ({ ...h, logosGap: Number.isFinite(num) ? Math.max(0, num) : undefined }));
                      }}
                      className="w-full"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="logos-animate"
                    type="checkbox"
                    checked={!!hallway.logosAnimate}
                    onChange={(e) => setHallway((h) => ({ ...h, logosAnimate: e.target.checked }))}
                  />
                  <Label htmlFor="logos-animate">Animoi logot</Label>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full">
                    <Label>Animaation kesto (s), (5-120)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={logosSpeedInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLogosSpeedTouched(true);
                        setLogosSpeedInput(v);
                        const trimmed = v.trim();
                        const num = trimmed ? Number(trimmed) : NaN;
                        const valid = Number.isFinite(num) && num >= 5 && num <= 120;
                        setHallway((h) => ({ ...h, logosSpeed: valid ? num : 5 }));
                      }}
                      className={cn(
                        "w-full",
                        hallway.logosEnabled && !logosSpeedValid && "border-red-500 focus-visible:ring-red-500 focus-visible:ring-1"
                      )}
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full">
                    <Label>{"Taustav\u00e4ri (hex)"}</Label>
                    <Input
                      value={hallway.logosBgColor || ""}
                      onChange={(e) => setHallway((h) => ({ ...h, logosBgColor: e.target.value.trim() }))}
                      placeholder="#111111"
                      className="w-full"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full">
                    <Label>Lataa logot (max 20)</Label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleLogoFiles(e.target.files)}
                      className="mt-1 block w-full text-sm"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                {logoUploadItems.length > 0 && (
                  <div className="text-sm space-y-2">
                    {logoUploadItems.map((item) => {
                      const statusLabel =
                        item.status === "pending"
                          ? "Odottaa"
                          : item.status === "uploading"
                            ? "Ladataan..."
                            : item.status === "done"
                              ? "Valmis"
                              : "Virhe";
                      const statusClass =
                        item.status === "error"
                          ? "text-red-600"
                          : item.status === "done"
                            ? "text-green-700"
                            : "text-zinc-600";
                      return (
                        <div key={item.id} className="space-y-0.5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="truncate">{item.name}</span>
                            <span className={statusClass}>{statusLabel}</span>
                          </div>
                          {item.status === "error" && item.message ? (
                            <div className="text-xs text-red-600">{item.message}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {logoUploading && (
                  <div className="flex items-center gap-2">
                    <div className="text-sm opacity-70">{"Logoja ladataan..."}</div>
                    <Button type="button" variant="secondary" onClick={cancelLogoUpload} className="rounded-2xl">Peruuta lataus</Button>
                  </div>
                )}
                {logoError && <div className="text-sm text-red-600">{logoError}</div>}
                <div className="text-xs opacity-70">{"Logoja yhteens\u00e4: "}{(hallway.logos || []).length}/20</div>

                {(hallway.logos || []).length === 0 ? (
                  <div className="text-sm opacity-70">{"Ei logoja viel\u00e4."}</div>
                ) : (
                  <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3", !hallway.logosEnabled && "opacity-50")}>
                    {(hallway.logos || []).map((logo) => (
                      <div
                        key={logo.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", logo.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId = e.dataTransfer.getData("text/plain");
                          if (fromId) moveLogo(fromId, logo.id);
                        }}
                        onClick={() => setActiveLogoId(logo.id)}
                        className={cn(
                          "relative rounded-lg border bg-white p-2 cursor-move",
                          activeLogoId === logo.id ? "ring-2 ring-black" : "border-zinc-200"
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLogo(logo.id);
                          }}
                          className="absolute top-1 right-1 text-xs text-zinc-600 hover:text-black"
                          aria-label="Poista logo"
                          disabled={!hallway.logosEnabled}
                        >
                          Poista
                        </button>
                        <div className="flex items-center justify-center h-24">
                          <img src={logo.url} alt={logo.name || "Logo"} className="max-h-full max-w-full object-contain" />
                        </div>
                        {activeLogoId === logo.id ? (
                          <Input
                            value={logo.name || ""}
                            onChange={(e) =>
                              setHallway((h) => ({
                                ...h,
                                logos: (h.logos || []).map((l) => (l.id === logo.id ? { ...l, name: e.target.value } : l)),
                              }))
                            }
                            placeholder="Logon nimi"
                            className="mt-2"
                            disabled={!hallway.logosEnabled}
                          />
                        ) : (
                          <div className="mt-2 text-xs text-center truncate">{logo.name || "Nimeä logo"}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "saa" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="weather-enabled"
                    checked={!!hallway.weatherClockEnabled}
                    onCheckedChange={(v) => setHallway((h) => ({ ...h, weatherClockEnabled: v }))}
                  />
                  <Label htmlFor="weather-enabled">Käytössä</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                  <div className="relative w-full">
                    <Label>Kaupunki</Label>
                    <Input
                      value={cityQuery}
                      onChange={(e) => {
                        const next = e.target.value;
                        setHallway((h) => ({ ...h, weatherCity: next, weatherLat: undefined, weatherLon: undefined }));
                        setIsCityOpen(next.trim().length >= 2);
                      }}
                      onFocus={() => setIsCityOpen(cityQuery.trim().length >= 2)}
                      onBlur={() => setIsCityOpen(false)}
                      placeholder="esim. Helsinki"
                      className="w-full"
                      aria-autocomplete="list"
                      aria-expanded={showCitySuggest ? true : false}
                      aria-controls="city-suggest"
                      disabled={!hallway.weatherClockEnabled}
                    />
                    {showCitySuggest && (
                      <div id="city-suggest" role="listbox" className="absolute z-20 mt-1 w-full rounded-md border bg-white text-black shadow">
                        {cityMatches.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="option"
                            onMouseDown={(e) => {
                              // Ensure selection before input blur/unmounts the list.
                              e.preventDefault();
                              setHallway((h) => ({ ...h, weatherCity: name, weatherLat: undefined, weatherLon: undefined }));
                              setIsCityOpen(false);
                            }}
                            className="block w-full text-left px-3 py-1.5 hover:bg-zinc-100"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-zinc-600">
                      {((hallway.weatherCity || "").trim())
                        ? <>Näytetään: <span className="font-medium">{hallway.weatherCity}</span></>
                        : <>Ei asetettu - käytetään automaattista paikannusta tai oletuksena Helsingin säätä.</>
                      }
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="font-medium mb-2">Ajan asetus</div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="clockmode" checked={(hallway.clockMode || "auto") === "auto"} onChange={() => setHallway(h => ({ ...h, clockMode: "auto" }))} disabled={!hallway.weatherClockEnabled} />
                      <span>Automaattinen</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="clockmode" checked={hallway.clockMode === "manual"} onChange={() => setHallway(h => ({ ...h, clockMode: "manual" }))} disabled={!hallway.weatherClockEnabled} />
                      <span>Manuaalinen</span>
                    </label>
                  </div>
                  {hallway.clockMode === "manual" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label>Päivämäärä</Label>
                        <Input type="date" value={hallway.clockDate || ""} onChange={(e) => setHallway((h) => ({ ...h, clockDate: e.target.value }))} disabled={!hallway.weatherClockEnabled} />
                      </div>
                      <div>
                        <Label>Kellonaika</Label>
                        <Input type="time" step={60} value={hallway.clockTime || ""} onChange={(e) => setHallway((h) => ({ ...h, clockTime: e.target.value }))} disabled={!hallway.weatherClockEnabled} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "info" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch id="info-enabled" checked={!!hallway.infoEnabled} onCheckedChange={(v) => setHallway((h) => ({ ...h, infoEnabled: v }))} />
                  <Label htmlFor="info-enabled">{"K\u00e4yt\u00f6ss\u00e4"}</Label>
                </div>
                <div>
                  <Label>{"Sis\u00e4lt\u00f6"}</Label>
                  <SlateEditor
                    value={hallway.infoHtml || ""}
                    onChange={(html: string) => setHallway((h) => ({ ...h, infoHtml: html }))}
                    alignRight={!!hallway.infoAlignRight}
                  />
                  <div className="text-sm opacity-60 mt-1">{"Tallennetaan osaksi TV-n\u00e4kym\u00e4\u00e4. Skriptit ja tapahtumat poistetaan automaattisesti."}</div>
                </div>
                <div className={cn("flex items-center gap-2", !hallway.infoEnabled && "opacity-50 pointer-events-none")}>
                  <Switch
                    id="info-align-right"
                    checked={!!hallway.infoAlignRight}
                    onCheckedChange={(v) => setHallway((h) => ({ ...h, infoAlignRight: v }))}
                  />
                  <Label htmlFor="info-align-right">{"Tasaa oikealle"}</Label>
                </div>
                <div className={cn("flex items-center gap-2", !hallway.infoEnabled && "opacity-50 pointer-events-none")}>
                  <Switch
                    id="info-pin-bottom"
                    checked={!!hallway.infoPinBottom}
                    onCheckedChange={(v) => setHallway((h) => ({ ...h, infoPinBottom: v }))}
                  />
                  <Label htmlFor="info-pin-bottom">{"Kiinnit\u00e4 alas"}</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TV-esikatselu (kolumni 2) */}
      {showPreview && (
        <Card data-preview-card className={cn("shadow-xl min-w-0", lockClass)} aria-hidden={showStartupPrompt ? "true" : undefined}>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl flex items-center gap-2">
              <MonitorPlay className="h-5 w-5"/>
              TV-esikatselu
              <span className="ml-2 text-xs font-medium text-zinc-700 bg-zinc-100 rounded px-2 py-0.5">
                {hallway.orientation === "portrait" ? "Pysty" : "Vaaka"}
              </span>
            </CardTitle>
            <button aria-label="Avaa uuteen välilehteen" title="Avaa uuteen välilehteen" onClick={() => openStaticPreviewTab(hallway)} className="ml-auto inline-flex items-center justify-center rounded-md p-2 hover:bg-zinc-100 text-zinc-700">
              <ExternalLink className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent>
            <HallwayTvPreview hallway={hallway} />
          </CardContent>
        </Card>
      )}

      {/* Tallennuksen vahvistusdialogi */}
      <Dialog open={showSavedDialog} onOpenChange={setShowSavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tallennus onnistui</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p>Näkymä tallennettu. TV hakee sen omalla sarjanumerollaan.</p>
            <div className="text-sm">Absoluuttinen URL:</div>
            <div className="flex gap-2">
              <Input readOnly value={savedUrl || ""} />
              <Button type="button" onClick={() => savedUrl && navigator.clipboard.writeText(savedUrl)}>Kopioi</Button>
              <Button type="button" onClick={() => savedHtml && downloadStaticHtmlFile(savedFilename || "ruutu.html", savedHtml)} disabled={!savedHtml}>Lataa</Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setShowSavedDialog(false)}>Sulje</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showSerialDialog} onOpenChange={setShowSerialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{"Anna sarjanumero"}</DialogTitle>
          </DialogHeader>
          <p>{"Jotta voit tallentaa n\u00e4kym\u00e4n, sinun tulee antaa n\u00e4ytt\u00f6laitteen sarjanumero. N\u00e4kym\u00e4n tallennuksessa k\u00e4ytet\u00e4\u00e4n sarjanumeroa, jonka perusteella n\u00e4ytt\u00f6 pystyy esitt\u00e4m\u00e4\u00e4n siihen tarkoitettua sis\u00e4lt\u00f6\u00e4."}</p>
          <div className="space-y-3">
            <Label htmlFor="serial-dialog-input">Sarjanumero</Label>
            <Input
              id="serial-dialog-input"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value.toUpperCase())}
              placeholder="LAITTEEN SARJANUMERO"
              className="uppercase"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setShowSerialDialog(false)}>Peruuta</Button>
            <Button
              type="button"
              onClick={() => {
                const trimmed = serialInput.trim().toUpperCase();
                if (!trimmed) return;
                setHallway((h) => ({ ...h, serial: trimmed }));
                setShowSerialDialog(false);
                saveWithSerial(trimmed);
              }}
              disabled={!serialInput.trim()}
            >
              Tallenna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- TV-esikatselun komponentti ----------
function HallwayTvPreview({ hallway }: { hallway: Hallway }) {
  const orientation: Orientation = hallway.orientation || "landscape";
  const floorsAsc = useMemo(() => [...hallway.floors].sort((a, b) => a.level - b.level), [hallway.floors]);
  const screenColumns = Math.min(3, Math.max(1, Math.floor(hallway.screenColumns ?? 1)));
  const columns = useMemo(() => {
    const total = floorsAsc.length;
    const count = Math.min(screenColumns, Math.max(1, total));
    if (count === 1) return [floorsAsc.slice().reverse()];
    const base = Math.floor(total / count);
    const extra = total % count;
    const out: Floor[][] = [];
    let idx = 0;
    for (let c = 0; c < count; c++) {
      const take = base + (c < extra ? 1 : 0);
      out.push(floorsAsc.slice(idx, idx + take).reverse());
      idx += take;
    }
    return out;
  }, [floorsAsc, screenColumns]);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const scaleRootRef = useRef<HTMLDivElement>(null);
  const [gridScale, setGridScale] = useState(1);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastLandscapeRef = useRef<{ w: number; h: number } | null>(null);
  const [scaleHint, setScaleHint] = useState(1);
  const logosRef = useRef<HTMLDivElement>(null);
  const logosTrackRef = useRef<HTMLDivElement>(null);
  const [logosRepeat, setLogosRepeat] = useState(1);
  const [logosReady, setLogosReady] = useState(false);
  const logosMeasureRef = useRef<{ width: number; span: number; repeat: number }>({ width: 0, span: 0, repeat: 1 });
  const logosAnimRef = useRef<Animation | null>(null);
  const logosAnimMetaRef = useRef<{ span: number; speed: number } | null>(null);
  const [newsItems, setNewsItems] = useState<{ title: string; category: string }[]>([]);

  const userScale = typeof hallway.scale === "number" && isFinite(hallway.scale) ? hallway.scale : 1;
  const mainScale = typeof hallway.mainScale === "number" && isFinite(hallway.mainScale) ? hallway.mainScale : 1;
  const headerScale = typeof hallway.headerScale === "number" && isFinite(hallway.headerScale) ? hallway.headerScale : 1;
  const weatherScale = typeof hallway.weatherScale === "number" && isFinite(hallway.weatherScale) ? hallway.weatherScale : 1;
  const newsScale = typeof hallway.newsScale === "number" && isFinite(hallway.newsScale) ? hallway.newsScale : 1;
  const infoScale = typeof hallway.infoScale === "number" && isFinite(hallway.infoScale) ? hallway.infoScale : 1;
  const logosScale = typeof hallway.logosScale === "number" && isFinite(hallway.logosScale) ? hallway.logosScale : 1;
  const baseW = orientation === "portrait" ? 1080 : 1920;
  const baseH = orientation === "portrait" ? 1920 : 1080;
  const [contentSize, setContentSize] = useState<{ w: number; h: number }>({ w: baseW, h: baseH });

  // Laske esikatselulaatikon koko niin, että pysty = vaaka käänteisenä
  useEffect(() => {
    const updateBox = () => {
      const el = containerRef.current;
      const parent = el?.parentElement as HTMLElement | null;
      if (!el || !parent) return;

      const cs = getComputedStyle(el);
      const isBorderBox = (cs.boxSizing || "border-box").toLowerCase() === "border-box";
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);

      const pw = parent.clientWidth;
      const maxW = isBorderBox ? pw : Math.max(0, pw - padX);
      const safeW = Math.max(0, maxW - 1);
      const wLandscape = safeW;
      const hLandscape = (wLandscape * 9) / 16;
      const w = orientation === "landscape" ? wLandscape : hLandscape;
      const h = orientation === "landscape" ? hLandscape : wLandscape;
      if (orientation === "landscape") {
        lastLandscapeRef.current = { w: wLandscape, h: hLandscape };
      } else if (lastLandscapeRef.current) {
        const prev = lastLandscapeRef.current;
        const near = (a: number, b: number) => Math.abs(a - b) <= 2;
        console.assert(near(w, prev.h) && near(h, prev.w), "Pysty-koon pitäisi olla vaakakoon käänteinen", { w, h, prev });
      }
      setBoxSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    updateBox();
    const ro = new ResizeObserver(updateBox);
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    window.addEventListener("resize", updateBox);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateBox);
    };
  }, [orientation]);

  // Skaala + sarakemäärä
  useEffect(() => {
    const fitAndCols = () => {
      const C = containerRef.current;
      const H = headerRef.current;
      const G = scaleRootRef.current;
      const F = footerRef.current;

      const n = floorsAsc.length;
      const hint = orientation === "landscape" ? (n >= 10 ? 0.9 : n >= 7 ? 0.95 : 1) : 1;
      setScaleHint(hint);

      if (!C || !G) return;
      const ch = C.clientHeight;
      const cw = C.clientWidth;
      const usedTop = H ? H.getBoundingClientRect().height : 0;
      const usedBottom = F ? F.getBoundingClientRect().height : 0;
      const availH = Math.max(0, ch - usedTop - usedBottom);
      const contentW = G.scrollWidth || baseW;
      const contentH = G.scrollHeight || baseH;
      const innerW = Math.max(0, cw - 20);
      const innerH = Math.max(0, availH - 20);
      const s = Math.min(1, innerW / contentW);
      setContentSize((prev) => (prev.w !== contentW || prev.h !== contentH ? { w: contentW, h: contentH } : prev));
      setGridScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    fitAndCols();
    const ro = new ResizeObserver(() => fitAndCols());
    if (containerRef.current) ro.observe(containerRef.current);
    if (gridRef.current) ro.observe(gridRef.current);
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener("resize", fitAndCols);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fitAndCols);
    };
  }, [orientation, hallway, floorsAsc.length]);

  const logosAll = useMemo(
    () => (hallway.logos || []).filter((l): l is { id: string; url: string; name?: string } => !!(l && l.url)),
    [hallway.logos]
  );
  const logosLimit = typeof hallway.logosLimit === "number" && hallway.logosLimit > 0 ? Math.floor(hallway.logosLimit) : null;
  const logos = logosLimit ? logosAll.slice(0, logosLimit) : logosAll;
  const shouldAnimate = !!hallway.logosAnimate && !!hallway.logosEnabled;
  const newsEnabled = !!hallway.newsEnabled && (hallway.newsRssUrl || "").trim().length > 0;
  const infoPinBottom = !!hallway.infoPinBottom;
  const infoAlignRight = !!hallway.infoAlignRight;
  const newsLimit = typeof hallway.newsLimit === "number" && hallway.newsLimit > 0 ? Math.floor(hallway.newsLimit) : null;
  const previewScale = gridScale * scaleHint;
  const offsetX = 10;
  const offsetY = 10;
  const logosHeight = 130 * logosScale;
  const tiledLogos = useMemo(() => {
    if (!shouldAnimate) return logos;
    const repeat = Math.max(1, logosRepeat);
    const out: typeof logos = [];
    for (let i = 0; i < repeat; i++) out.push(...logos);
    return out;
  }, [logos, logosRepeat, shouldAnimate]);
  const renderLogos = shouldAnimate ? [...tiledLogos, ...tiledLogos] : tiledLogos;

  useEffect(() => {
    if (!shouldAnimate) {
      setLogosRepeat(1);
      setLogosReady(false);
      logosMeasureRef.current = { width: 0, span: 0, repeat: 1 };
      if (logosAnimRef.current) {
        logosAnimRef.current.cancel();
        logosAnimRef.current = null;
      }
      logosAnimMetaRef.current = null;
      return;
    }
    const track = logosTrackRef.current;
    const wrap = logosRef.current;
    if (!track || !wrap || logos.length === 0) return;
    let raf = 0;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const baseCount = logos.length;
        const children = track.children;
        const lastBase = children[baseCount - 1] as HTMLElement | undefined;
        if (!lastBase) return;
        const baseWidth = lastBase.offsetLeft + lastBase.offsetWidth;
        if (!Number.isFinite(baseWidth) || baseWidth <= 0) return;
        const wrapWidth = wrap.clientWidth;
        const nextRepeat = Math.max(1, Math.ceil(wrapWidth / baseWidth));
        const setCount = baseCount * nextRepeat;
        const first = children[0] as HTMLElement | undefined;
        const second = children[setCount] as HTMLElement | undefined;
        const span = first && second ? second.offsetLeft - first.offsetLeft : baseWidth * nextRepeat;
        const prev = logosMeasureRef.current;
        if (prev.width !== wrapWidth || prev.span !== span || prev.repeat !== nextRepeat) {
          logosMeasureRef.current = { width: wrapWidth, span, repeat: nextRepeat };
          if (nextRepeat !== logosRepeat) {
            setLogosRepeat(nextRepeat);
            return;
          }
        }
        if (logosReady) {
          const speed = typeof hallway.logosSpeed === "number" && isFinite(hallway.logosSpeed) ? hallway.logosSpeed : 20;
          const meta = logosAnimMetaRef.current;
          if (!meta || meta.span !== span || meta.speed !== speed) {
            if (logosAnimRef.current) logosAnimRef.current.cancel();
            logosAnimRef.current = track.animate(
              [
                { transform: "translate3d(0, 0, 0)" },
                { transform: `translate3d(${-span}px, 0, 0)` },
              ],
              { duration: speed * 1000, iterations: Infinity, easing: "linear" }
            );
            logosAnimMetaRef.current = { span, speed };
          }
        }
        if (!logosReady) {
          const baseImages = Array.from(children)
            .slice(0, baseCount)
            .map((el) => (el as HTMLElement).querySelector("img"))
            .filter((img): img is HTMLImageElement => !!img);
          const allLoaded = baseImages.length > 0 && baseImages.every((img) => img.complete);
          if (allLoaded) {
            setLogosReady(true);
          }
        }
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    const images = Array.from(track.querySelectorAll("img"));
    const onImg = () => measure();
    images.forEach((img) => img.addEventListener("load", onImg, { once: true }));
    return () => {
      ro.disconnect();
      images.forEach((img) => img.removeEventListener("load", onImg));
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shouldAnimate, logos.length, logosRepeat, logosReady, hallway.logosSpeed]);



  useEffect(() => {
    if (!newsEnabled) {
      setNewsItems([]);
      return;
    }
    let cancelled = false;
    const url = (hallway.newsRssUrl || "").trim();
    const load = async () => {
      try {
        const res = await fetch(`/api/rss?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("news-http");
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(doc.querySelectorAll("item"));
        const entries = items.length ? items : Array.from(doc.querySelectorAll("entry"));
        const parsed = entries
          .map((el) => {
            const title = el.querySelector("title")?.textContent?.trim() || "";
            const category =
              el.querySelector("category")?.textContent?.trim() ||
              el.querySelector("dc\\:subject")?.textContent?.trim() ||
              el.querySelector("category")?.getAttribute("term")?.trim() ||
              "";
            return title ? { title, category } : null;
          })
          .filter((v): v is { title: string; category: string } => !!v);
        const sliced = newsLimit ? parsed.slice(0, newsLimit) : parsed;
        if (!cancelled) setNewsItems(sliced);
      } catch {
        if (!cancelled) setNewsItems([]);
      }
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [newsEnabled, hallway.newsRssUrl, newsLimit]);

  return (
    <div
      ref={containerRef}
      style={{
        width: boxSize.w || undefined,
        height: boxSize.h ? Math.max(0, boxSize.h - 10) : undefined,
        // Center horizontally so left/right spacing inside padded parent is equal
        margin: "0 auto",
        // Never exceed parent content box
        maxWidth: "100%",
        maxHeight: "100%",
      }}
      className="bg-black text-white rounded-2xl overflow-hidden relative"
    >
      <div ref={gridRef} style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
        <div
          ref={scaleRootRef}
          className="tv-text-scale"
          style={{
            width: baseW,
            transform: `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px) scale(${previewScale.toFixed(3)})`,
            transformOrigin: "top left",
            "--preview-text-scale": userScale,
          } as React.CSSProperties}
        >
          <div style={{ height: baseH, display: "flex", flexDirection: "column" }}>
          <div ref={headerRef} className="flex items-start justify-between mb-12">
            <div style={{ "--preview-text-scale": userScale * headerScale } as React.CSSProperties}>
              {hallway.building?.trim() ? (
                <div className="text-2xl font-semibold tracking-wide">{hallway.building}</div>
              ) : null}
              <div className="text-sm opacity-70 -mt-1">{hallway.name}</div>
            </div>
            {hallway.weatherClockEnabled && (
              <div style={{ "--preview-text-scale": userScale * weatherScale } as React.CSSProperties}>
                <WeatherClock
                  tvStyle
                  city={hallway.weatherCity}
                  lat={hallway.weatherLat}
                  lon={hallway.weatherLon}
                  clockMode={hallway.clockMode}
                  manualDate={hallway.clockDate}
                  manualTime={hallway.clockTime}
                />
              </div>
            )}
          </div>

          <div className="flex-1 flex gap-8 items-stretch px-5 min-h-0">
            <div className={cn(((hallway.infoEnabled && (hallway.infoHtml || "").trim()) || newsEnabled) ? "flex-1" : "w-full", "min-w-0 p-2 h-full flex overflow-hidden min-h-0") }>
              <div
                className={cn("vcenter w-full", columns.length > 1 ? "flex gap-8" : "")}
                style={{ "--preview-text-scale": userScale * mainScale } as React.CSSProperties}
              >
                {columns.map((column, ci) => (
                  <div key={`col-${ci}`} className="min-w-0 flex-1">
                    {column.map((floor) => (
                      <div key={floor.id} className="mb-6 pb-[15px]">
                        <div className="text-xl font-semibold uppercase mb-3">{floorTitle(floor)}</div>
                        <div className="flex flex-col gap-3">
                          {floor.apartments.map((apt) => (
                            <div
                              key={apt.id}
                              className="grid gap-x-6"
                              style={{ gridTemplateColumns: "calc(30px * var(--preview-text-scale, 1)) 1fr" }}
                            >
                              <div className="text-sm font-semibold tabular-nums whitespace-nowrap overflow-x-auto">{apt.number || "-"}</div>
                              <div className="text-sm font-semibold break-words whitespace-normal">
                                {apt.tenants.filter((t) => t.surname.trim())[0]?.surname?.toUpperCase() || (
                                  <span className="opacity-40">(tyhjä)</span>
                                )}
                              </div>
                              {apt.tenants
                                .filter((t) => t.surname.trim())
                                .slice(1)
                                .map((t, idx) => (
                                  <React.Fragment key={idx}>
                                    <div></div>
                                    <div className="text-sm font-semibold break-words whitespace-normal">{t.surname.toUpperCase()}</div>
                                  </React.Fragment>
                                ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          {((hallway.infoEnabled && (hallway.infoHtml || "").trim()) || newsEnabled) && (
            <div className="flex-1 min-w-0 p-2 flex min-h-0">
              <div
                className="flex flex-col min-h-0 h-full"
                style={{ paddingLeft: "10%", paddingRight: "10%", paddingBottom: infoPinBottom ? 10 : undefined }}
              >
                {newsEnabled && (
                  <div className="news-block" style={{ "--preview-text-scale": userScale * newsScale } as React.CSSProperties}>
                    <div
                      className="news-title"
                      style={{ fontSize: `calc(${hallway.newsTitlePx ?? 36}px * var(--preview-text-scale, 1))` }}
                    >
                      {hallway.newsTitle?.trim() || "Uutiset"}
                    </div>
                    <div className="news-list">
                    {newsItems.length === 0 ? (
                      <div className="news-item opacity-60">-</div>
                    ) : (
                      newsItems.map((item, i) => (
                        <div key={i} className="news-item">
                          <div className="news-num">{i + 1}.</div>
                          <div className="news-text">
                            {item.category ? <div className="news-cat">{item.category}</div> : null}
                            <div className="news-title">{item.title}</div>
                          </div>
                        </div>
                      ))
                    )}
                    </div>
                  </div>
                )}
                {infoPinBottom && <div className="flex-1" />}
                {(hallway.infoEnabled && (hallway.infoHtml || "").trim()) && (
                  <div
                    className={cn(
                      "info-content",
                      !infoPinBottom && newsEnabled && "mt-12",
                      infoAlignRight && "text-right"
                    )}
                    style={{ "--preview-text-scale": userScale * infoScale } as React.CSSProperties}
                    dangerouslySetInnerHTML={{ __html: hallway.infoHtml || "" }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {!!hallway.logosEnabled && logos.length > 0 && (
          <div
            ref={logosRef}
            className={cn(
              "logo-strip w-full overflow-hidden flex",
              shouldAnimate ? "logos-animate" : "justify-center"
            )}
            style={{ height: logosHeight, background: (hallway.logosBgColor || "").trim() || "transparent", marginBottom: 10 }}
          >
            <div
              ref={logosTrackRef}
              className="logos-track h-full"
              style={{
                gap: typeof hallway.logosGap === "number" ? hallway.logosGap : 32,
                animation: shouldAnimate ? "none" : undefined,
              } as React.CSSProperties}
            >
              {renderLogos.map((logo, idx) => (
                <div key={`${logo.id}-${idx}`} className="logo-item h-full">
                  <img src={logo.url} alt={logo.name || "Logo"} className="logo-img" />
                  <div className="logo-name">{logo.name || ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
      </div>

    </div>
  );
}

function downloadStaticHtmlFile(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

