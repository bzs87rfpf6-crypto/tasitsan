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
      .from("site_settings")
      .select("contact_phone")
      .maybeSingle()
      .then(({ data }) => setContactPhone((data?.contact_phone as string) ?? ""));
  }, []);

  const phoneDigits = contactPhone.replace(/\D/g, "");
  const handleCall = () => {
    if (!phoneDigits) { toast.error("Müşteri hizmetleri numarası henüz tanımlanmadı."); return; }
    window.location.href = `tel:${phoneDigits}`;
  };
  const handleWhatsapp = () => {
    if (!phoneDigits) { toast.error("WhatsApp hattı henüz tanımlanmadı."); return; }
    window.open(`https://wa.me/${phoneDigits}`, "_blank", "noopener");
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = supabase
        .from("parts")
        .select("id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code")
        .order("created_at", { ascending: false })
        .limit(80);

      if (cat !== "Tümü") query = query.eq("category", cat);
      if (brand.trim()) query = query.ilike("brand", `%${brand.trim()}%`);
      if (model.trim()) query = query.ilike("model", `%${model.trim()}%`);
      if (year.trim()) query = query.eq("year", parseInt(year));
      if (oem.trim()) query = query.ilike("oem_code", `%${oem.trim()}%`);
      if (minPrice) query = query.gte("price", parseFloat(minPrice));
      if (maxPrice) query = query.lte("price", parseFloat(maxPrice));
      if (q.trim()) {
        const s = q.trim().replace(/,/g, " ");
        query = query.or(
          `title.ilike.%${s}%,brand.ilike.%${s}%,model.ilike.%${s}%,oem_code.ilike.%${s}%,description.ilike.%${s}%`,
        );
      }
      const { data } = await query;
      if (active) {
        setParts((data ?? []) as Part[]);
        setLoading(false);
      }
    }, 250);
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
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gold pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Örn. far, fren balatası, OEM A2118200561..."
              className="pl-12 pr-12 h-14 sm:h-16 text-base sm:text-lg bg-card border-2 border-border focus-visible:border-gold rounded-2xl shadow-gold"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full hover:bg-muted grid place-items-center">
                <X className="size-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setPhotoOpen(true)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-card border border-gold/40 text-gold font-semibold text-sm hover:bg-gold/10 transition-colors shadow-gold/30"
          >
            <Camera className="size-4" />
            Fotoğraftan Parça Bul
            <Sparkles className="size-3.5 opacity-70" />
          </button>


          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
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
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all ${
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

      {/* Akıllı Talep Havuzu CTA */}
      <section className="max-w-3xl mx-auto px-4 pt-5">
        <button
          onClick={() => setRequestOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-gold/15 via-gold/5 to-transparent border border-gold/40 hover:border-gold/70 transition-colors text-left"
        >
          <div className="size-11 rounded-full bg-gold-gradient grid place-items-center shrink-0 shadow-gold">
            <PackageSearch className="size-5 text-gold-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm sm:text-base tracking-wide">Parça Bulunamadı mı? Talep Oluştur</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Talebiniz satıcı havuzuna düşsün, onaylı teklifler size gelsin.
            </p>
          </div>
          <span className="text-gold font-semibold text-sm shrink-0">→</span>
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

      <Link
        to="/sell"
        className="fixed bottom-20 right-4 z-30 size-14 rounded-full bg-gold-gradient text-gold-foreground grid place-items-center shadow-gold active:scale-95 transition-transform"
        aria-label="İlan ver"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </Link>

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

