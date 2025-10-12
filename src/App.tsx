import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, MonitorPlay, Users, Building2, Hash, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils"; // jos projektissa ei ole tätä, voit korvata paikallisella apurilla (kommentti alla)
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

function buildStaticTvHtml(h: Hallway): string {
  const orientation: Orientation = h.orientation || "landscape";
  const floorsAsc = [...h.floors].sort((a, b) => a.level - b.level);
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
      return `<div class="col">${floorsHtml}</div>`;
    })
    .join("");

  const css = `
*{box-sizing:border-box}html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}a{color:inherit}
#container{position:relative;height:100vh;width:100vw;overflow:hidden}
#header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 20px 0 20px}
#brand .title{font-size:28px;font-weight:600;letter-spacing:.02em}
#brand .subtitle{opacity:.7;margin-top:-4px;font-size:14px}
#content{position:relative;padding:20px;transform-origin:top left}
.cols{display:flex;gap:32px}
.col{flex:1;min-width:0}
.floor{margin-bottom:24px}
.floor-title{font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px;font-size:22px}
.apt-row{display:flex;gap:24px;margin:6px 0}
.apt-num{width:60px;font-weight:700;font-variant-numeric:tabular-nums}
.apt-names{flex:1}
.apt-name{font-weight:700;font-size:14px;line-height:1.1}
.empty{opacity:.4}
#footer{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:10px;opacity:.7;padding:8px}
`;

  const jsonEmbedded = JSON.stringify(h).replace(/</g, "\\u003c");
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
    </div>
    <div id="content">
      <div class="cols cols-${cols.length}">
        ${columnsHtml}
      </div>
    </div>
    <div id="footer">LG TV - staattinen näkymä</div>
  </div>
  
<script>(function(){
  var USER_SCALE = ${Number(h.scale ?? 1)};
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
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  setTimeout(fit, 50);
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
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [showSavedDialog, setShowSavedDialog] = useState<boolean>(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [serverSaveWarning, setServerSaveWarning] = useState<string>("");

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

  if (loading) {
    return <div className="p-6 text-sm opacity-70">Ladataan hallintaa...</div>;
  }

  return (
    <div
      className={cn(
        "p-4 lg:p-8 bg-[#dedede]",
        showPreview ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "flex justify-center"
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

      {/* Editori (kolumni 1) */}
      <div className={cn(showPreview ? "" : "w-full max-w-4xl")}>        
        <Card className="shadow-lg">
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2"><Users className="h-5 w-5"/>Asukasnäyttö - hallinta</CardTitle>
              <p className="text-sm opacity-70">Muokkaa kerroksia, asuntoja ja asukkaiden sukunimiä. Muutokset näkyvät oikealla esikatselussa.</p>
            </div>
            <Button onClick={handleSave} disabled={!hallway.serial?.trim()} className="ml-auto rounded-2xl px-4 disabled:bg-zinc-300 disabled:text-zinc-600 disabled:hover:bg-zinc-300 disabled:cursor-not-allowed"><Save className="h-4 w-4 mr-2"/>Tallenna</Button>
            <div className="hidden items-center gap-3">
              {/* Näytön suunta */}
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
              <Button onClick={handleSave} disabled={!hallway.serial?.trim()} className="hidden rounded-2xl px-4 disabled:bg-zinc-300 disabled:text-zinc-600 disabled:hover:bg-zinc-300 disabled:cursor-not-allowed"><Save className="h-4 w-4 mr-2"/>Tallenna</Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Sarjanumero */}
            <div className="mb-3 flex items-center gap-4 justify-end">
              <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.max(0.5, Math.round((((h.scale ?? 1) - 0.05) * 100)) / 100) }))}>-</Button>
                <div className="w-14 text-center tabular-nums">{Math.round(((hallway.scale ?? 1) * 100))}%</div>
                <Button type="button" variant="secondary" onClick={() => setHallway((h) => ({ ...h, scale: Math.min(2, Math.round((((h.scale ?? 1) + 0.05) * 100)) / 100) }))}>+</Button>
              </div>
                <Label htmlFor="orientation" className="text-sm">Näytön suunta</Label>
                <select id="orientation" value={hallway.orientation || "landscape"} onChange={(e) => setHallway((h) => ({ ...h, orientation: e.target.value as Orientation }))} className="h-9 px-2 rounded-md border bg-white text-black">
                  <option value="portrait">Pysty</option>
                  <option value="landscape">Vaaka</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="toggle-preview" className="text-sm">TV-esikatselu</Label>
                <Switch id="toggle-preview" checked={showPreview} onCheckedChange={setShowPreview} />
              </div>
            </div>
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
  const floorsAsc = useMemo(() => [...hallway.floors].sort((a, b) => a.level - b.level), [hallway.floors]);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [gridScale, setGridScale] = useState(1);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastLandscapeRef = useRef<{ w: number; h: number } | null>(null);
  const [scaleHint, setScaleHint] = useState(1);
  const [numCols, setNumCols] = useState<number>(orientation === "portrait" ? 2 : 3);

  const buildColumns = (items: Floor[]): Floor[][] => buildColumnsShared(items, orientation);
  const [columns, setColumns] = useState<Floor[][]>(buildColumns(floorsAsc));

  useEffect(() => {
    const expectedLandscape: Record<number, number[]> = {
      1: [1], 2: [1, 1], 3: [2, 1], 4: [2, 2], 5: [2, 2, 1], 6: [2, 2, 2], 7: [2, 2, 2, 1], 8: [2, 2, 2, 2], 9: [3, 2, 2, 2], 10: [3, 3, 2, 2], 11: [3, 3, 3, 2], 12: [3, 3, 3, 3],
    };
    const expectedPortrait: Record<number, number[]> = {
      1: [1], 2: [2], 3: [3], 4: [4], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [5, 4], 10: [5, 5], 11: [6, 5], 12: [6, 6], 13: [5, 5, 3], 14: [5, 5, 4], 15: [5, 5, 5],
    };
    const check = (n: number, got: number[], want?: number[]) => {
      if (want && want.length && got.join(",") !== want.join(",")) {
        console.warn("Sarakejako ei vastaa odotusta", { orientation, n, got, want });
      }
    };
    for (let n = 1; n <= 12; n++) check(n, computeLandscapeCounts(n), expectedLandscape[n]);
    for (let n = 1; n <= 15; n++) check(n, computePortraitCounts(n), expectedPortrait[n]);
  }, [orientation]);

  // Laske esikatselulaatikon koko niin, että pysty = vaaka käänteisenä
  useEffect(() => {
    const updateBox = () => {
      const el = containerRef.current;
      const parent = el?.parentElement as HTMLElement | null;
      if (!el || !parent) return;

      // Respect element box-sizing. Tailwind sets border-box, where width/height include padding.
      const cs = getComputedStyle(el);
      const isBorderBox = (cs.boxSizing || "border-box").toLowerCase() === "border-box";
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

      const pw = parent.clientWidth;
      const ph = parent.clientHeight;
      // If border-box, we must NOT subtract padding from the target width/height we set.
      const maxW = isBorderBox ? pw : Math.max(0, pw - padX);
      const maxH = isBorderBox ? ph : Math.max(0, ph - padY);

      // Fit 16:9 rectangle inside available area, with a tiny safety margin.
      const safeW = Math.max(0, maxW - 1);
      const safeH = Math.max(0, maxH - 1);
      const widthL = Math.min(safeW, safeH * (16 / 9));
      const heightL = (widthL * 9) / 16;
      const w = orientation === "landscape" ? widthL : heightL;
      const h = orientation === "landscape" ? heightL : widthL;
      if (orientation === "landscape") {
        lastLandscapeRef.current = { w: widthL, h: heightL };
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
      const countsNow = orientation === "landscape" ? computeLandscapeCounts(n) : computePortraitCounts(n);
      const targetCols = Math.max(1, countsNow.length);
      if (targetCols !== numCols) setNumCols(targetCols);

      const hint = orientation === "landscape" ? (n >= 10 ? 0.9 : n >= 7 ? 0.95 : 1) : 1;
      setScaleHint(hint);

      if (!C || !G) return;
      const ch = C.clientHeight;
      const cw = C.clientWidth;
      const usedTop = H ? H.getBoundingClientRect().height : 0;
      const usedBottom = F ? F.getBoundingClientRect().height : 0;
      const availH = Math.max(0, ch - usedTop - usedBottom);
      const s = Math.min(1, availH / G.scrollHeight, cw / G.scrollWidth);
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
  }, [orientation, numCols, hallway, floorsAsc.length]);

  useEffect(() => {
    setColumns(buildColumns(floorsAsc));
  }, [floorsAsc, orientation]);

  useEffect(() => {
    const total = floorsAsc.length;
    const sum = columns.reduce((acc, c) => acc + c.length, 0);
    if (sum !== total) console.warn("Sarakejako ei täsmää kerrosten lukumäärään", { total, sum, numCols });
  }, [floorsAsc, columns, numCols]);

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
      className="bg-black text-white rounded-2xl p-5 overflow-hidden relative"
    >
      <div
        ref={gridRef}
        style={{
          transform: `scale(${(gridScale * scaleHint * (hallway.scale ?? 1)).toFixed(3)})`,
          transformOrigin: "top left",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-wide">{hallway.building || "Rakennus"}</div>
            <div className="text-sm opacity-70 -mt-1">{hallway.name}</div>
          </div>
        </div>

        <div
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, numCols)}, minmax(0, 1fr))`,
          }}
          className="mt-4 grid gap-8"
        >
        {columns.map((column, ci) => (
          <div key={ci} className="p-2">
            {column.map((floor) => (
              <div key={floor.id} className="mb-6">
                <div className="text-xl font-semibold uppercase mb-3">{floor.level}. KERROS</div>
                <div className="flex flex-col gap-3">
                  {floor.apartments.map((apt) => (
                    <div key={apt.id} className="grid grid-cols-[60px_1fr] gap-x-6">
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
        ))}
        </div>
      </div>

      <div ref={footerRef} className="absolute left-0 right-0 bottom-0 text-center text-[10px] opacity-60 pb-1">
        Esikatselu
      </div>
    </div>
  );
}













