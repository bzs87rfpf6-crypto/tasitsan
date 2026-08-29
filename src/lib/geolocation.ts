// Ziyaretçi konum sistemi.
//
// 1. Tarayıcı Geolocation API ile yüksek doğrulukta konum ister (gps).
// 2. Reverse geocode ile il/ilçe çıkarır (BigDataCloud, ücretsiz, anahtarsız).
// 3. İzin verilmezse IP tabanlı yaklaşık konum (ipapi.co) fallback olarak kullanılır.
// 4. Sonuç sessionStorage + localStorage'a yazılır, ziyaretçi oturumu boyunca kullanılır.
// 5. Kullanıcı giriş yaparsa profil kaydına yazılır.
//
// Not: Reverse geocoding ve IP çağrıları başarısız olursa sessizce düşer; UI etkilenmez.

import { supabase } from "@/integrations/supabase/client";

export type GeoSource = "gps" | "ip" | "unknown";

export type Geo = {
  city: string | null;
  district: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  source: GeoSource;
  updatedAt: number;
};

const CACHE_KEY = "ts_geo_v2";
const PROMPT_FLAG_KEY = "ts_geo_prompted_v1";
const PROFILE_SYNC_KEY = "ts_geo_profile_synced_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 saat sonra yenile

const EMPTY: Geo = {
  city: null,
  district: null,
  country: null,
  latitude: null,
  longitude: null,
  source: "unknown",
  updatedAt: 0,
};

let cached: Geo | null = null;
let inflight: Promise<Geo> | null = null;

function readCache(): Geo | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Geo;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.updatedAt ?? 0) > MAX_AGE_MS) return null;
    cached = parsed;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(geo: Geo) {
  cached = geo;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(geo)); } catch {}
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(geo)); } catch {}
}

async function reverseGeocode(lat: number, lng: number): Promise<Partial<Geo>> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=tr`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("reverse geocode failed");
    const j = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      localityInfo?: { administrative?: Array<{ name?: string; order?: number }> };
      countryName?: string;
    };
    // İl: principalSubdivision (Türkiye için il). İlçe: city veya locality.
    const province = j.principalSubdivision || null;
    const district = j.city || j.locality || null;
    return {
      city: province || district,
      district: province && district && province !== district ? district : null,
      country: j.countryName ?? null,
    };
  } catch {
    return {};
  }
}

async function fetchIpGeo(): Promise<Geo> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) throw new Error("ip geo failed");
    const j = (await res.json()) as { city?: string; region?: string; country_name?: string; latitude?: number; longitude?: number };
    return {
      city: j.region || j.city || null,
      district: j.region && j.city && j.region !== j.city ? j.city : null,
      country: j.country_name ?? null,
      latitude: typeof j.latitude === "number" ? j.latitude : null,
      longitude: typeof j.longitude === "number" ? j.longitude : null,
      source: "ip",
      updatedAt: Date.now(),
    };
  } catch {
    return { ...EMPTY, source: "unknown", updatedAt: Date.now() };
  }
}

function requestBrowserPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Konum bilgisini döndürür. `requestBrowser: true` ile açıkça çağrıldığında
 * tarayıcı Geolocation izni ister (kullanıcı etkileşimi ardından). Aksi halde
 * yalnızca IP tabanlı yaklaşık konum kullanılır. Otomatik GPS prompt YOKTUR.
 */
export async function initGeolocation(opts?: { requestBrowser?: boolean }): Promise<Geo> {
  if (typeof window === "undefined") return EMPTY;
  const wantBrowser = opts?.requestBrowser === true;
  const cachedGeo = readCache();
  if (cachedGeo && (!wantBrowser || cachedGeo.source === "gps")) {
    void syncGeoToProfile(cachedGeo);
    return cachedGeo;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    let geo: Geo;

    if (wantBrowser) {
      try { sessionStorage.setItem(PROMPT_FLAG_KEY, "1"); } catch {}
      const pos = await requestBrowserPosition();
      if (pos && pos.coords) {
        const { latitude, longitude } = pos.coords;
        const rev = await reverseGeocode(latitude, longitude);
        geo = {
          city: rev.city ?? null,
          district: rev.district ?? null,
          country: rev.country ?? null,
          latitude,
          longitude,
          source: "gps",
          updatedAt: Date.now(),
        };
        writeCache(geo);
        void syncGeoToProfile(geo);
        return geo;
      }
    }

    // Otomatik akış veya izin verilmedi → IP fallback.
    geo = await fetchIpGeo();
    writeCache(geo);
    void syncGeoToProfile(geo);
    return geo;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Cache'deki geo bilgisini döner; yoksa boş nesne. Analytics gibi arka plan çağrıları için. */
export function getCachedGeo(): Geo {
  return readCache() ?? EMPTY;
}

/**
 * Kullanıcı authenticated ise ve doğrulanmış konum varsa profile'a yaz.
 * Aynı konumu tekrar tekrar yazmayı önlemek için imza tabanlı guard.
 */
async function syncGeoToProfile(geo: Geo) {
  if (typeof window === "undefined") return;
  if (!geo.city && geo.source !== "gps") return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    const signature = `${userId}|${geo.source}|${geo.city ?? ""}|${geo.district ?? ""}|${geo.latitude ?? ""}|${geo.longitude ?? ""}`;
    try {
      if (localStorage.getItem(PROFILE_SYNC_KEY) === signature) return;
    } catch {}
    const { saveVisitorLocation } = await import("./geolocation.functions");
    await saveVisitorLocation({
      data: {
        city: geo.city,
        district: geo.district,
        country: geo.country,
        latitude: geo.latitude,
        longitude: geo.longitude,
        source: geo.source,
      },
    });
    try { localStorage.setItem(PROFILE_SYNC_KEY, signature); } catch {}
  } catch (err) {
    console.warn("[geolocation] profile sync failed", err);
  }
}

/** Auth durumu değişince cached geo'yu yeni kullanıcıya senkronize et. */
export function attachAuthGeoSync() {
  if (typeof window === "undefined") return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "USER_UPDATED") {
      try { localStorage.removeItem(PROFILE_SYNC_KEY); } catch {}
      const geo = readCache();
      if (geo) void syncGeoToProfile(geo);
    }
    if (event === "SIGNED_OUT") {
      try { localStorage.removeItem(PROFILE_SYNC_KEY); } catch {}
    }
  });
  return () => data.subscription.unsubscribe();
}
