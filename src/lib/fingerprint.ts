// Tarayıcı parmak izi — tekil ziyaretçi tespiti için.
// IP adresi KULLANILMAZ. Parmak izi = cihaz + tarayıcı + ekran + dil + zaman dilimi
// + canvas imzası. Aynı cihaz + aynı tarayıcı = aynı tekil ziyaretçi.

const FP_KEY = "ts_fp_v1";
const LAST_SEEN_KEY = "ts_fp_last_seen";
const UNIQUE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 saat

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

function canvasSignature(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "nocanvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Taşıtsan-fp-∆☺", 2, 2);
    ctx.strokeStyle = "rgba(120,180,60,0.7)";
    ctx.arc(50, 20, 15, 0, Math.PI * 2, true);
    ctx.stroke();
    return fnv1a(c.toDataURL());
  } catch {
    return "nocanvas";
  }
}

function webglSignature(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "nogl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : "";
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return fnv1a(`${vendor}|${renderer}`);
  } catch {
    return "nogl";
  }
}

function compute(): string {
  const n = navigator as Navigator & { deviceMemory?: number };
  const parts = [
    n.userAgent,
    n.language,
    (n.languages || []).join(","),
    String(n.hardwareConcurrency ?? 0),
    String(n.deviceMemory ?? 0),
    String(n.maxTouchPoints ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(window.devicePixelRatio ?? 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(new Date().getTimezoneOffset()),
    canvasSignature(),
    webglSignature(),
  ];
  return "fp_" + fnv1a(parts.join("§")) + fnv1a(parts.reverse().join("|"));
}

let cached: string | null = null;

/** Kalıcı, cihaz+tarayıcı bazlı tekil ziyaretçi kimliği. */
export function getFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(FP_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    /* storage engellenmiş olabilir */
  }
  const fp = compute();
  cached = fp;
  try {
    localStorage.setItem(FP_KEY, fp);
  } catch {
    /* yok sayılır */
  }
  return fp;
}

/**
 * Bu parmak izi son 24 saat içinde ilk kez mi görülüyor?
 * Sayfa yenilemeleri, oturum içi geçişler ve 24 saat içindeki tekrar girişler
 * `false` döner — yani yeni tekil ziyaretçi sayılmaz.
 */
export function markVisitAndCheckUnique(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
    const now = Date.now();
    const isNew = !last || now - last > UNIQUE_WINDOW_MS;
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    return isNew;
  } catch {
    return false;
  }
}

export type EngagementLevel = "quick_exit" | "viewed" | "high_interest";

/** 0-10 sn Hızlı Çıkış · 10-60 sn İncelendi · 60 sn+ Yüksek İlgi */
export function engagementOf(durationMs: number): EngagementLevel {
  if (durationMs < 10_000) return "quick_exit";
  if (durationMs < 60_000) return "viewed";
  return "high_interest";
}

export const ENGAGEMENT_LABEL: Record<EngagementLevel, string> = {
  quick_exit: "Hızlı Çıkış",
  viewed: "İncelendi",
  high_interest: "Yüksek İlgi",
};

/** 134000 → "2 dk 14 sn" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s} sn`;
  return `${m} dk ${s} sn`;
}
