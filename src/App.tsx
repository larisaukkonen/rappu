import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, MonitorPlay, Users, Building2, Hash, ExternalLink, Newspaper } from "lucide-react";
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
 * Asukasnäyttö - hallinta + TV-esikatselu
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
  // Logos
  logos?: { id: string; url: string; name?: string }[];
  logosAnimate?: boolean;
  logosLimit?: number;
  logosEnabled?: boolean;
  logosBgColor?: string;
  // Info panel
  infoEnabled?: boolean;
  infoHtml?: string;
  floors: Floor[]; // lajiteltu level:n mukaan
};

// ---------- Apuja ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const apartmentPlaceholder = (level: number, idx: number) => `${level * 100 + idx + 1}`;
const emptyHallway = (partial?: Partial<Hallway>): Hallway => ({
  id: partial?.id || "demo-hallway",
  name: partial?.name || "Käytävä A",
  building: partial?.building || "",
  isActive: partial?.isActive ?? true,
  orientation: partial?.orientation || "landscape",
  serial: partial?.serial || "",
  scale: partial?.scale ?? 1,
  weatherCity: partial?.weatherCity || "",
  weatherLat: partial?.weatherLat,
  weatherLon: partial?.weatherLon,
  clockMode: partial?.clockMode || "auto",
  clockDate: partial?.clockDate,
  clockTime: partial?.clockTime,
  weatherClockEnabled: partial?.weatherClockEnabled ?? false,
  newsEnabled: partial?.newsEnabled ?? false,
  newsRssUrl: partial?.newsRssUrl || "",
  newsLimit: partial?.newsLimit,
  logos: partial?.logos || [],
  logosAnimate: partial?.logosAnimate ?? false,
  logosLimit: partial?.logosLimit,
  logosEnabled: partial?.logosEnabled ?? false,
  logosBgColor: partial?.logosBgColor || "",
  infoEnabled: partial?.infoEnabled ?? false,
  infoHtml: partial?.infoHtml || "",
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
  const floorsAsc = [...h.floors].sort((a, b) => b.level - a.level);
  const floorsHtml = floorsAsc
    .map((floor) => {
      const apartmentsHtml = floor.apartments
        .map((apt) => {
          const tenants = (apt.tenants || [])
            .filter((t) => t && t.surname && t.surname.trim().length > 0)
            .map((t) => escapeHtml(t.surname.toUpperCase()));
          const first = tenants[0] || '<span class="empty">(tyhjä)</span>';
          const rest = tenants.slice(1).map((n) => `<div class=\"apt-name\">${n}</div>`).join("");
          const numberHtml = escapeHtml(apt.number || "-");
          return (
            `<div class=\"apt-row\">` +
            `<div class=\"apt-num\">${numberHtml}</div>` +
            `<div class=\"apt-names\">` +
            `<div class=\"apt-name\">${first}</div>` +
            `${rest}` +
            `</div>` +
            `</div>`
          );
        })
        .join("");
      return (
        `<div class=\"floor\">` +
        `<div class=\"floor-title\">${escapeHtml(String(floor.level))}. KERROS</div>` +
        `<div class=\"apt-list\">${apartmentsHtml}</div>` +
        `</div>`
      );
    })
    .join("");
  const cols = buildColumnsShared(floorsAsc, orientation);

  const columnsHtml = cols
    .map((col) => {
      const floorsHtml = col
        .map((floor) => {
          const apartmentsHtml = floor.apartments
            .map((apt) => {
              const tenants = (apt.tenants || [])
                .filter((t) => t && t.surname && t.surname.trim().length > 0)
                .map((t) => escapeHtml(t.surname.toUpperCase()));
              const first = tenants[0] || '<span class="empty">(tyhjä)</span>';
              const rest = tenants.slice(1).map((n) => `<div class="apt-name">${n}</div>`).join("");
              const numberHtml = escapeHtml(apt.number || "-");
              return (
                `<div class="apt-row">` +
                `<div class="apt-num">${numberHtml}</div>` +
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
            `<div class="floor-title">${escapeHtml(String(floor.level))}. KERROS</div>` +
            `<div class="apt-list">${apartmentsHtml}</div>` +
            `</div>`
          );
        })
        .join("");
      return `<div class="col"><div class="vcenter inner-pad">${floorsHtml}</div></div>`;
    })
    .join("");

  const baseW = orientation === "portrait" ? 1080 : 1920;
  const baseH = orientation === "portrait" ? 1920 : 1080;
  const logosAll = (h.logos || []).filter((l) => l && l.url);
  const logosLimit = typeof h.logosLimit === "number" && h.logosLimit > 0 ? Math.floor(h.logosLimit) : null;
  const logos = logosLimit ? logosAll.slice(0, logosLimit) : logosAll;
  const logosHeight = 130;
  const logosBg = (h.logosBgColor || "").trim();
  const logosBgStyle = logosBg ? ` style="background:${escapeHtml(logosBg)}"` : "";
  const logosHtml = h.logosEnabled && logos.length
    ? `<div id="logos" data-animate="${h.logosAnimate ? "true" : "false"}"${logosBgStyle}>
         <div class="logos-track" id="logos-track">
           ${logos
             .map(
               (l) =>
                 `<div class="logo-item">` +
                 `<img class="logo-img" src="${escapeHtml(l.url)}" alt="${escapeHtml(l.name || "Logo")}"/>` +
                 `<div class="logo-name">${escapeHtml(l.name || "")}</div>` +
                 `</div>`
             )
             .join("")}
         </div>
       </div>`
    : "";
  const css = `
*{box-sizing:border-box}html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}a{color:inherit}
#container{position:relative;height:100vh;width:100vw;overflow:hidden}
#header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 20px 0 20px}
#brand .title{font-size:28px;font-weight:600;letter-spacing:.02em}
#brand .subtitle{opacity:.7;margin-top:-4px;font-size:14px}
#clock{display:flex;align-items:center;gap:16px}
#clock .time{font-size:28px;font-weight:600}
#clock .date{font-size:12px;opacity:.7}
#clock .temps{font-size:14px;line-height:1.1}
#clock .icon{width:32px;height:32px}
#content{position:relative;padding:20px;transform-origin:top left;display:flex;flex-direction:column;height:${baseH}px}
#main{flex:1;display:flex;align-items:stretch}
.cols{display:flex;gap:32px;align-items:stretch}
.col{flex:1 1 0;min-width:0;display:flex;flex-direction:column}
.col > .vcenter{margin:auto 0}
.inner-pad{padding-left:10%;padding-right:10%}
.cols-1 .col{flex-basis:100%}
.cols-2 .col{flex-basis:50%}
.floor{margin-bottom:24px}
.floor-title{font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px;font-size:22px}
.apt-row{display:flex;gap:24px;margin:6px 0}
.apt-num{width:30px;font-weight:700;font-variant-numeric:tabular-nums}
.apt-names{flex:1}
.apt-name{font-weight:700;font-size:14px;line-height:1.1}
.empty{opacity:.4}
#footer{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:10px;opacity:.7;padding:8px}
.info-content p:empty::before{content:'\\00a0';display:inline-block}
#news{margin-top:0}
#news .news-title{font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;font-size:18px}
#news .news-list{display:flex;flex-direction:column;gap:10px}
#news .news-item{display:flex;gap:8px;font-size:14px;line-height:1.2}
#news .news-num{font-weight:700}
#news .news-text{display:flex;flex-direction:column;gap:2px}
#news .news-cat{font-weight:700;font-size:120%}
#news .news-title{font-weight:400;font-size:100%}
#news + .info-content{margin-top:24px}
#logos{height:${logosHeight}px;width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:transparent}
#logos.logos-animate{justify-content:flex-start}
#logos .logos-track{display:flex;align-items:center;gap:32px;height:100%;width:max-content}
#logos .logo-item{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:120px}
#logos .logo-img{height:60%;width:auto;max-width:100%;object-fit:contain}
#logos .logo-name{display:none}
#logos.logos-animate .logos-track{animation:logos-marquee 20s linear infinite}
@keyframes logos-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
`;

  const jsonEmbedded = JSON.stringify(h).replace(/</g, "\\u003c");
  const infoHtml = (h.infoEnabled && (h.infoHtml || "").trim()) ? sanitizeInfoHtml(h.infoHtml || "") : "";
  const newsEnabled = !!h.newsEnabled && (h.newsRssUrl || "").trim().length > 0;
  const newsLimit = typeof h.newsLimit === "number" && h.newsLimit > 0 ? Math.floor(h.newsLimit) : null;
  const html = `<!doctype html>
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
<title>${escapeHtml(h.building || "Rakennus")} - ${escapeHtml(h.name)}</title>
<style>${css}</style>
</head>
<body data-scale="${Number(h.scale ?? 1)}">
  <div id="container">
    <div id="header">
      <div id="brand">
        <div class="title">${escapeHtml(h.building || "Rakennus")}</div>
        <div class="subtitle">${escapeHtml(h.name)}</div>
      </div>
      ${h.weatherClockEnabled ? `
      <div id="clock" aria-label="Aika, p?iv?m??r? ja s??">
        <div class="td">
          <div id="time" class="time">--.--</div>
          <div id="date" class="date">--.--.----</div>
        </div>
        <div id="wxicon" class="icon" aria-hidden="true"></div>
        <div class="temps">
          <div id="tmax">? ?C</div>
          <div id="tmin" class="min">? ?C</div>
        </div>
      </div>` : ""}
    </div>
    <div id="content" style="width:${'${'}baseW${'}'}px">
      <div id="main">
        <div class="cols ${(infoHtml || newsEnabled) ? 'cols-2' : 'cols-1'}">
          <div class="col col-main">
            <div class="inner-pad">
              ${floorsHtml}
            </div>
          </div>
          ${(infoHtml || newsEnabled) ? `<div class="col col-info"><div class="inner-pad">
            ${newsEnabled ? `<div id="news"><div class="news-title">Uutiset</div><div class="news-list" id="news-list"></div></div>` : ``}
            ${infoHtml ? `<div class="info-content">${infoHtml}</div>` : ``}
          </div></div>` : ``}
        </div>
      </div>
      ${logosHtml}
    </div>
    <div id="footer"></div>
  </div>
  
<script>(function(){
  var USER_SCALE = ${Number(h.scale ?? 1)};
  var CLOCK_MODE = ${JSON.stringify(h.clockMode || "auto")};
  var CLOCK_DATE = ${JSON.stringify(h.clockDate || "")};
  var CLOCK_TIME = ${JSON.stringify(h.clockTime || "")};
  var CITY = ${JSON.stringify(h.weatherCity || "")};
  var LAT = ${typeof h.weatherLat === 'number' ? h.weatherLat : 'null'};
  var LON = ${typeof h.weatherLon === 'number' ? h.weatherLon : 'null'};
  var NEWS_ENABLED = ${newsEnabled ? 'true' : 'false'};
  var NEWS_URL = ${JSON.stringify((h.newsRssUrl || "").trim())};
  var NEWS_LIMIT = ${newsLimit ? newsLimit : 'null'};
  function fit(){
    var C=document.getElementById('container');
    var H=document.getElementById('header');
    var G=document.getElementById('content');
    var F=document.getElementById('footer');
    if(!C||!G){return;}
    var ch=C.clientHeight; var cw=C.clientWidth;
    var usedTop=H?H.getBoundingClientRect().height:0;
    var usedBottom=F?F.getBoundingClientRect().height:0;
    var availH=Math.max(0,ch-usedTop-usedBottom);
    var s=Math.min(1, availH/G.scrollHeight, cw/G.scrollWidth) * (USER_SCALE>0?USER_SCALE:1);
    G.style.transform='scale('+s+')';
    G.style.transformOrigin='top left';
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
    if(a) a.textContent = (isFinite(tmax)? Math.round(tmax): '–') + ' °C';
    if(b) b.textContent = (isFinite(tmin)? Math.round(tmin): '–') + ' °C';
  }
  function iconFor(code){
    // Minimal inline SVG icons to avoid external deps
    var sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>';
    var cloud = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 18Z" fill="currentColor"/></svg>';
    var rain = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 14Z" fill="currentColor"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3"/></svg>';
    var snow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" stroke-linecap="round"><path d="M12 4v16M7 7l10 10M17 7L7 17"/></svg>';
    var fog = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor"/><path d="M3 16h18M5 19h14"/></svg>';
    var thunder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" stroke-linejoin="round"><path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor"/><path d="M13 13l-3 6h3l-1 4 4-7h-3l1-3z"/></svg>';
    if(code==null) return cloud;
    if(code===0) return sun;
    if([1,2,3].includes(code)) return cloud;
    if([45,48].includes(code)) return fog;
    if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return rain;
    if([71,73,75,77,85,86].includes(code)) return snow;
    if([95,96,99].includes(code)) return thunder;
    return cloud;
  }
  async function resolveCoords(){
    if(typeof LAT==='number' && typeof LON==='number') return {lat:LAT, lon:LON};
    if(CITY){
      try{
        var u=new URL('https://geocoding-api.open-meteo.com/v1/search');
        u.searchParams.set('name', CITY); u.searchParams.set('count','1'); u.searchParams.set('language','fi'); u.searchParams.set('format','json');
        var r=await fetch(u.toString(), {cache:'no-store'});
        if(r.ok){ var j=await r.json(); var g=j&&j.results&&j.results[0]; if(g) return {lat:g.latitude, lon:g.longitude}; }
      }catch(e){}
    }
    // Default to Helsinki if nothing set
    return { lat: 60.1699, lon: 24.9384 };
  }
  async function loadWeather(){
    try{
      var c = await resolveCoords();
      if(!c) { setTemps(NaN, NaN); return; }
      var w = new URL('https://api.open-meteo.com/v1/forecast');
      w.searchParams.set('latitude', String(c.lat)); w.searchParams.set('longitude', String(c.lon));
      w.searchParams.set('daily','temperature_2m_max,temperature_2m_min,weathercode'); w.searchParams.set('timezone','auto');
      var res = await fetch(w.toString(), {cache:'no-store'});
      if(!res.ok) throw new Error('weather');
      var d = await res.json();
      var i=0; var tMax = d&&d.daily&&d.daily.temperature_2m_max? d.daily.temperature_2m_max[i]: null; var tMin = d&&d.daily&&d.daily.temperature_2m_min? d.daily.temperature_2m_min[i]: null; var code = d&&d.daily&&d.daily.weathercode? d.daily.weathercode[i]: null;
      setTemps(tMax, tMin);
      var ic=document.getElementById('wxicon'); if(ic) ic.innerHTML = iconFor(code);
    }catch(e){ setTemps(NaN, NaN); }
  }
  async function loadNews(){
    if(!NEWS_ENABLED || !NEWS_URL) return;
    try{
      var proxyUrl = '/api/rss?url=' + encodeURIComponent(NEWS_URL);
      var res = await fetch(proxyUrl, { cache:'no-store' });
      if(!res.ok) throw new Error('news');
      var text = await res.text();
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      var items = Array.prototype.slice.call(doc.querySelectorAll('item'));
      var entries = items.length ? items : Array.prototype.slice.call(doc.querySelectorAll('entry'));
      var out = [];
      for(var i=0;i<entries.length;i++){
        var el = entries[i];
        var titleEl = el.querySelector('title');
        var catEl = el.querySelector('category') || el.querySelector('dc\\\\:subject');
        var title = titleEl ? titleEl.textContent : '';
        var cat = '';
        if(catEl){
          cat = (catEl.textContent || catEl.getAttribute('term') || '');
        }
        if(title){
          out.push({ title: title.trim(), category: (cat || '').trim() });
        }
      }
      if(NEWS_LIMIT && NEWS_LIMIT > 0) out = out.slice(0, NEWS_LIMIT);
      var list = document.getElementById('news-list');
      if(list){
        list.innerHTML = out.length ? out.map(function(item, idx){
          var safeTitle = String(item.title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          var safeCat = String(item.category || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return '<div class="news-item"><div class="news-num">'+(idx+1)+'.</div><div class="news-text">' +
            (safeCat ? '<div class="news-cat">'+safeCat+'</div>' : '') +
            '<div class="news-title">'+safeTitle+'</div></div></div>';
        }).join('') : '<div class="news-item opacity-60">-</div>';
      }
    }catch(e){}
  }
  function setupLogos(){
    try{
      var logos = document.getElementById('logos');
      var track = document.getElementById('logos-track');
      if(!logos || !track) return;
      var animate = logos.getAttribute('data-animate') === 'true';
      if(!animate) return;
      if(track.scrollWidth <= logos.clientWidth) return;
      logos.classList.add('logos-animate');
      track.insertAdjacentHTML('beforeend', track.innerHTML);
    }catch(e){}
  }
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  setTimeout(fit, 50);
  document.addEventListener('DOMContentLoaded', function(){ updateClock(); setInterval(updateClock, 1000); loadWeather(); loadNews(); setupLogos(); });
})();</script>
  <script id="__HALLWAY_DATA__" type="application/json">${jsonEmbedded}</script>
</body>
</html>`;
  return html;
}

function downloadStaticHtmlFile(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
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
  const [activeTab, setActiveTab] = useState<"hallinta" | "saa" | "info" | "uutiset" | "mainokset">("hallinta");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [showSavedDialog, setShowSavedDialog] = useState<boolean>(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [serverSaveWarning, setServerSaveWarning] = useState<string>("");
  const [isCityOpen, setIsCityOpen] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<string>("");
  const [logoUploading, setLogoUploading] = useState<boolean>(false);
  const [activeLogoId, setActiveLogoId] = useState<string | null>(null);

  // Käynnistyspromptti
  const [showStartupPrompt, setShowStartupPrompt] = useState<boolean>(true);
  const [startupSerial, setStartupSerial] = useState<string>("");
  const [startupError, setStartupError] = useState<string>("");

  // Lukitusluokka gridiin (ettei wrapata kolumnit rikki)
  const lockClass = showStartupPrompt ? "pointer-events-none select-none blur-[1px]" : "";

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
          if (!res.ok) { setStartupError('Antamallasi sarjanumerolla ei läydy tallennettua näyttää.'); return; }
          const text = await res.text();
          const data = parseHallwayFromStaticHtml(text);
          if (!data) { setStartupError('Antamallasi sarjanumerolla ei läydy tallennettua näyttää.'); return; }
          setHallway({ ...emptyHallway(), ...data, serial });
          setShowStartupPrompt(false);
        } catch {
          setStartupError('Antamallasi sarjanumerolla ei läydy tallennettua näyttää.');
        }
      })();
    }
  }, []);
  // Käynnistyspromptin toiminnot
  const handleStartupFetch = async () => {
    const serial = startupSerial.trim().toUpperCase();
    if (!serial) {
      setStartupError("Syätä sarjanumero.");
      return;
    }
    try {
      setStartupError("");
      const res = await fetch(`/ruutu/${encodeURIComponent(serial)}.html?raw=1`, { cache: "no-store" });
      if (!res.ok) {
        setStartupError("Antamallasi sarjanumerolla ei läydy tallennettua näyttää.");
        return;
      }
      const text = await res.text();
      const data = parseHallwayFromStaticHtml(text);
      if (!data) {
        setStartupError("Antamallasi sarjanumerolla ei läydy tallennettua näyttää.");
        return;
      }
      setHallway({ ...emptyHallway(), ...data, serial });
      setShowStartupPrompt(false);
    } catch (e) {
      setStartupError("Antamallasi sarjanumerolla ei läydy tallennettua näyttää.");
    }
  };
  const handleCreateNew = () => {
    setHallway(emptyHallway({ orientation: hallway.orientation }));
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

  const uploadLogoFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { url: String(data.url || ""), name: String(data.name || "") };
  };

  const handleLogoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const existingCount = (hallway.logos || []).length;
    if (existingCount + files.length > 20) {
      setLogoError("Enintään 20 logoa sallittu.");
      return;
    }
    setLogoError("");
    setLogoUploading(true);
    try {
      const uploadedLogos: { id: string; url: string; name?: string }[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadLogoFile(file);
        const cleanName = file.name.replace(/\.[^.]+$/, "");
        uploadedLogos.push({ id: uid(), url: uploaded.url, name: uploaded.name || cleanName });
      }
      setHallway((h) => ({ ...h, logos: [...(h.logos || []), ...uploadedLogos] }));
    } catch (e: any) {
      setLogoError(e?.message || "Logo-upload ep„onnistui");
    } finally {
      setLogoUploading(false);
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

  const handleSave = async () => {
    const serial = hallway.serial?.trim();
    if (!serial) {
      setError("Syätä laitteen sarjanumero ennen tallennusta.");
      return;
    }
    try {
      setError("");
      setStatus("Tallennetaan...");
      const html = buildStaticTvHtml(hallway);
      const fname = staticFilenameFor(hallway);
      const relPath = `/${RUUTU_DIR}/${fname}`;

      const saveRes = await saveRuutu(hallway, html, fname);
      if (!saveRes.ok) {
        setServerSaveWarning(
          `Palvelintallennus epäonnistui (${saveRes.status ?? ""} ${saveRes.statusText ?? saveRes.error ?? ""}). ` +
            `Loin ja latasin HTML:n paikallisesti - muista siirtää tiedosto palvelimelle polkuun ${relPath} jotta TV läytää sen.`
        );
      } else {
        setServerSaveWarning("");
      }

      downloadStaticHtmlFile(fname, html);
      const absUrl = new URL(relPath, window.location.origin).toString();
      setSavedUrl(saveRes.ok ? absUrl : null);
      setShowSavedDialog(true);
      setStatus("Tallennettu");
      setTimeout(() => setStatus(""), 3000);
    } catch (e: any) {
      setStatus("");
      setError(e?.message || "Tallennus epäonnistui");
    }
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
        showPreview ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "flex flex-col items-center gap-6"
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
              <div className="h-px bg-[#aaaaaa]" />
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
            <button role="tab" aria-selected={activeTab === "hallinta"} onClick={() => setActiveTab("hallinta")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "hallinta" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Hallinta</button>
            <button role="tab" aria-selected={activeTab === "uutiset"} onClick={() => setActiveTab("uutiset")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "uutiset" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Uutiset</button>
            <button role="tab" aria-selected={activeTab === "mainokset"} onClick={() => setActiveTab("mainokset")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "mainokset" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Mainokset</button>
            <button role="tab" aria-selected={activeTab === "info"} onClick={() => setActiveTab("info")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "info" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Info</button>
            <button role="tab" aria-selected={activeTab === "saa"} onClick={() => setActiveTab("saa")} className={cn("px-3 py-2 -mb-px border-b-2", activeTab === "saa" ? "border-black font-semibold" : "border-transparent text-zinc-600")}>Sää + aika</button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.max(0.5, Math.round((((h.scale ?? 1) - 0.05) * 100)) / 100) }))}>-</Button>
              <div className="w-14 text-center tabular-nums">{Math.round(((hallway.scale ?? 1) * 100))}%</div>
              <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.min(2, Math.round((((h.scale ?? 1) + 0.05) * 100)) / 100) }))}>+</Button>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="orientation" className="text-sm">Näytön suunta</Label>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="toggle-preview" className="text-sm">TV-esikatselu</Label>
              <Switch id="toggle-preview" checked={showPreview} onCheckedChange={setShowPreview} />
            </div>
            <Button onClick={handleSave} disabled={!hallway.serial?.trim()} className="rounded-2xl px-4 disabled:bg-zinc-300 disabled:text-zinc-600 disabled:hover:bg-zinc-300 disabled:cursor-not-allowed"><Save className="h-4 w-4 mr-2"/>Tallenna</Button>
          </div>
        </div>
      </div>
      {/* Editori (kolumni 1) */}
      <div className={cn(showPreview ? "" : "w-full max-w-4xl")}>        
        <Card className="shadow-lg">
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              {activeTab === 'hallinta' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Users className="h-5 w-5"/>Asukasnäyttö - hallinta</CardTitle>
                  <p className="text-sm opacity-70">Muokkaa kerroksia, asuntoja ja asukkaiden sukunimiä. Muutokset näkyvät oikealla esikatselussa.</p>
                </>
              )}
              {activeTab === 'saa' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><MonitorPlay className="h-5 w-5"/>Asukasnäyttö - Sää + aika</CardTitle>
                  <p className="text-sm opacity-70">Määritä ruudulla näkyvä sää paikkakunnan mukaan. Voit käyttää myös automaattista tai manuaalista aikaa ja päivämäärää.</p>
                </>
              )}
              {activeTab === 'info' && (
                <>
                  <CardTitle className="text-xl flex items-center gap-2"><Users className="h-5 w-5"/>Asukasnäyttö - Info</CardTitle>
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
                  <CardTitle className="text-xl flex items-center gap-2"><Building2 className="h-5 w-5"/>Asukasnäyttö - Mainokset</CardTitle>
                  <p className="text-sm opacity-70">Lisää logot, järjestä ne vetämällä ja määritä näkyvien logoiden määrä.</p>
                </>
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

            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            {status && <div className="mb-3 text-sm text-green-600">{status}</div>}
            {serverSaveWarning && (
              <div className="mb-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-md p-2">{serverSaveWarning}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <Label htmlFor="hallway-name">Käytävän nimi</Label>
                <Input id="hallway-name" value={hallway.name} onChange={(e) => setHallway((h) => ({ ...h, name: e.target.value }))} placeholder="esim. Porraskäytävä B - itäsiipi" />
              </div>
              <div>
                <Label htmlFor="building-name">Rakennus</Label>
                <Input id="building-name" value={hallway.building || ""} onChange={(e) => setHallway((h) => ({ ...h, building: e.target.value }))} placeholder="valinnainen" />
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4"/>Kerrokset</h3>
              <Button variant="secondary" onClick={addFloor} className="rounded-2xl"><Plus className="h-4 w-4 mr-1"/>Lisää kerros</Button>
            </div>

            <ScrollArea className="h-[60vh] pr-2">
              <div className="space-y-4">
                {sortedFloors.map((floor) => (
                  <motion.div key={floor.id} layout className="rounded-2xl p-3 pt-[35px] relative bg-[#dddddd]">
                    <button aria-label="Poista kerros" title="Poista kerros" onClick={() => deleteFloor(floor.id)} className="absolute top-5 right-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 md:col-span-6">
                        <Label>Otsikko</Label>
                        <Input value={floor.label} onChange={(e) => updateFloor(floor.id, { label: e.target.value })} placeholder="Kerros 3" />
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

                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {floor.apartments.map((apt, aptIdx) => (
                            <div key={apt.id} className="rounded-xl p-3 pb-4 bg-[#cccccc]">
                              <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-12">
                                  <Label>Asunnon numero</Label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <Input value={apt.number} onChange={(e) => updateApartment(floor.id, apt.id, { number: e.target.value })} placeholder={apartmentPlaceholder(floor.level, aptIdx)} className="w-full" />
                                    </div>
                                    <div>
                                      <button aria-label="Poista asunto" title="Poista asunto" onClick={() => deleteApartment(floor.id, apt.id)} className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                                    </div>
                                  </div>
                                </div>

                                <div className="col-span-12">
                                  <div className="flex items-center justify-between mt-4 mb-2">
                                    <Label>Asukkaat (1-2)</Label>
                                    <Button
                                      size="sm"
                                      onClick={() => addTenant(floor.id, apt.id)}
                                      disabled={apt.tenants.length >= 2}
                                      className="rounded-2xl bg-[#bbbbbb] border border-[#aaaaaa] text-black hover:bg-[#b0b0b0] disabled:opacity-60 disabled:cursor-not-allowed"
                                      title={apt.tenants.length >= 2 ? "Asunnossa on jo 2 sukunimeä" : undefined}
                                    >
                                      <Plus className="h-4 w-4 mr-1"/>
                                      Lisää sukunimi
                                    </Button>
                                  </div>

                                  <div className="space-y-2 mt-1">
                                    {apt.tenants.map((t) => (
                                      <div key={t.id} className="flex items-center gap-2">
                                        <div className="flex-1">
                                          <Input value={t.surname} onChange={(e) => updateTenant(floor.id, apt.id, t.id, { surname: e.target.value })} placeholder="Sukunimi" className="w-full" />
                                        </div>
                                        <div>
                                          <button aria-label="Poista sukunimi" title="Poista sukunimi" onClick={() => deleteTenant(floor.id, apt.id, t.id)} className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-[3px] py-1"><Trash2 className="h-4 w-4"/></button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
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

                <div className="max-w-xs">
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
                  <input
                    id="logos-animate"
                    type="checkbox"
                    checked={!!hallway.logosAnimate}
                    onChange={(e) => setHallway((h) => ({ ...h, logosAnimate: e.target.checked }))}
                  />
                  <Label htmlFor="logos-animate">Animoi logot</Label>
                </div>

                <div className="flex items-center gap-2">
                  <div>
                    <Label>Logoja näkyvissä</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={hallway.logosLimit ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const num = v ? Number(v) : NaN;
                        setHallway((h) => ({ ...h, logosLimit: Number.isFinite(num) ? Math.min(20, Math.max(1, num)) : undefined }));
                      }}
                      placeholder="N&auml;yt&auml; kaikki"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <Label>Taustaväri (hex)</Label>
                    <Input
                      value={hallway.logosBgColor || ""}
                      onChange={(e) => setHallway((h) => ({ ...h, logosBgColor: e.target.value.trim() }))}
                      placeholder="#111111"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <Label>Lataa logot (max 20)</Label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleLogoFiles(e.target.files)}
                      className="mt-1 block w-full text-sm"
                      disabled={!hallway.logosEnabled}
                    />
                  </div>
                </div>

                {logoUploading && <div className="text-sm opacity-70">Logoja ladataan...</div>}
                {logoError && <div className="text-sm text-red-600">{logoError}</div>}
                <div className="text-xs opacity-70">Logoja yhteensä: {(hallway.logos || []).length}/20</div>

                {(hallway.logos || []).length === 0 ? (
                  <div className="text-sm opacity-70">Ei logoja vielä.</div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
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
                <div className="h-px bg-[#aaaaaa]" />
                <div className="text-sm opacity-70">Nämä asetukset vaikuttavat esikatseluun ja TV:lle tallennettavaan HTML:ään.</div>
              </div>
            )}

            {activeTab === "info" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch id="info-enabled" checked={!!hallway.infoEnabled} onCheckedChange={(v) => setHallway((h) => ({ ...h, infoEnabled: v }))} />
                  <Label htmlFor="info-enabled">Käytössä</Label>
                </div>
                <div>
                  <Label>Sisältö</Label>
                  <SlateEditor value={hallway.infoHtml || ""} onChange={(html: string) => setHallway((h) => ({ ...h, infoHtml: html }))} />
                  <div className="text-sm opacity-60 mt-1">Tallennetaan osaksi TV-näkymää. Skriptit ja tapahtumat poistetaan automaattisesti.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TV-esikatselu (kolumni 2) */}
      {showPreview && (
        <Card data-preview-card className={cn("shadow-xl", lockClass)} aria-hidden={showStartupPrompt ? "true" : undefined}>
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
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setShowSavedDialog(false)}>Sulje</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- TV-esikatselun komponentti ----------
function HallwayTvPreview({ hallway }: { hallway: Hallway }) {
  const orientation: Orientation = hallway.orientation || "landscape";
  const floorsAsc = useMemo(() => [...hallway.floors].sort((a, b) => b.level - a.level), [hallway.floors]);

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
  const [logosShouldAnimate, setLogosShouldAnimate] = useState(false);
  const [newsItems, setNewsItems] = useState<{ title: string; category: string }[]>([]);

  // No column count verification anymore; we always render a single list column

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
      const G = gridRef.current;
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
      const s = Math.min(1, cw / G.scrollWidth, availH / G.scrollHeight);
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
  const shouldAnimate = !!hallway.logosAnimate && logosShouldAnimate && !!hallway.logosEnabled;
  const newsEnabled = !!hallway.newsEnabled && (hallway.newsRssUrl || "").trim().length > 0;
  const newsLimit = typeof hallway.newsLimit === "number" && hallway.newsLimit > 0 ? Math.floor(hallway.newsLimit) : null;
  const baseW = orientation === "portrait" ? 1080 : 1920;
  const baseH = orientation === "portrait" ? 1920 : 1080;
  const logosHeight = 130;
  const renderLogos = shouldAnimate ? [...logos, ...logos] : logos;

  useEffect(() => {
    if (!hallway.logosEnabled) {
      setLogosShouldAnimate(false);
      return;
    }
    if (!hallway.logosAnimate) {
      setLogosShouldAnimate(false);
      return;
    }
    const track = logosTrackRef.current;
    const wrap = logosRef.current;
    if (!track || !wrap) return;
    const measure = () => {
      const width = logosShouldAnimate ? track.scrollWidth / 2 : track.scrollWidth;
      setLogosShouldAnimate(width > wrap.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [hallway.logosAnimate, logos.length, boxSize.w, orientation, logosShouldAnimate]);

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
        height: boxSize.h || undefined,
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
          style={{
            width: baseW,
            transform: `scale(${(gridScale * scaleHint * (hallway.scale ?? 1)).toFixed(3)})`,
            transformOrigin: "top left",
          }}
        >
          <div className="p-5" style={{ height: baseH, display: "flex", flexDirection: "column" }}>
        <div className="flex items-start justify-between pt-5 px-5">
          <div>
            <div className="text-2xl font-semibold tracking-wide">{hallway.building || "Rakennus"}</div>
            <div className="text-sm opacity-70 -mt-1">{hallway.name}</div>
          </div>
          {hallway.weatherClockEnabled && (
            <WeatherClock
              tvStyle
              city={hallway.weatherCity}
              lat={hallway.weatherLat}
              lon={hallway.weatherLon}
              clockMode={hallway.clockMode}
              manualDate={hallway.clockDate}
              manualTime={hallway.clockTime}
            />
          )}
        </div>

        <div className="p-5 pt-4 flex-1 flex gap-8 items-stretch">
          <div className={cn(((hallway.infoEnabled && (hallway.infoHtml || "").trim()) || newsEnabled) ? "basis-1/2" : "basis-full", "min-w-0 p-2 h-full flex") }>
            <div className="vcenter w-full" style={{ paddingLeft: '10%', paddingRight: '10%' }}>
              {floorsAsc.map((floor) => (
                <div key={floor.id} className="mb-6">
                  <div className="text-xl font-semibold uppercase mb-3">{floor.level}. KERROS</div>
                  <div className="flex flex-col gap-3">
                  {floor.apartments.map((apt) => (
                    <div key={apt.id} className="grid grid-cols-[30px_1fr] gap-x-6">
                      <div className="text-sm font-semibold break-words whitespace-normal tabular-nums">{apt.number || "-"}</div>
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
          </div>
          {((hallway.infoEnabled && (hallway.infoHtml || "").trim()) || newsEnabled) && (
            <div className="basis-1/2 min-w-0 p-2">
              <div style={{ paddingLeft: '10%', paddingRight: '10%' }}>
                {newsEnabled && (
                  <div className="news-block">
                    <div className="news-title">Uutiset</div>
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
                {(hallway.infoEnabled && (hallway.infoHtml || "").trim()) && (
                  <div className={cn("info-content", newsEnabled && "mt-6")} dangerouslySetInnerHTML={{ __html: hallway.infoHtml || "" }} />
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
            style={{ height: logosHeight, background: (hallway.logosBgColor || "").trim() || "transparent" }}
          >
            <div ref={logosTrackRef} className="logos-track h-full">
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

      <div ref={footerRef} className="absolute left-0 right-0 bottom-0 text-center text-[10px] opacity-60 pb-1">
        Esikatselu
      </div>
    </div>
  );
}


