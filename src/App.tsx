import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, ExternalLink } from "lucide-react";
// UI (shadcn style). If these imports don't exist in your setup, replace with plain HTML elements.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// If your project has a cn helper (like in your old version), import it.
// If not, uncomment the fallback below.
import { cn as importedCn } from "@/lib/utils";
// const importedCn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// =============================================================
// Types
// =============================================================
export type Tenant = { id: string; surname: string };
export type Apartment = { id: string; number: string; tenants: Tenant[] };
export type Floor = { id: string; label: string; level: number; apartments: Apartment[] };
export type Orientation = "portrait" | "landscape";
export type Hallway = {
  id: string;
  name: string;
  building?: string;
  isActive: boolean;
  orientation?: Orientation;
  serial?: string;
  floors: Floor[];
};

// =============================================================
// Helpers
// =============================================================
const cn = importedCn ?? ((...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" "));
const uid = () => Math.random().toString(36).slice(2, 9);
const RUUTU_DIR = "ruutu";

const emptyHallway = (partial?: Partial<Hallway>): Hallway => ({
  id: partial?.id || "demo-hallway",
  name: partial?.name || "Käytävä A",
  building: partial?.building || "",
  isActive: partial?.isActive ?? true,
  orientation: partial?.orientation || "landscape",
  serial: partial?.serial || "",
  floors: partial?.floors || [],
});

const apartmentPlaceholder = (level: number, index: number) => String(level * 100 + (index + 1));

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =============================================================
// Column split rules (from your spec)
// =============================================================
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
  const base = 3; // fill 3 per column after 12
  const minCols = 4;
  const cols = Math.ceil((n - 12) / base) + minCols; // 13→5, 16→6, ...
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
  const base = 5;
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
    out.push(items.slice(idx, idx + take).reverse()); // bottom→top in each column
    idx += take;
  }
  return out;
}

// =============================================================
// Backend adapters
// =============================================================
async function fetchHallwayById(hallwayId: string): Promise<Hallway> {
  // Demo: return empty; real app could GET /api/hallway/:id
  return emptyHallway({ id: hallwayId });
}

export type SaveResult = { ok: boolean; status?: number; statusText?: string; error?: string };
async function saveRuutu(hallway: Hallway, html: string, filename: string): Promise<SaveResult> {
  try {
    const serial = (hallway.serial || "").trim();
    const endpoint = serial ? `/api/ruutu/${encodeURIComponent(serial)}` : "/api/ruutu";
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

// =============================================================
// Static HTML (LG TV) builder
// =============================================================
export function buildStaticTvHtml(h: Hallway): string {
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
              const numberHtml = escapeHtml(apt.number || "—");
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
#content{position:relative;padding:20px;transform-origin:top center}
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
<title>${escapeHtml(h.building || "Rakennus")} – ${escapeHtml(h.name)}</title>
<style>${css}</style>
</head>
<body>
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
    <div id="footer">LG TV – staattinen näkymä</div>
  </div>
  <script>(function(){
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
      var s=Math.min(1, availH/G.scrollHeight, cw/G.scrollWidth);
      G.style.transform='scale('+s+')';
      G.style.transformOrigin='top center';
      var scaledW=G.scrollWidth*s; var pad=(cw-scaledW)/2; if(pad>0){G.style.marginLeft=pad+'px'; G.style.marginRight=pad+'px';}
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

export function parseHallwayFromStaticHtml(html: string): Hallway | null {
  try {
    // FIX: use a safe regex literal (no over-escaping) so TS doesn't misparse it.
    const m = html.match(/<script id="__HALLWAY_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    // The above works in string context, but TypeScript may misparse regexes in some toolchains when embedded in TSX.
    // If you ever see TS1161 again, switch to the version below which avoids double escaping:
    // const m = html.match(/<script id="__HALLWAY_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const json = m[1];
    const data = JSON.parse(json);
    return data as Hallway;
  } catch {
    return null;
  }
}

export function staticFilenameFor(h: Hallway) {
  const serial = (h.serial || "").trim();
  if (serial) return `${serial}.html`;
  return `hallway-${h.id}-${h.orientation || "landscape"}.html`;
}

function downloadStaticHtmlFile(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =============================================================
// Main component (keeps old default export name for compatibility)
// =============================================================
export default function App({ hallwayId = "demo-hallway" }: { hallwayId?: string }) {
  // Admin state
  const [hallway, setHallway] = useState<Hallway>(emptyHallway({ id: hallwayId }));
  const [showStartupPrompt, setShowStartupPrompt] = useState(true);
  const [startupSerial, setStartupSerial] = useState("");
  const [startupError, setStartupError] = useState("");

  // UI state
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [serverSaveWarning, setServerSaveWarning] = useState("");
  const [showSavedDialog, setShowSavedDialog] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  // Preview scaling
  const frameRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Load initial model (demo)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await fetchHallwayById(hallwayId);
      if (!mounted) return;
      if (!data.floors.length) {
        const f1: Floor = { id: uid(), label: "Kerros 1", level: 1, apartments: [] };
        const f2: Floor = { id: uid(), label: "Kerros 2", level: 2, apartments: [] };
        setHallway({ ...data, floors: [f2, f1], orientation: data.orientation || "landscape" });
      } else {
        setHallway({ ...data, orientation: data.orientation || "landscape" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hallwayId]);

  const numColumns = useMemo(() => buildColumnsShared(hallway.floors, hallway.orientation || "landscape").length, [hallway]);

  // Fit preview into its frame
  useEffect(() => {
    function fit() {
      const frame = frameRef.current;
      const grid = gridRef.current;
      if (!frame || !grid) return;
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const gw = grid.scrollWidth;
      const gh = grid.scrollHeight;
      const s = Math.min(1, fw / gw, fh / gh);
      setScale(s);
    }
    fit();
    const ro = new ResizeObserver(() => fit());
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [hallway, numColumns]);

  // On mount: if URL has ?serial=XYZ, load that (compatible with your old path without ?raw=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const serialParam = (params.get("serial") || "").trim().toUpperCase();
    if (!serialParam) return;
    (async () => {
      try {
        const res = await fetch(`/ruutu/${encodeURIComponent(serialParam)}.html`, { cache: "no-store" });
        if (!res.ok) {
          setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
          return;
        }
        const text = await res.text();
        const data = parseHallwayFromStaticHtml(text);
        if (!data) {
          setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
          return;
        }
        setHallway({ ...emptyHallway(), ...data, serial: serialParam });
        setShowStartupPrompt(false);
      } catch {
        setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
      }
    })();
  }, []);

  // Startup actions
  async function handleStartupFetch() {
    const s = startupSerial.trim().toUpperCase();
    if (!s) {
      setStartupError("Syötä sarjanumero.");
      return;
    }
    try {
      const res = await fetch(`/ruutu/${encodeURIComponent(s)}.html`, { cache: "no-store" });
      if (!res.ok) {
        setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
        return;
      }
      const text = await res.text();
      const data = parseHallwayFromStaticHtml(text);
      if (!data) {
        setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
        return;
      }
      setHallway({ ...emptyHallway(), ...data, serial: s });
      setShowStartupPrompt(false);
    } catch (e) {
      setStartupError("Antamallasi sarjanumerolla ei löydy tallennettua näyttöä.");
    }
  }

  function startFromScratch() {
    setHallway(emptyHallway({ id: hallwayId }));
    setShowStartupPrompt(false);
  }

  // CRUD helpers
  function addFloor() {
    const maxLevel = hallway.floors.reduce((m, f) => Math.max(m, f.level), 0);
    const level = maxLevel + 1;
    const newF: Floor = { id: uid(), label: `Kerros ${level}`, level, apartments: [] };
    setHallway({ ...hallway, floors: [newF, ...hallway.floors] }); // newest first
  }
  function removeFloor(fid: string) {
    setHallway({ ...hallway, floors: hallway.floors.filter((f) => f.id !== fid) });
  }
  function addApartment(fid: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) => {
        if (f.id !== fid) return f;
        const idx = f.apartments.length;
        const a: Apartment = { id: uid(), number: apartmentPlaceholder(f.level, idx), tenants: [{ id: uid(), surname: "" }] };
        return { ...f, apartments: [...f.apartments, a] };
      }),
    });
  }
  function removeApartment(fid: string, aid: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) => (f.id === fid ? { ...f, apartments: f.apartments.filter((a) => a.id !== aid) } : f)),
    });
  }
  function setApartmentNumber(fid: string, aid: string, num: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) =>
        f.id === fid
          ? { ...f, apartments: f.apartments.map((a) => (a.id === aid ? { ...a, number: num } : a)) }
          : f
      ),
    });
  }
  function addTenant(fid: string, aid: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) =>
        f.id === fid
          ? {
              ...f,
              apartments: f.apartments.map((a) =>
                a.id === aid && a.tenants.length < 2
                  ? { ...a, tenants: [...a.tenants, { id: uid(), surname: "" }] }
                  : a
              ),
            }
          : f
      ),
    });
  }
  function removeTenant(fid: string, aid: string, tid: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) =>
        f.id === fid
          ? {
              ...f,
              apartments: f.apartments.map((a) => (a.id === aid ? { ...a, tenants: a.tenants.filter((t) => t.id !== tid) } : a)),
            }
          : f
      ),
    });
  }
  function setTenantSurname(fid: string, aid: string, tid: string, name: string) {
    setHallway({
      ...hallway,
      floors: hallway.floors.map((f) =>
        f.id === fid
          ? {
              ...f,
              apartments: f.apartments.map((a) =>
                a.id === aid ? { ...a, tenants: a.tenants.map((t) => (t.id === tid ? { ...t, surname: name } : t)) } : a
              ),
            }
          : f
      ),
    });
  }

  // Build preview model
  const sortedFloors = useMemo(() => [...hallway.floors].sort((a, b) => a.level - b.level), [hallway.floors]);
  const columns = useMemo(() => buildColumnsShared(sortedFloors, hallway.orientation || "landscape"), [sortedFloors, hallway.orientation]);

  // Save
  const [saving, setSaving] = useState(false);
  async function handleSave() {
    const serial = hallway.serial?.trim();
    if (!serial) {
      setError("Syötä laitteen sarjanumero ennen tallennusta.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      setServerSaveWarning("");
      const html = buildStaticTvHtml(hallway);
      const fname = staticFilenameFor(hallway);
      const relPath = `/${RUUTU_DIR}/${fname}`;

      const res = await saveRuutu(hallway, html, fname);
      if (!res.ok) {
        // Failure → download only, no URL dialog
        setServerSaveWarning(
          `Palvelintallennus epäonnistui (${res.status ?? ""} ${res.statusText ?? res.error ?? ""}). ` +
            `Loin ja latasin HTML:n paikallisesti – muista siirtää tiedosto palvelimelle polkuun ${relPath} jotta TV löytää sen.`
        );
        downloadStaticHtmlFile(fname, html);
        setShowSavedDialog(false);
        setSavedUrl(null);
        return;
      }

      // Success → show URL, do not download
      const abs = new URL(relPath, window.location.origin).toString();
      setSavedUrl(abs);
      setShowSavedDialog(true);
      setStatus("Tallennettu");
    } catch (e: any) {
      setError(e?.message || "Tallennus epäonnistui");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(""), 2500);
    }
  }

  // Open preview in new tab via Blob (works without serial)
  function openPreviewInNewTab() {
    const html = buildStaticTvHtml(hallway);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // =============================================================
  // Render
  // =============================================================
  return (
    <div className="w-full min-h-screen bg-[#dedede] text-neutral-900 p-4">
      {/* Startup prompt */}
      {showStartupPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Aloitus</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Hae tallennettu näkymä</h3>
                <div className="text-sm text-neutral-600 mb-2">Syötä laitteen sarjanumero (vain isot kirjaimet):</div>
                <div className="flex gap-2">
                  <Input
                    value={startupSerial}
                    onChange={(e) => setStartupSerial(e.target.value.toUpperCase())}
                    placeholder="LAITTEEN SARJANUMERO (ESIM. ABC123)"
                  />
                  <Button onClick={handleStartupFetch}>Hae</Button>
                </div>
                {startupError && <div className="text-red-600 text-sm mt-2">{startupError}</div>}
              </div>
              <div>
                <h3 className="font-medium mb-2">Aloita uusi</h3>
                <div className="text-sm text-neutral-600 mb-2">Luo tyhjä näkymä ilman talletettua dataa.</div>
                <Button variant="secondary" onClick={startFromScratch}>Luo uusi</Button>
              </div>
            </div>
            <div className="my-6 border-t" style={{ borderColor: "#aaaaaa" }} />
            <div className="text-sm text-neutral-600">Voit koska tahansa tallentaa näkymän sarjanumerolle ja avata sen TV:ssä URLilla /ruutu/&lt;sarjanumero&gt;.html</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1400px] mx-auto">
        {/* Admin */}
        <Card className={cn("shadow-sm", !showStartupPrompt ? "" : "blur-[1px]")}> 
          <CardHeader>
            <CardTitle>Hallinta</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Serial + orientation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <Label className="flex items-center gap-1">
                  Uuden laitteen sarjanumero <span className="text-red-600">*</span>
                </Label>
                <Input
                  value={hallway.serial || ""}
                  onChange={(e) => setHallway({ ...hallway, serial: e.target.value.toUpperCase() })}
                  placeholder="LAITTEEN SARJANUMERO (ESIM. ABC123)"
                />
              </div>
              <div>
                <Label>Näytön suunta</Label>
                <select
                  className="mt-2 w-full border rounded-md h-10 px-3 bg-white"
                  value={hallway.orientation || "landscape"}
                  onChange={(e) => setHallway({ ...hallway, orientation: e.target.value as Orientation })}
                >
                  <option value="landscape">Vaaka</option>
                  <option value="portrait">Pysty</option>
                </select>
              </div>
            </div>

            {/* Building + name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label>Rakennus</Label>
                <Input value={hallway.building || ""} onChange={(e) => setHallway({ ...hallway, building: e.target.value })} />
              </div>
              <div>
                <Label>Näytön nimi</Label>
                <Input value={hallway.name} onChange={(e) => setHallway({ ...hallway, name: e.target.value })} />
              </div>
            </div>

            {/* Floors list */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Kerrokset</h3>
                <Button size="sm" onClick={addFloor}><Plus className="w-4 h-4 mr-1"/> Lisää kerros</Button>
              </div>

              <div className="space-y-4">
                {sortedFloors.map((f) => (
                  <div key={f.id} className="relative rounded-md bg-[#dddddd] p-4 border border-[#cccccc]">
                    {/* floor remove icon */}
                    <button
                      onClick={() => removeFloor(f.id)}
                      className="absolute top-2 right-2 p-[3px] rounded-md text-red-600 hover:bg-red-50"
                      title="Poista kerros"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{f.label}</div>
                      <div className="text-xs opacity-60">(taso {f.level})</div>
                    </div>

                    {/* Apartments */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">Asunnot</div>
                        <Button size="sm" variant="secondary" onClick={() => addApartment(f.id)}>
                          <Plus className="w-4 h-4 mr-1"/> Lisää asunto
                        </Button>
                      </div>

                      <div className="grid gap-3">
                        {f.apartments.map((a, aIdx) => (
                          <div key={a.id} className="rounded-md bg-[#cccccc] p-3 border border-[#bbbbbb]">
                            {/* number row */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Label>Asunnon numero</Label>
                                <Input
                                  value={a.number}
                                  onChange={(e) => setApartmentNumber(f.id, a.id, e.target.value)}
                                  placeholder={apartmentPlaceholder(f.level, aIdx)}
                                />
                              </div>
                              <button
                                className="self-end p-[3px] rounded-md text-red-600 hover:bg-red-50"
                                title="Poista asunto"
                                onClick={() => removeApartment(f.id, a.id)}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>

                            {/* tenants */}
                            <div className="mt-3">
                              <div className="font-medium mb-2">Asukkaat (1–2 sukunimeä)</div>
                              <div className="space-y-2">
                                {a.tenants.map((t) => (
                                  <div key={t.id} className="flex items-center gap-2">
                                    <Input
                                      value={t.surname}
                                      onChange={(e) => setTenantSurname(f.id, a.id, t.id, e.target.value)}
                                      placeholder="SUKUNIMI"
                                    />
                                    <button
                                      className="p-[3px] rounded-md text-red-600 hover:bg-red-50"
                                      title="Poista sukunimi"
                                      onClick={() => removeTenant(f.id, a.id, t.id)}
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                ))}
                                {a.tenants.length < 2 && (
                                  <Button size="sm" variant="secondary" onClick={() => addTenant(f.id, a.id)} className="bg-[#bbbbbb] border border-[#aaaaaa]">
                                    + Lisää sukunimi
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={handleSave} disabled={!hallway.serial?.trim() || saving}>
                  <Save className="w-4 h-4 mr-2"/> Tallenna
                </Button>
                {status && <span className="text-sm opacity-70">{status}</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
              {serverSaveWarning && (
                <div className="mt-2 text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded-md p-2">
                  {serverSaveWarning}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TV Preview */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              TV-esikatselu
              <button
                type="button"
                className="p-2 rounded-md hover:bg-neutral-100"
                title="Avaa uuteen välilehteen"
                onClick={openPreviewInNewTab}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Fixed preview frame with correct orientation */}
            <div
              ref={frameRef}
              className="relative mx-auto bg-black rounded-xl overflow-hidden"
              style={{ width: hallway.orientation === "portrait" ? 540 : 860, height: hallway.orientation === "portrait" ? 860 : 540 }}
            >
              {/* Grid content */}
              <div
                ref={gridRef}
                className="mt-4 grid gap-8 mx-auto text-white"
                style={{
                  transform: `scale(${scale.toFixed(3)})`,
                  transformOrigin: "top center",
                  gridTemplateColumns: `repeat(${Math.max(1, numColumns)}, minmax(0, 1fr))`,
                  width: "max-content",
                  padding: 20,
                }}
              >
                {columns.map((col, ci) => (
                  <div key={ci} className="min-w-[260px]">
                    {col.map((f) => (
                      <div key={f.id} className="mb-6">
                        <div className="font-extrabold tracking-wide uppercase mb-2">{f.level}. KERROS</div>
                        <div className="space-y-2">
                          {f.apartments.map((a) => {
                            const nonEmpty = a.tenants.filter((t) => (t.surname || "").trim());
                            const first = nonEmpty[0]?.surname?.toUpperCase() || "(tyhjä)";
                            const rest = nonEmpty.slice(1).map((t) => t.surname.toUpperCase());
                            return (
                              <div key={a.id} className="flex gap-6 items-start">
                                <div className="w-[60px] font-extrabold tabular-nums">{a.number || "—"}</div>
                                <div className="flex-1">
                                  <div className="font-extrabold leading-tight">{first}</div>
                                  {rest.map((n, i) => (
                                    <div key={i} className="font-extrabold leading-tight">{n}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* footer watermark */}
              <div className="absolute left-0 right-0 bottom-1 text-center text-[10px] text-white/60">LG TV – staattinen esikatselu</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saved dialog */}
      <Dialog open={showSavedDialog} onOpenChange={setShowSavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tallennettu</DialogTitle>
          </DialogHeader>
          <div className="text-sm">
            Näyttö on tallennettu. TV löytää sen osoitteesta:
            {savedUrl && (
              <div className="mt-2">
                <code className="px-2 py-1 bg-neutral-100 rounded select-all break-all">{savedUrl}</code>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSavedDialog(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}