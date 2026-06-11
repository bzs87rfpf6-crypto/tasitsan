import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, SlidersHorizontal, X, PackageSearch, Sparkles, Phone, MessageCircle, BellPlus, Map as MapIcon, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PartCard, type Part } from "@/components/PartCard";
import { StockMapDialog } from "@/components/StockMapDialog";
import { OemQueryDialog } from "@/components/OemQueryDialog";
import { AiExpertProDialog } from "@/components/AiExpertProDialog";
import { PartRequestDialog } from "@/components/PartRequestDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { PART_TYPE_VALUES, PART_TYPE_META, type PartType } from "@/lib/part-type";
import {
  applyFuzzySearch,
  escapeIlike,
  hasTextSearchCriteria,
  type SearchCriteria,
} from "@/lib/search";
import { normalizeOem } from "@/lib/oem";

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
  const [partType, setPartType] = useState<PartType | "">("");

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchNonce, setSearchNonce] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [stockMapOpen, setStockMapOpen] = useState(false);
  const [oemQueryOpen, setOemQueryOpen] = useState(false);
  const [aiProOpen, setAiProOpen] = useState(false);
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

  const activeFilterCount = useMemo(
    () => [brand, model, year, oem, minPrice, maxPrice].filter((v) => v.trim() !== "").length,
    [brand, model, year, oem, minPrice, maxPrice],
  );

  const searchCriteria = useMemo<SearchCriteria>(
    () => ({ q: q.trim(), brand: brand.trim(), model: model.trim(), oem: oem.trim() }),
    [q, brand, model, oem],
  );

  const hasActiveSearch = useMemo(
    () => hasTextSearchCriteria(searchCriteria) || activeFilterCount > 0 || q.trim().length > 0,
    [searchCriteria, activeFilterCount, q],
  );

  const runSearch = useCallback(async () => {
    const textActive = hasTextSearchCriteria(searchCriteria);
    const fetchLimit = textActive ? 200 : 80;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyStructuralFilters = (query: any) => {
      let qry = query;
      if (cat !== "Tümü") qry = qry.eq("category", cat);
      if (partType) qry = qry.eq("part_type", partType);
      if (year.trim()) qry = qry.eq("year", parseInt(year));
      if (minPrice) qry = qry.gte("price", parseFloat(minPrice));
      if (maxPrice) qry = qry.lte("price", parseFloat(maxPrice));
      return qry;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyTextFilters = (query: any) => {
      let qry = applyStructuralFilters(query);
      if (brand.trim()) {
        const b = escapeIlike(brand.trim());
        qry = qry.ilike("brand", `%${b}%`);
      }
      if (model.trim()) {
        const m = escapeIlike(model.trim());
        qry = qry.ilike("model", `%${m}%`);
      }
      if (oem.trim()) {
        const o = escapeIlike(normalizeOem(oem.trim()));
        qry = qry.or(`oem_code.ilike.%${o}%,oem_codes.cs.{${o}}`);
      }
      if (searchCriteria.q) {
        const s = escapeIlike(searchCriteria.q.replace(/,/g, " "));
        const oNorm = escapeIlike(normalizeOem(searchCriteria.q));
        qry = qry.or(
          `title.ilike.%${s}%,brand.ilike.%${s}%,model.ilike.%${s}%,oem_code.ilike.%${s}%,engine_code.ilike.%${s}%,description.ilike.%${s}%,oem_codes.cs.{${oNorm}}`,
        );
      }
      return qry;
    };

    const { data } = await applyTextFilters(
      supabase
        .from("parts")
        .select(
          "id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,oem_codes,seller_id,part_type,description,engine_code",
        )
        .order("created_at", { ascending: false })
        .limit(fetchLimit),
    );
    let rows = (data ?? []) as (Part & { seller_id: string; oem_codes?: string[] | null; description?: string | null })[];

    if (textActive) {
      rows = applyFuzzySearch(rows, searchCriteria);
    }

    if (textActive && rows.length === 0) {
      const fallback = await applyStructuralFilters(
        supabase
          .from("parts")
          .select(
            "id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,oem_codes,seller_id,part_type,description,engine_code",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      );
      rows = applyFuzzySearch(
        (fallback.data ?? []) as (Part & { seller_id: string; oem_codes?: string[] | null; description?: string | null })[],
        searchCriteria,
      );
    }

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

    setParts(rows.map((r) => ({ ...r, seller_verified: verifiedSet.has(r.seller_id) })).slice(0, 80));
    setLoading(false);

    const hasQuery = searchCriteria.q && searchCriteria.q.length >= 2;
    const hasOem = searchCriteria.oem && searchCriteria.oem.length >= 2;
    const hasFilter = !!(brand.trim() || model.trim() || year.trim());
    if (hasQuery) {
      trackEvent("search", { query: searchCriteria.q, category: cat, results: rows.length });
    }
    if (hasOem) {
      const oemUp = normalizeOem(searchCriteria.oem!);
      trackEvent("oem_search", { oem: oemUp, results: rows.length });
      supabase.from("oem_searches").insert({
        oem: oemUp,
        user_id: user?.id ?? null,
        results_count: rows.length,
      }).then(() => { /* fire and forget */ });
    }
    if (hasQuery || hasOem || hasFilter) {
      supabase.from("search_logs").insert({
        query: hasQuery ? searchCriteria.q : null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        category: cat !== "Tümü" ? cat : null,
        oem: hasOem ? normalizeOem(searchCriteria.oem!) : null,
        part_type: partType || null,
        results_count: rows.length,
        user_id: user?.id ?? null,
      }).then(() => { /* fire and forget */ });
    }
  }, [searchCriteria, cat, partType, brand, model, year, oem, minPrice, maxPrice, user?.id]);

  useEffect(() => {
    setLoading(true);
    const delay = searchNonce > 0 ? 0 : 600;
    const t = setTimeout(() => { void runSearch(); }, delay);
    return () => clearTimeout(t);
  }, [runSearch, searchNonce, q, cat, brand, model, year, oem, minPrice, maxPrice, partType]);

  const triggerSearch = () => setSearchNonce((n) => n + 1);

  const clearFilters = () => {
    setBrand(""); setModel(""); setYear(""); setOem(""); setMinPrice(""); setMaxPrice("");
  };

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />

      {/* HERO SEARCH */}
      <section className="bg-gradient-to-b from-gold/10 via-background to-background border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-6 pb-5 space-y-4">
          <div className="text-center space-y-1.5">
            <h1 className="font-display text-2xl sm:text-3xl tracking-wide">Aradığın parça bir tıkla</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Parça adı, OEM kodu, marka, model veya yıla göre ara.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-6 text-gold pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") triggerSearch(); }}
                placeholder="Örn. far, fren balatası, OEM A2118200561..."
                className="pl-12 pr-12 h-16 sm:h-[4.5rem] text-base sm:text-lg bg-card border-2 border-gold/60 focus-visible:border-gold rounded-2xl animate-search-glow"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full hover:bg-gold/15 grid place-items-center tap-gold"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button
              type="button"
              onClick={triggerSearch}
              disabled={loading}
              className="h-16 sm:h-[4.5rem] px-5 sm:px-8 bg-gold-gradient text-gold-foreground font-bold text-base sm:text-lg rounded-2xl shadow-gold shrink-0"
            >
              {loading ? "..." : "Ara"}
            </Button>
          </div>

          <button
            onClick={() => setAiProOpen(true)}
            className="tap-gold w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-gold-gradient text-gold-foreground font-semibold text-sm shadow-gold"
          >
            <Sparkles className="size-4" />
            AI Parça Uzmanı 2.0 — OEM veya Fotoğraf
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStockMapOpen(true)}
              className="tap-gold w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-card border border-gold/40 text-gold font-semibold text-xs hover:bg-gold/10"
            >
              <MapIcon className="size-4" />
              🗺️ Stok Haritası
            </button>
            <button
              onClick={() => setOemQueryOpen(true)}
              className="tap-gold w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-card border border-gold/40 text-gold font-semibold text-xs hover:bg-gold/10"
            >
              <ScanSearch className="size-4" />
              🔎 OEM Sorgula
            </button>
          </div>



          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:-mx-5 sm:px-5 pb-1 scrollbar-none">
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

          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:-mx-5 sm:px-5 pb-1 scrollbar-none">
            <button
              onClick={() => setPartType("")}
              className={`tap-gold shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                partType === "" ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold" : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >Tüm Tipler</button>
            {PART_TYPE_VALUES.map((v) => {
              const m = PART_TYPE_META[v];
              const active = partType === v;
              return (
                <button
                  key={v}
                  onClick={() => setPartType(active ? "" : v)}
                  className={`tap-gold shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                    active ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold" : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
                  }`}
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>



          {showFilters && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">Gelişmiş Filtreler</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground">Temizle</button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
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
      <section className="max-w-5xl mx-auto px-3 sm:px-5 pt-5">
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
      <section className="max-w-5xl mx-auto px-3 sm:px-5 pt-4">
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

      <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-5">

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <div className="text-center py-10 px-4 space-y-5 bg-card border border-border rounded-2xl">
            <div className="size-16 rounded-full bg-gold/10 grid place-items-center mx-auto">
              <PackageSearch className="size-8 text-gold" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <p className="font-display text-xl text-gold">Aradığınız parça bulunamadı</p>
              {hasActiveSearch && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  {[q, brand, model, oem].filter((x) => x.trim()).join(" · ") || "Seçili filtreler"}
                </p>
              )}
              <p className="text-sm text-foreground leading-relaxed">
                Aradığınız ürün şu anda stoklarımızda bulunmuyor veya henüz sisteme yüklenmemiş olabilir.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Talep oluşturmanız halinde binlerce satıcıya ve tedarikçiye ulaşabilir,
                ürünün stoklarda olup olmadığını sizin için araştırabiliriz.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-stretch sm:items-center max-w-md mx-auto">
              <Button
                onClick={() => setRequestOpen(true)}
                className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold flex-1 h-12 text-base"
              >
                🚀 Parça Talebi Oluştur
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!phoneDigits) { toast.error("WhatsApp hattı henüz tanımlanmadı."); return; }
                  const term = [q, brand, model, oem].filter((x) => x && x.trim()).join(" ").trim();
                  const text = term
                    ? `Merhaba, "${term}" parçasını arıyorum. Stoklarınızda var mı?`
                    : "Merhaba, bir parça arıyorum.";
                  trackEvent("click_whatsapp", { from: "empty_state", term });
                  window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                }}
                className="flex-1 gap-2"
              >
                <MessageCircle className="size-4" /> WhatsApp ile Sor
              </Button>
              <Button
                variant="outline"
                onClick={() => setOemQueryOpen(true)}
                className="flex-1 gap-2"
              >
                <ScanSearch className="size-4" /> OEM Sorgula
              </Button>
            </div>
            {(q.trim() || oem.trim() || brand.trim() || model.trim()) && (
              <div className="pt-1">
                <CreateAlertButton
                  userId={user?.id ?? null}
                  initial={{ keyword: q.trim(), brand: brand.trim(), model: model.trim(), oem: oem.trim().toUpperCase(), category: cat === "Tümü" ? "" : cat }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-xs text-muted-foreground">{parts.length} sonuç</p>
              {(q.trim() || oem.trim() || brand.trim() || model.trim()) && (
                <CreateAlertButton
                  userId={user?.id ?? null}
                  initial={{ keyword: q.trim(), brand: brand.trim(), model: model.trim(), oem: oem.trim().toUpperCase(), category: cat === "Tümü" ? "" : cat }}
                />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
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
      <StockMapDialog open={stockMapOpen} onOpenChange={setStockMapOpen} />
      <OemQueryDialog open={oemQueryOpen} onOpenChange={setOemQueryOpen} />
      <AiExpertProDialog
        open={aiProOpen}
        onOpenChange={setAiProOpen}
        onCreateRequest={(init) => {
          setQ(init.search_query);
          setBrand(init.brand);
          setModel(init.model);
          setYear(init.year);
          setOem(init.oem);
          if (init.category) setCat(init.category);
          setRequestOpen(true);
        }}
      />
    </div>
  );
}

function CreateAlertButton({
  userId,
  initial,
}: {
  userId: string | null;
  initial: { keyword: string; brand: string; model: string; oem: string; category: string };
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async () => {
    if (!userId) {
      toast.error("Alarm kurmak için giriş yapın.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("part_alerts").insert({
      user_id: userId,
      keyword: initial.keyword || null,
      brand: initial.brand || null,
      model: initial.model || null,
      oem_code: initial.oem || null,
      category: initial.category || null,
      is_active: true,
    });
    setBusy(false);
    if (error) { toast.error(translateError(error)); return; }
    setDone(true);
    toast.success("Parça alarmı oluşturuldu. Eşleşen ilan eklendiğinde bildirim alacaksınız.");
  };

  if (done) {
    return (
      <Link to="/alerts" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gold hover:underline">
        <BellPlus className="size-3.5" /> Alarmı görüntüle
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="tap-gold inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-card border-2 border-gold/60 text-gold font-semibold text-xs hover:bg-gold/10 disabled:opacity-60"
    >
      <BellPlus className="size-3.5" />
      {busy ? "Kaydediliyor..." : "Parça Gelince Haber Ver"}
    </button>
  );
}


