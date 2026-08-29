import { useEffect, useState } from "react";
import { MapPin, X, ShieldCheck } from "lucide-react";

const DISMISSED_KEY = "ts:location_consent_dismissed_at";
const RESULT_KEY = "ts_geo_v2"; // aynı geolocation cache anahtarı
const DELAY_MS = 2500;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

/**
 * Kullanıcıdan konum izni istemeden önce açıklayıcı diyalog gösterir.
 * Tarayıcı Geolocation prompt'u yalnızca kullanıcı butona tıklarsa tetiklenir.
 */
export default function LocationConsentDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Daha önce cevap verilmişse (cache varsa) sorma.
    try {
      const raw = localStorage.getItem(RESULT_KEY) ?? sessionStorage.getItem(RESULT_KEY);
      if (raw) return;
      const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? "0");
      if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS) return;
    } catch { /* ignore */ }

    // Sadece production hostname'de GPS izin akışı çalışsın.
    const host = window.location.hostname;
    const allowed = host === "tasitsan.com.tr" || host === "www.tasitsan.com.tr";
    if (!allowed) return;

    // Permissions API "granted" ise sessizce initGeolocation'ı çağır.
    let cancelled = false;
    (async () => {
      try {
        const nav = navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } };
        if (nav.permissions?.query) {
          const status = await nav.permissions.query({ name: "geolocation" as PermissionName });
          if (status.state === "granted") {
            const { initGeolocation } = await import("@/lib/geolocation");
            void initGeolocation({ requestBrowser: true });
            return;
          }
          if (status.state === "denied") return;
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      const t = setTimeout(() => setOpen(true), DELAY_MS);
      return () => clearTimeout(t);
    })();
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
    setOpen(false);
  }

  async function allow() {
    setBusy(true);
    try {
      const { initGeolocation } = await import("@/lib/geolocation");
      await initGeolocation({ requestBrowser: true });
    } catch { /* ignore */ }
    setBusy(false);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-consent-title"
      className="fixed inset-0 z-[105] grid place-items-center p-3 sm:p-4"
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={dismiss}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md bg-card border border-gold/40 rounded-2xl shadow-gold">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Kapat"
          className="absolute right-2 top-2 size-8 grid place-items-center rounded-full text-muted-foreground hover:text-gold hover:bg-gold/10 transition"
        >
          <X className="size-4" />
        </button>
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-12 rounded-xl bg-gold/15 text-gold grid place-items-center border border-gold/30 shrink-0">
              <MapPin className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 id="loc-consent-title" className="font-display text-xl text-gold leading-tight">
                Yakındaki Satıcıları Gör
              </h2>
              <p className="mt-1 text-sm text-foreground/85 leading-snug">
                Konumunuz yalnızca size en yakın satıcıları göstermek için kullanılır.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 text-gold shrink-0 mt-0.5" />
            <span>Konum bilginiz üçüncü kişilerle paylaşılmaz. İzin vermezseniz siteyi normal şekilde kullanmaya devam edebilirsiniz.</span>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={allow}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-gold-gradient text-gold-foreground font-bold text-sm uppercase tracking-wider shadow-gold hover:brightness-110 active:scale-[0.98] transition disabled:opacity-60"
            >
              {busy ? "Konum alınıyor…" : "Yakındaki Satıcıları Göster"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full h-10 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
            >
              Şimdi Değil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
