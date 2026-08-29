// Taşıtsan Parça Asistanı — "Bu Parçayı Takip Et" kartı.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SignupPromptDialog } from "@/components/SignupPromptDialog";
import { getMyPartWatch, upsertPartWatch, deleteMyPartWatch } from "@/lib/part-watch.functions";
import { trackEvent } from "@/lib/analytics";

type PrefKey =
  | "notify_price_drop"
  | "notify_cheaper_alternative"
  | "notify_new_seller"
  | "notify_photo_added"
  | "notify_back_in_stock"
  | "notify_original_found"
  | "notify_special_price";

const OPTIONS: { key: PrefKey; label: string }[] = [
  { key: "notify_price_drop", label: "Fiyat düşerse haber ver" },
  { key: "notify_cheaper_alternative", label: "Daha uygun fiyatlı ürün gelirse haber ver" },
  { key: "notify_new_seller", label: "Yeni satıcı bu ürünü eklerse haber ver" },
  { key: "notify_photo_added", label: "Ürüne fotoğraf eklenirse haber ver" },
  { key: "notify_back_in_stock", label: "Stok tekrar gelirse haber ver" },
  { key: "notify_original_found", label: "Orijinal ürün bulunursa haber ver" },
  { key: "notify_special_price", label: "Bu ürün için özel fiyat bulunursa haber ver" },
];

const DEFAULTS: Record<PrefKey, boolean> = {
  notify_price_drop: true,
  notify_cheaper_alternative: true,
  notify_new_seller: false,
  notify_photo_added: false,
  notify_back_in_stock: true,
  notify_original_found: false,
  notify_special_price: false,
};

interface Props {
  partId: string;
  price: number | null;
  className?: string;
}

export function PartWatchCard({ partId, price, className }: Props) {
  const { user, loading } = useAuth();
  const load = useServerFn(getMyPartWatch);
  const save = useServerFn(upsertPartWatch);
  const remove = useServerFn(deleteMyPartWatch);

  const [open, setOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(DEFAULTS);
  const [targetPrice, setTargetPrice] = useState("");
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setWatching(false); return; }
    let cancelled = false;
    load({ data: { part_id: partId } })
      .then((row) => {
        if (cancelled || !row) return;
        setWatching(!!row.is_active);
        setPrefs({
          notify_price_drop: row.notify_price_drop,
          notify_cheaper_alternative: row.notify_cheaper_alternative,
          notify_new_seller: row.notify_new_seller,
          notify_photo_added: row.notify_photo_added,
          notify_back_in_stock: row.notify_back_in_stock,
          notify_original_found: row.notify_original_found,
          notify_special_price: row.notify_special_price,
        });
        if (row.target_price != null) setTargetPrice(String(row.target_price));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, partId, load]);

  const toggle = (k: PrefKey) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const allOn = OPTIONS.every((o) => prefs[o.key]);

  function openPanel() {
    if (loading) return;
    if (!user) {
      trackEvent("part_watch_signup_prompt", { part_id: partId });
      setSignupOpen(true);
      return;
    }
    setOpen((v) => !v);
  }

  async function start() {
    const tp = targetPrice.replace(/\./g, "").replace(",", ".").trim();
    const parsed = tp ? Number(tp) : null;
    if (tp && (!Number.isFinite(parsed) || (parsed as number) <= 0)) {
      toast.error("Geçerli bir hedef fiyat girin.");
      return;
    }
    if (!OPTIONS.some((o) => prefs[o.key]) && !parsed) {
      toast.error("En az bir bildirim seçeneği seçin.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { part_id: partId, ...prefs, target_price: parsed, base_price: price ?? null } });
      setWatching(true);
      setOpen(false);
      trackEvent("part_watch_started", { part_id: partId, target_price: parsed ?? null });
      toast.success("Takip başladı. Değişiklik olduğunda haber vereceğiz.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Takip başlatılamadı");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await remove({ data: { part_id: partId } });
      setWatching(false);
      setOpen(false);
      toast.success("Takip durduruldu.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            {watching ? <BellRing className="size-4 text-gold" /> : <Bell className="size-4 text-gold" />}
            {watching ? "Bu parçayı takip ediyorsunuz" : "Bu Parçayı Takip Et"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Fiyat düşerse, daha uygun ürün veya stok gelirse size haber verelim.
          </p>
        </div>
        <button
          type="button"
          onClick={openPanel}
          className="shrink-0 h-10 px-3 rounded-xl border border-gold/50 bg-gold/5 text-gold text-xs font-bold hover:bg-gold/10 transition"
        >
          {watching ? "Düzenle" : "🔔 Takip Et"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs uppercase tracking-wider text-gold">Bildirim Tercihleri</p>
            <button
              type="button"
              onClick={() => setPrefs(() => {
                const next = { ...DEFAULTS };
                OPTIONS.forEach((o) => { next[o.key] = !allOn; });
                return next;
              })}
              className="text-[11px] text-muted-foreground hover:text-gold"
            >
              {allOn ? "Tümünü kaldır" : "Tümünü seç"}
            </button>
          </div>

          <ul className="space-y-1.5">
            {OPTIONS.map((o) => (
              <li key={o.key}>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer py-1">
                  <span
                    className={`mt-0.5 size-5 shrink-0 rounded-md border grid place-items-center transition ${
                      prefs[o.key] ? "bg-gold/20 border-gold text-gold" : "border-border text-transparent"
                    }`}
                  >
                    <Check className="size-3.5" />
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={prefs[o.key]}
                    onChange={() => toggle(o.key)}
                  />
                  <span className="leading-snug text-foreground/90">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
            <p className="text-xs font-semibold">💰 Fiyat Alarmı</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {price != null
                ? `Mevcut fiyat: ₺${Number(price).toLocaleString("tr-TR")}. Bu fiyatın altına düşerse haber verelim.`
                : "Hedef fiyat belirleyin, altına düşerse haber verelim."}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">₺</span>
              <input
                inputMode="decimal"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Hedef fiyat (örn. 9000)"
                className="flex-1 h-11 rounded-xl bg-background border border-border px-3 text-sm outline-none focus:border-gold/60"
              />
              {targetPrice && (
                <button type="button" onClick={() => setTargetPrice("")} aria-label="Temizle"
                  className="size-9 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="flex-1 h-12 rounded-xl bg-gold-gradient text-gold-foreground font-bold text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "🔔"} Takibi Başlat
            </button>
            {watching && (
              <button
                type="button"
                onClick={stop}
                disabled={busy}
                className="h-12 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10"
              >
                Takibi Durdur
              </button>
            )}
          </div>
        </div>
      )}

      <SignupPromptDialog
        open={signupOpen}
        onOpenChange={setSignupOpen}
        title="Bildirim için ücretsiz hesap"
        source="part_watch"
      />
    </div>
  );
}
