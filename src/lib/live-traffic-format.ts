// Client-side formatting helpers for the Live Traffic panel.
// Amaç: URL yerine okunabilir sayfa adı, temiz path, insan-dostu kaynak isimleri.

export type PageMeta = {
  icon: string;
  name: string; // "Ana Sayfa", "İlan Detayı"
  type: string; // kategori: "Ana Sayfa", "İlan", "Kategori"…
  cleanPath: string; // UTM'siz path
  partId?: string;
  oem?: string;
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
  "yclid",
  "dclid",
  "twclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "igshid",
  "srsltid",
  "ref",
  "ref_src",
  "referrer",
]);

export function stripTracking(rawPath: string): string {
  if (!rawPath) return "/";
  try {
    const hasQuery = rawPath.includes("?");
    if (!hasQuery) return rawPath;
    const url = new URL(rawPath, "http://x");
    const keep: string[] = [];
    url.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.has(k.toLowerCase()))
        keep.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    });
    return url.pathname + (keep.length ? `?${keep.join("&")}` : "");
  } catch {
    return rawPath.split("?")[0] || "/";
  }
}

const STATIC_ROUTES: Record<string, { icon: string; name: string; type: string }> = {
  "/": { icon: "🏠", name: "Ana Sayfa", type: "Ana Sayfa" },
  "/parts": { icon: "🚗", name: "Parça Listesi", type: "Liste" },
  "/search": { icon: "🔎", name: "Arama", type: "Arama" },
  "/favorites": { icon: "❤️", name: "Favoriler", type: "Kullanıcı" },
  "/sell": { icon: "📤", name: "İlan Ver", type: "Satıcı" },
  "/sell/bulk": { icon: "📤", name: "Toplu İlan Yükleme", type: "Satıcı" },
  "/account": { icon: "👤", name: "Hesabım", type: "Kullanıcı" },
  "/account/stok": { icon: "📦", name: "Stok Yönetimi", type: "Satıcı" },
  "/auth": { icon: "🔐", name: "Giriş / Kayıt", type: "Kimlik" },
  "/reset-password": { icon: "🔐", name: "Parola Sıfırlama", type: "Kimlik" },
  "/admin": { icon: "⚙️", name: "Yönetim Paneli", type: "Admin" },
  "/requests": { icon: "📢", name: "Parça Talepleri", type: "Talep" },
  "/my-requests": { icon: "📋", name: "Taleplerim", type: "Kullanıcı" },
  "/urgent": { icon: "⚡", name: "Acil Talepler", type: "Talep" },
  "/urgent/new": { icon: "⚡", name: "Yeni Acil Talep", type: "Talep" },
  "/alerts": { icon: "🔔", name: "Uyarılarım", type: "Kullanıcı" },
  "/insights": { icon: "📊", name: "Öngörüler", type: "Bilgi" },
  "/hakkimizda": { icon: "ℹ️", name: "Hakkımızda", type: "Kurumsal" },
  "/iletisim": { icon: "✉️", name: "İletişim", type: "Kurumsal" },
  "/agir-vasita-parcalari": { icon: "🚛", name: "Ağır Vasıta Parçaları", type: "Landing" },
  "/stok": { icon: "📦", name: "Stok Borsası", type: "Liste" },
};

export function describePath(
  rawPath: string | null | undefined,
  hints?: { title?: string | null; oem?: string | null; partId?: string | null },
): PageMeta {
  const path = stripTracking(rawPath || "/");
  const bare = path.split("?")[0] || "/";
  const st = STATIC_ROUTES[bare];
  if (st) return { ...st, cleanPath: path };

  // Parametric routes
  const partMatch = bare.match(/^\/parts\/([^/]+)(?:\/edit)?$/);
  if (partMatch) {
    const isEdit = bare.endsWith("/edit");
    return {
      icon: isEdit ? "✏️" : "📦",
      name: hints?.title || (isEdit ? "İlan Düzenle" : "İlan Detayı"),
      type: isEdit ? "Satıcı" : "İlan",
      cleanPath: path,
      partId: hints?.partId || partMatch[1],
      oem: hints?.oem || undefined,
    };
  }
  const stokMatch = bare.match(/^\/stok\/([^/]+)$/);
  if (stokMatch)
    return { icon: "📦", name: hints?.title || "Stok Detayı", type: "Stok", cleanPath: path };
  const oemMatch = bare.match(/^\/oem\/([^/]+)$/);
  if (oemMatch)
    return {
      icon: "🔩",
      name: `OEM ${decodeURIComponent(oemMatch[1])}`,
      type: "OEM",
      cleanPath: path,
      oem: decodeURIComponent(oemMatch[1]),
    };
  const catMatch = bare.match(/^\/kategori\/([^/]+)$/);
  if (catMatch)
    return {
      icon: "🗂",
      name: `${decodeURIComponent(catMatch[1])} Kategorisi`,
      type: "Kategori",
      cleanPath: path,
    };
  const brandMatch = bare.match(/^\/marka\/([^/]+)$/);
  if (brandMatch)
    return {
      icon: "🏷",
      name: `${decodeURIComponent(brandMatch[1])} Parçaları`,
      type: "Marka",
      cleanPath: path,
    };
  const userMatch = bare.match(/^\/u\/([^/]+)$/);
  if (userMatch)
    return { icon: "👤", name: hints?.title || "Satıcı Profili", type: "Profil", cleanPath: path };
  const reqMatch = bare.match(/^\/requests\/([^/]+)$/);
  if (reqMatch)
    return { icon: "📢", name: hints?.title || "Talep Detayı", type: "Talep", cleanPath: path };

  return { icon: "📄", name: bare, type: "Sayfa", cleanPath: path };
}

// Turn UTM/source strings into a human-readable Turkish label.
const SOURCE_LABELS: Record<string, string> = {
  google: "Google Organik",
  bing: "Bing",
  yandex: "Yandex",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  whatsapp: "WhatsApp",
  wa: "WhatsApp",
  tiktok: "TikTok",
  tt: "TikTok",
  twitter: "Twitter/X",
  x: "Twitter/X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  yt: "YouTube",
  telegram: "Telegram",
  reddit: "Reddit",
  direkt: "Direkt",
  direct: "Direkt",
  "iç sayfa": "İç Sayfa",
};

const PAID_MEDIUM_RE = /(cpc|ppc|paid|ads?|adwords|display|social[-_ ]?paid)/i;

/** UTM ve mevcut source alanından okunabilir kaynak etiketi üret. */
export function prettySource(
  source: string | null | undefined,
  referrer?: string | null,
  landingPath?: string | null,
): string {
  // 1. UTM parametrelerinden reklam kanalı
  if (landingPath) {
    try {
      const url = new URL(landingPath, "http://x");
      const utmSource = url.searchParams.get("utm_source")?.toLowerCase() || "";
      const utmMedium = url.searchParams.get("utm_medium")?.toLowerCase() || "";
      const gclid = url.searchParams.get("gclid");
      const fbclid = url.searchParams.get("fbclid");
      const ttclid = url.searchParams.get("ttclid");

      if (gclid || (utmSource === "google" && PAID_MEDIUM_RE.test(utmMedium))) return "Google Ads";
      if (fbclid) return "Facebook Reklamı";
      if (ttclid) return "TikTok Reklamı";
      if (utmSource && PAID_MEDIUM_RE.test(utmMedium)) {
        const base =
          SOURCE_LABELS[utmSource] || utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
        return `${base} Reklamı`;
      }
      if (utmSource)
        return SOURCE_LABELS[utmSource] || utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
    } catch {
      /* ignore */
    }
  }

  // 2. Referrer bazlı
  const s = (source || "").toLowerCase().trim();
  if (s && SOURCE_LABELS[s]) return SOURCE_LABELS[s];
  if (source && source !== "—") return source;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      const key = host.split(".")[0];
      if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
      return host;
    } catch {
      /* ignore */
    }
  }
  return "Direkt";
}
