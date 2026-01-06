import React, { useEffect, useMemo, useState } from "react";

type Weather = { tMinC: number | null; tMaxC: number | null; weathercode: number | null };

export type WeatherClockProps = {
  className?: string;
  city?: string;
  lat?: number;
  lon?: number;
  clockMode?: "auto" | "manual";
  manualDate?: string;
  manualTime?: string;
  timeZone?: string;
  tvStyle?: boolean; // when true, use fixed px sizes to match blob
};

const Ic = {
  Sun: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  ),
  Cloud: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}>
      <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 18Z" fill="currentColor" />
    </svg>
  ),
  Rain: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}>
      <path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 14Z" fill="currentColor" />
      <path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3" />
    </svg>
  ),
  Snow: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <path d="M12 4v16M7 7l10 10M17 7L7 17" />
    </svg>
  ),
  Fog: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}>
      <path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor" />
      <path d="M3 16h18M5 19h14" />
    </svg>
  ),
  Thunder: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" {...p}>
      <path d="M7 12h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.9A4 4 0 0 0 7 12Z" fill="currentColor" />
      <path d="M13 13l-3 6h3l-1 4 4-7h-3l1-3z" />
    </svg>
  ),
};

const iconForCode = (code: number | null) => {
  if (code == null) return Ic.Cloud;
  if (code === 0) return Ic.Sun;
  if ([1, 2, 3].includes(code)) return Ic.Cloud;
  if ([45, 48].includes(code)) return Ic.Fog;
  if ([51, 53, 55, 56, 57].includes(code)) return Ic.Rain;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return Ic.Rain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return Ic.Snow;
  if ([95, 96, 99].includes(code)) return Ic.Thunder;
  return Ic.Cloud;
};

function formatNumber(n: number | null): string {
  return typeof n === "number" && isFinite(n) ? Math.round(n).toString() : "–";
}

function parseManual(date?: string, time?: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return isNaN(d.getTime()) ? null : d;
}

export default function WeatherClock({ className, city, lat, lon, clockMode = "auto", manualDate, manualTime, timeZone, tvStyle = true }: WeatherClockProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [weather, setWeather] = useState<Weather>({ tMinC: null, tMaxC: null, weathercode: null });
  const tz = useMemo(() => timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, [timeZone]);

  useEffect(() => {
    if (clockMode !== "auto") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [clockMode]);

  useEffect(() => {
    let cancelled = false;
    async function resolveCoords(): Promise<{ lat: number; lon: number }> {
      if (typeof lat === "number" && typeof lon === "number") return { lat, lon };
      if (city && city.trim()) {
        try {
          const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
        u.searchParams.set("name", city.trim()); u.searchParams.set("count", "1"); u.searchParams.set("language", "fi"); u.searchParams.set("format", "json");
          const r = await fetch(u.toString(), { cache: "no-store" });
          if (r.ok) { const j = await r.json(); const g = j?.results?.[0]; if (g) return { lat: g.latitude, lon: g.longitude }; }
        } catch {}
      }
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("geolocation-timeout")), 4000);
            navigator.geolocation.getCurrentPosition(p => { clearTimeout(t); resolve(p); }, () => { clearTimeout(t); reject(new Error("geolocation-error")); }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 3500 });
          });
          return { lat: pos.coords.latitude, lon: pos.coords.longitude };
        } catch {}
      }
      return { lat: 60.1699, lon: 24.9384 };
    }
    async function load() {
      try {
        const { lat: la, lon: lo } = await resolveCoords();
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(la)); url.searchParams.set("longitude", String(lo));
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode"); url.searchParams.set("timezone", tz || "auto");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error("weather-http");
        const data = await res.json();
        const i = 0; const tMax = data?.daily?.temperature_2m_max?.[i] ?? null; const tMin = data?.daily?.temperature_2m_min?.[i] ?? null; const code = data?.daily?.weathercode?.[i] ?? null;
        if (!cancelled) setWeather({ tMinC: tMin, tMaxC: tMax, weathercode: code });
      } catch { if (!cancelled) setWeather({ tMinC: null, tMaxC: null, weathercode: null }); }
    }
    load(); const hourly = setInterval(load, 60*60*1000); return () => { cancelled = true; clearInterval(hourly); };
  }, [city, lat, lon, tz]);

  const manual = useMemo(() => parseManual(manualDate, manualTime), [manualDate, manualTime]);
  const displayNow = clockMode === "manual" && manual ? manual : now;
  const dayStr = useMemo(() => displayNow.toLocaleDateString("fi-FI", { weekday: "long" }), [displayNow]);
  const timeStr = useMemo(() => displayNow.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }).replace(":", "."), [displayNow]);
  const dateStr = useMemo(() => displayNow.toLocaleDateString("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric" }), [displayNow]);
  const Icon = iconForCode(weather.weathercode);

  const scaleVar = "var(--preview-text-scale, 1)";
  const timeStyle = tvStyle ? { fontSize: `calc(28px * ${scaleVar})`, fontWeight: 600 } : undefined;
  const dayStyle = tvStyle ? { fontSize: `calc(12px * ${scaleVar})` } : undefined;
  const dateStyle = tvStyle ? { fontSize: `calc(12px * ${scaleVar})` } : undefined;
  const iconSize: number | string = tvStyle ? `calc(32px * ${scaleVar})` : 36;
  const maxTempStyle: React.CSSProperties | undefined = tvStyle ? { ...timeStyle } : undefined;
  const minTempStyle: React.CSSProperties | undefined = tvStyle ? { ...dateStyle } : undefined;
  const cityStyle: React.CSSProperties | undefined = tvStyle ? { ...dayStyle } : undefined;
  const cityLabel = (city || "").trim() || "Helsinki";

  return (
    <div className={"flex items-center gap-6 " + (className || "")} aria-label="Aika, päivämäärä ja sää">
      <div className="flex flex-col leading-tight select-none text-center">
        <div style={dayStyle} className="opacity-70">{dayStr}</div>
        <div style={timeStyle} className="tabular-nums">{timeStr}</div>
        <div style={dateStyle} className="opacity-70 tabular-nums">{dateStr}</div>
      </div>
      <div aria-hidden className="flex items-center justify-center" style={{ width: iconSize, height: iconSize }}>
        <Icon width={iconSize} height={iconSize} />
      </div>
      <div className="flex flex-col items-center leading-tight text-center tabular-nums">
        <div style={cityStyle} className="opacity-70">{cityLabel}</div>
        <div style={maxTempStyle}>{formatNumber(weather.tMaxC)} °C</div>
        <div style={minTempStyle} className="opacity-80">{formatNumber(weather.tMinC)} °C</div>
      </div>
    </div>
  );
}






