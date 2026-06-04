import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Plus, SlidersHorizontal, X, PackageSearch, Camera, Sparkles, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PartCard, type Part } from "@/components/PartCard";
import { PhotoSearchDialog } from "@/components/PhotoSearchDialog";
import { PartRequestDialog } from "@/components/PartRequestDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Taşıtsan Parça Borsası — Yedek Parça Ara" },
      { name: "description", content: "Parça adı, OEM kodu, marka, model ve yıla göre yedek parça ara. Bulamadığınızı talep edin, Taşıtsan sizin için bulsun." },
    ],
  }),
  component: Index,
});

const CATEGORIES = [
  "Tümü", "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

const CURRENT_YEAR = new Date().getFullYear();

function Index() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tümü");
  const [showFilters, setShowFilters] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [oem, setOem] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    supabase
      .rpc("get_public_site_settings")
      .maybeSingle()
      .then(({ data }) => setContactPhone(((data as any)?.contact_phone as string) ?? ""));
  }, []);

  const phoneDigits = contactPhone.replace(/\D/g, "");
  const handleCall = () => {
    if (!phoneDigits) { toast.error("Müşteri hizmetleri numarası henüz tanımlanmadı."); return; }
    trackEvent("click_call", { from: "home_fab" });
    window.location.href = `tel:${phoneDigits}`;
  };
  const handleWhatsapp = () => {
    if (!phoneDigits) { toast.error("WhatsApp hattı henüz tanımlanmadı."); return; }
    trackEvent("click_whatsapp", { from: "home_fab" });
    window.open(`https://wa.me/${phoneDigits}`, "_blank", "noopener");
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = supabase
        .from("parts")
        .select("id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id")
        .order("created_at", { ascending: false })
        .limit(80);

      if (cat !== "Tümü") query = query.eq("category", cat);
      if (brand.trim()) query = query.ilike("brand", `%${brand.trim()}%`);
      if (model.trim()) query = query.ilike("model", `%${model.trim()}%`);
      if (year.trim()) query = query.eq("year", parseInt(year));
      if (oem.trim()) {
        const o = oem.trim().toUpperCase();
        query = query.or(`oem_code.ilike.%${o}%,oem_codes.cs.{${o}}`);
      }
      if (minPrice) query = query.gte("price", parseFloat(minPrice));
      if (maxPrice) query = query.lte("price", parseFloat(maxPrice));
      if (q.trim()) {
        const s = q.trim().replace(/,/g, " ");
        const up = s.toUpperCase();
        query = query.or(
          `title.ilike.%${s}%,brand.ilike.%${s}%,model.ilike.%${s}%,oem_code.ilike.%${s}%,engine_code.ilike.%${up}%,description.ilike.%${s}%,oem_codes.cs.{${up}}`,
        );
      }
      const { data } = await query;
      if (active) {
        const rows = (data ?? []) as (Part & { seller_id: string })[];
        const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
        let verifiedSet = new Set<string>();
        if (sellerIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,is_verified")
            .in("id", sellerIds)
            .eq("is_verified", true);
          verifiedSet = new Set(((profs ?? []) as { id: string }[]).map((p) => p.id));
        }
        setParts(rows.map((r) => ({ ...r, seller_verified: verifiedSet.has(r.seller_id) })));
        setLoading(false);
        // Track searches (text or OEM) — only when there's a meaningful query.
        if (q.trim().length >= 2) {
          trackEvent("search", { query: q.trim(), category: cat, results: (data ?? []).length });
        }
        if (oem.trim().length >= 2) {
          const oemUp = oem.trim().toUpperCase();
          trackEvent("oem_search", { oem: oemUp, results: (data ?? []).length });
          supabase.from("oem_searches").insert({
            oem: oemUp,
            user_id: user?.id ?? null,
            results_count: (data ?? []).length,
          }).then(() => { /* fire and forget */ });
        }
      }
    }, 600);
    return () => { active = false; clearTimeout(t); };
  }, [q, cat, brand, model, year, oem, minPrice, maxPrice]);

  const activeFilterCount = useMemo(() =>
    [brand, model, year, oem, minPrice, maxPrice].filter((v) => v.trim() !== "").length,
    [brand, model, year, oem, minPrice, maxPrice]);

  const clearFilters = () => {
    setBrand(""); setModel(""); setYear(""); setOem(""); setMinPrice(""); setMaxPrice("");
  };

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />

      {/* HERO SEARCH */}
      <section className="bg-gradient-to-b from-gold/10 via-background to-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 pt-6 pb-5 space-y-4">
          <div className="text-center space-y-1.5">
            <h1 className="font-display text-2xl sm:text-3xl tracking-wide">Aradığın parça bir tıkla</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Parça adı, OEM kodu, marka, model veya yıla göre ara.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-6 text-gold pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Örn. far, fren balatası, OEM A2118200561..."
              className="pl-12 pr-12 h-16 sm:h-[4.5rem] text-base sm:text-lg bg-card border-2 border-gold/60 focus-visible:border-gold rounded-2xl animate-search-glow"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full hover:bg-gold/15 grid place-items-center tap-gold">
                <X className="size-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setPhotoOpen(true)}
            className="tap-gold w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-gold/40 text-gold font-semibold text-sm hover:bg-gold/10 shadow-gold/30"
          >
            <Camera className="size-4" />
            Fotoğraftan Parça Bul
            <Sparkles className="size-3.5 opacity-70" />
          </button>


          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`tap-gold shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border flex items-center gap-1.5 ${
                showFilters || activeFilterCount
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
              Filtre {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`tap-gold shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                  cat === c
                    ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                    : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {showFilters && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">Gelişmiş Filtreler</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground">Temizle</button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Input placeholder="Marka" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-10 bg-background" />
                <Input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} className="h-10 bg-background" />
                <Input
                  placeholder="Model Yılı"
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  max={CURRENT_YEAR}
                  className="h-10 bg-background"
                />
                <Input placeholder="OEM Kodu" value={oem} onChange={(e) => setOem(e.target.value)} className="h-10 bg-background sm:col-span-3 font-mono" />
                <Input
                  placeholder="Min ₺"
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
                  className="h-10 bg-background"
                />
                <Input
                  placeholder="Max ₺"
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
                  className="h-10 bg-background col-span-1 sm:col-span-2"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 🚨 Acil Parça Talebi CTA */}
      <section className="max-w-3xl mx-auto px-4 pt-5">
        <Link
          to="/urgent/new"
          className="tap-gold relative w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-destructive/25 via-destructive/10 to-background border-2 border-destructive/60 text-left shadow-lg overflow-hidden no-underline animate-pulse"
        >
          <div className="size-12 rounded-2xl bg-destructive/20 grid place-items-center shrink-0">
            <span className="text-2xl">🚨</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base sm:text-lg tracking-wide text-destructive">
              Acil Parça Talebi Oluştur
            </p>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Tedarikçilere anında iletilsin · bilgileriniz gizli kalır
            </p>
          </div>
          <span className="text-destructive font-bold text-xl shrink-0">→</span>
        </Link>
      </section>

      {/* Akıllı Talep Havuzu CTA — vurgulu */}
      <section className="max-w-3xl mx-auto px-4 pt-4">
        <button
          onClick={() => setRequestOpen(true)}
          className="tap-gold relative w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-gold/25 via-gold/10 to-background border-2 animate-gold-pulse-border text-left shadow-gold overflow-hidden"
        >
          <div className="size-14 rounded-2xl bg-gold-gradient grid place-items-center shrink-0 shadow-gold">
            <PackageSearch className="size-7 text-gold-foreground" strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg sm:text-xl tracking-wide text-gold">
              Parça Bulunamadı mı?
            </p>
            <p className="font-semibold text-sm sm:text-base text-foreground -mt-0.5">
              Talep Oluştur — Taşıtsan senin için bulsun
            </p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
              Talebin satıcı havuzuna düşer, onaylı teklifler doğrudan sana gelir.
            </p>
          </div>
          <span className="text-gold font-bold text-xl shrink-0 animate-pulse">→</span>
        </button>
      </section>

      <div className="max-w-3xl mx-auto px-4 pt-5">

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-4 bg-card border border-border rounded-2xl">
            <div className="size-16 rounded-full bg-gold/10 grid place-items-center mx-auto">
              <PackageSearch className="size-8 text-gold" />
            </div>
            <div className="space-y-1">
              <p className="font-display text-lg">Aradığınız parça bulunamadı.</p>
              <p className="text-sm text-muted-foreground">Talep oluşturmak ister misiniz?</p>
              <p className="text-[11px] text-muted-foreground/80">Taşıtsan ekibi sizin için arayıp size dönüş yapar.</p>
            </div>
            <Button
              onClick={() => setRequestOpen(true)}
              className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold"
            >
              Parça Talebi Oluştur
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground px-1">{parts.length} sonuç</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {parts.map((p) => <PartCard key={p.id} part={p} />)}
            </div>
            <div className="pt-6 text-center text-xs text-muted-foreground border-t border-border mt-6">
              <p>Aradığınızı bulamadınız mı?</p>
              <button onClick={() => setRequestOpen(true)} className="text-gold font-semibold mt-1 hover:underline">
                Parça Talebi Oluştur →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sabit sağ-alt aksiyon kümesi */}
      <div className="fixed right-4 bottom-20 z-30 flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={handleCall}
          aria-label="Bizi Ara"
          className="tap-gold group flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-card border-2 border-gold/70 text-gold font-semibold text-sm shadow-gold"
        >
          <Phone className="size-5" strokeWidth={2.4} />
          <span className="hidden sm:inline">Bizi Ara</span>
        </button>
        <button
          type="button"
          onClick={handleWhatsapp}
          aria-label="WhatsApp"
          className="tap-gold flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-whatsapp text-white font-semibold text-sm shadow-gold"
        >
          <MessageCircle className="size-5" strokeWidth={2.4} />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
        <Link
          to="/sell"
          className="tap-gold size-14 rounded-full bg-gold-gradient text-gold-foreground grid place-items-center shadow-gold"
          aria-label="İlan ver"
        >
          <Plus className="size-7" strokeWidth={2.5} />
        </Link>
      </div>

      <BottomNav />

      <PartRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        userId={user?.id ?? null}
        initial={{ search_query: q, brand, model, year, oem, category: cat === "Tümü" ? "" : cat }}
      />
      <PhotoSearchDialog open={photoOpen} onOpenChange={setPhotoOpen} />
    </div>
  );
}

