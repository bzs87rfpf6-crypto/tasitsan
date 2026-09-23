import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, SlidersHorizontal, X, PackageSearch, Phone, MessageCircle, BellPlus, ScanSearch, LayoutGrid, Rows, Clock, TrendingUp, Hash, Rocket, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { homePublicRpc } from "@/lib/home-public-rpc";
import { primePlatformStats } from "@/lib/platform-stats";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { AdminQuickAccess } from "@/components/AdminQuickAccess";
import { PartCard, type Part } from "@/components/PartCard";
import { useExternalOemPart } from "@/lib/use-external-oem-part";
import { useCatalogOemParts } from "@/lib/use-catalog-oem-parts";
import { StockMapDialog } from "@/components/StockMapDialog";
import { OemQueryDialog } from "@/components/OemQueryDialog";
import { AiExpertProDialog } from "@/components/AiExpertProDialog";
import { PartRequestDialog } from "@/components/PartRequestDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { PART_TYPE_META, type PartType } from "@/lib/part-type";
import { normalize as normSearch } from "@/lib/search";

import { NewProductsShowcase, type ShowcasePart } from "@/components/home/NewProductsShowcase";
import { DealBadge } from "@/components/home/DealBadge";
import { SeoInterlinks } from "@/components/home/SeoInterlinks";
import { PriceAdvantageBanner } from "@/components/home/PriceAdvantageBanner";
import { TrustStrip } from "@/components/home/TrustStrip";
import { HomeLiveStats } from "@/components/home/HomeLiveStats";

import { LiveActivityFeed } from "@/components/home/LiveActivityFeed";

import { TopDemandSection } from "@/components/home/TopDemandSection";
import { BrandMarquee } from "@/components/home/BrandMarquee";
import { getSeenPartIds, rememberSeenPartIds } from "@/lib/home-feed-seen";

import { VehicleClassTabs } from "@/components/VehicleClassTabs";
import type { VehicleClass } from "@/lib/vehicle-class";
import { CONSTRUCTION_CATEGORIES } from "@/lib/construction";
import { HEAVY_VEHICLE_CATEGORIES, HEAVY_VEHICLE_SEARCH_PLACEHOLDER } from "@/lib/heavy-vehicle";
import { useVehicleSuggest } from "@/lib/use-vehicle-suggest";



export const Route = createFileRoute("/")({
  loader: async () => {
    // Public SSR verisi — service-role gerektirmez (getServerReadClient).
    const [seo, bootstrap] = await Promise.all([
      (async () => {
        try {
          const { getHomeSeoBlocks } = await import("@/lib/seo-blocks.functions");
          return await getHomeSeoBlocks();
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const { getHomeBootstrap } = await import("@/lib/home-public.functions");
          const res = await getHomeBootstrap({ data: { vehicleClass: "automobile", limit: 24 } });
          return res?.json ? (JSON.parse(res.json) as HomeBootstrap) : null;
        } catch {
          return null;
        }
      })(),
    ]);
    return { seo, bootstrap };
  },
  head: () => ({
    meta: [
      { title: "Taşıtsan Parça Borsası | Türkiye'nin Yedek Parça Pazaryeri" },
      { name: "description", content: "Sıfır ve çıkma otomobil, ticari araç ve ağır vasıta yedek parçalarını güvenle bulun. OEM numarası ile arayın, stoktaki parçaları karşılaştırın." },
      { property: "og:title", content: "Taşıtsan Parça Borsası | Türkiye'nin Yedek Parça Pazaryeri" },
      { property: "og:description", content: "Sıfır ve çıkma otomobil, ticari araç ve ağır vasıta yedek parçalarını güvenle bulun. OEM numarası ile arayın, stoktaki parçaları karşılaştırın." },
      { property: "og:url", content: "https://www.tasitsan.com.tr" },
      { name: "twitter:title", content: "Taşıtsan Parça Borsası | Türkiye'nin Yedek Parça Pazaryeri" },
      { name: "twitter:description", content: "Sıfır ve çıkma otomobil, ticari araç ve ağır vasıta yedek parçalarını güvenle bulun. OEM numarası ile arayın, stoktaki parçaları karşılaştırın." },
    ],
    links: [{ rel: "canonical", href: "https://www.tasitsan.com.tr" }],
  }),

  component: Index,
});

const AUTO_CATEGORIES = [
  "Tümü", "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];
const CONSTRUCTION_TOP_CATEGORIES = ["Tümü", ...CONSTRUCTION_CATEGORIES.map((n) => n.label)];
const HEAVY_VEHICLE_TOP_CATEGORIES = ["Tümü", ...HEAVY_VEHICLE_CATEGORIES];

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 60;
// Ana sayfa vitrini ilk yüklemede 24 farklı ürün getirir.
const HOME_PAGE_SIZE = 24;
type HomeBootstrap = {
  vehicleClass: string;
  stats: Record<string, unknown> | null;
  feed: { items?: ShowcasePart[]; total?: number } | null;
};

type SearchPage = { rows: (Part & { seller_id: string })[]; hasMore: boolean; elapsedMs: string };

function Index() {
  const loaderData = Route.useLoaderData();
  const seoBlocks = loaderData?.seo ?? null;
  const bootstrap = loaderData?.bootstrap ?? null;
  const { user } = useAuth();
  const [vc, setVc] = useState<VehicleClass>(() => {
    if (typeof window === "undefined") return "automobile";
    const saved = localStorage.getItem("ts:vc");
    if (saved === "construction" || saved === "heavy_vehicle" || saved === "automobile") {
      return saved as VehicleClass;
    }
    return "automobile";
  });
  const CATEGORIES =
    vc === "construction"
      ? CONSTRUCTION_TOP_CATEGORIES
      : vc === "heavy_vehicle"
      ? HEAVY_VEHICLE_TOP_CATEGORIES
      : AUTO_CATEGORIES;
  const searchPlaceholder =
    vc === "heavy_vehicle"
      ? HEAVY_VEHICLE_SEARCH_PLACEHOLDER
      : "Örn. far, fren balatası, OEM A2118200561...";
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
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
  // Per-page-load seed → her sayfa yenilemesinde farklı karışım, ama aynı oturumda pagination tutarlı.
  const [feedSeed] = useState<string>(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [stockMapOpen, setStockMapOpen] = useState(false);
  const [oemQueryOpen, setOemQueryOpen] = useState(false);
  const [aiProOpen, setAiProOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("ts:view") as "grid" | "list") || "grid";
  });
  // SSR loader'ından gelen public veri — ilk boyamada boş/0 görünmesini engeller.
  const ssrFeed = bootstrap?.vehicleClass === vc ? bootstrap?.feed : null;
  const [showcase, setShowcase] = useState<{ items: ShowcasePart[]; total: number }>(() => ({
    items: (ssrFeed?.items ?? []) as ShowcasePart[],
    total: Number(ssrFeed?.total ?? 0),
  }));
  const [showcaseLoading, setShowcaseLoading] = useState(() => (ssrFeed?.items?.length ?? 0) === 0);
  useState(() => primePlatformStats(bootstrap?.stats ?? null));
  const [showcaseMore, setShowcaseMore] = useState(false);
  const [showcasePage, setShowcasePage] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularOems, setPopularOems] = useState<string[]>([]);
  const [popularQueries, setPopularQueries] = useState<string[]>([]);


  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ts:view", view);
  }, [view]);

  // Persist vehicle class + reset all class-specific search/filter params on switch.
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ts:vc", vc);
    setCat("Tümü");
    setBrand("");
    setModel("");
    setYear("");
    setOem("");
    setQ("");
    setCommittedQ("");
    setPartType("");
    setMinPrice("");
    setMaxPrice("");
    setShowSuggest(false);
  }, [vc]);


  // Ana vitrin: tüm aktif/satılmamış/resimli ürünler, en yeniden eskiye, "Daha Fazla Göster" ile sayfalı.
  const SHOWCASE_PAGE = 24;

  const loadShowcase = useCallback(
    async (count: number, silent = false) => {
      if (!silent) setShowcaseLoading(true);
      const data = await homePublicRpc<any>("home_new_feed", {
        _vehicle_class: vc,
        _limit: Math.min(Math.max(count, SHOWCASE_PAGE), 60),
        _offset: 0,
      });
      let items: ShowcasePart[] = (data?.items ?? []) as ShowcasePart[];
      const total: number = Number(data?.total ?? 0);
      // 60'tan fazla yüklüyse kalanları sırayla tamamla.
      let offset = items.length;
      while (offset < Math.min(count, total)) {
        const more = await homePublicRpc<any>("home_new_feed", {
          _vehicle_class: vc,
          _limit: 60,
          _offset: offset,
        });
        const chunk: ShowcasePart[] = (more?.items ?? []) as ShowcasePart[];
        if (chunk.length === 0) break;
        items = [...items, ...chunk];
        offset = items.length;
      }
      setShowcase({ items, total });
      if (!silent) setShowcaseLoading(false);
    },
    [vc],
  );

  const loadMoreShowcase = useCallback(async () => {
    setShowcaseMore(true);
    const offset = showcase.items.length;
    const data = await homePublicRpc<any>("home_new_feed", {
      _vehicle_class: vc,
      _limit: SHOWCASE_PAGE,
      _offset: offset,
    });
    const chunk: ShowcasePart[] = (data?.items ?? []) as ShowcasePart[];
    setShowcase((prev) => {
      const seen = new Set(prev.items.map((p) => p.id));
      return {
        items: [...prev.items, ...chunk.filter((p) => !seen.has(p.id))],
        total: Number(data?.total ?? prev.total),
      };
    });
    setShowcasePage((p) => p + 1);
    setShowcaseMore(false);
  }, [vc, showcase.items.length]);

  useEffect(() => {
    setShowcasePage(0);
    void loadShowcase(SHOWCASE_PAGE);

    // Yeni ürün eklendikçe / onaylandıkça vitrin otomatik tazelensin (debounce'lu).
    let t: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`home-showcase-${vc}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parts" }, () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          void loadShowcase(SHOWCASE_PAGE * (showcasePageRef.current + 1), true);
        }, 3000);
      })
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(channel);
    };
  }, [vc, loadShowcase]);

  const showcasePageRef = useRef(0);
  useEffect(() => {
    showcasePageRef.current = showcasePage;
  }, [showcasePage]);







  // Auto-commit free-text query after a short pause (still allows Enter / button for instant search).
  useEffect(() => {
    const t = setTimeout(() => setCommittedQ(q), 450);
    return () => clearTimeout(t);
  }, [q]);

  const RECENT_KEY = "ts:recentSearches";
  const pushRecent = (term: string) => {
    const t = term.trim();
    if (!t || t.length < 2) return;
    try {
      const cur = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
      const next = [t, ...cur.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch { /* ignore */ }
  };
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Gerçek arama niyeti (Ara / Enter / öneri tıklaması) — analytics kaydı yalnız bu durumda yapılır.
  const searchIntentRef = useRef(false);
  const submitSearch = () => {
    searchIntentRef.current = true;
    setCommittedQ(q);
    pushRecent(q);
    setShowSuggest(false);
  };
  const pickSuggestion = (s: string) => {
    searchIntentRef.current = true;
    setQ(s);
    setCommittedQ(s);
    pushRecent(s);
    setShowSuggest(false);
  };

  // Yarım / hatalı yazılan marka-model için "Bunu mu arıyorsunuz?" önerisi.
  const { correction: vehicleCorrection } = useVehicleSuggest(q, !oem.trim());


  useEffect(() => {
    getPublicSiteSettings()
      .then((data) => setContactPhone((data.contact_phone as string) ?? ""))
      .catch(() => setContactPhone(""));
  }, []);

  // If the user was bounced through /auth after clicking the "no-results" CTA,
  // rehydrate the search context from sessionStorage and auto-open the request
  // dialog on their return. Fires once per URL visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("request") !== "1") return;
    try {
      const raw = sessionStorage.getItem("ts:pendingRequest");
      if (raw) {
        const p = JSON.parse(raw) as Partial<{ q: string; brand: string; model: string; year: string; oem: string; category: string }>;
        if (p.q) setQ(p.q);
        if (p.brand) setBrand(p.brand);
        if (p.model) setModel(p.model);
        if (p.year) setYear(p.year);
        if (p.oem) setOem(p.oem);
        if (p.category) setCat(p.category);
      }
      sessionStorage.removeItem("ts:pendingRequest");
    } catch { /* ignore */ }
    if (user) {
      setRequestOpen(true);
      trackEvent("no_results_request_opened", { source: "post_auth_redirect" });
    }
    // strip the flag from the URL so a refresh doesn't re-trigger
    url.searchParams.delete("request");
    window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load recent searches from localStorage + popular from DB (once).
  useEffect(() => {
    try {
      const cur = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
      if (Array.isArray(cur)) setRecentSearches(cur.filter((x) => typeof x === "string"));
    } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      const [oemRes, qRes] = await Promise.all([
        supabase.from("oem_searches").select("oem").order("created_at", { ascending: false }).limit(200),
        supabase.from("search_logs").select("query").not("query", "is", null).order("created_at", { ascending: false }).limit(200),
      ]);
      if (cancelled) return;
      const countTop = (arr: (string | null | undefined)[], n: number) => {
        const m = new Map<string, number>();
        for (const v of arr) { if (!v) continue; const k = String(v).trim(); if (!k) continue; m.set(k, (m.get(k) ?? 0) + 1); }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
      };
      setPopularOems(countTop(((oemRes.data ?? []) as { oem: string }[]).map((r) => r.oem?.toUpperCase() ?? ""), 12));
      setPopularQueries(countTop(((qRes.data ?? []) as { query: string }[]).map((r) => r.query ?? ""), 8));
    })();
    return () => { cancelled = true; };
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

  // Harici tedarikçi OEM sonucu — normal ürün listesine tek liste olarak eklenir.
  const externalTerm = (oem.trim() || committedQ.trim());
  const { part: externalPart, loading: externalLoading } = useExternalOemPart(externalTerm);
  // Parça adı → OEM Kataloğu → OnlineParça (kullanıcı OEM bilmek zorunda değil).
  const { parts: catalogParts, loading: catalogLoading } = useCatalogOemParts(
    committedQ.trim(),
    !externalPart,
  );
  const displayParts = useMemo(() => {
    const extras = [
      ...(externalPart ? [externalPart as (Part & { seller_id: string })] : []),
      ...(catalogParts as (Part & { seller_id: string })[]),
    ];
    return extras.length ? [...extras, ...parts] : parts;
  }, [externalPart, catalogParts, parts]);


  const fetchPartsPage = async (offset: number): Promise<SearchPage> => {
    const qTerm = committedQ.trim();
    const hasQuery = qTerm.length >= 2;
    const hasOem = oem.trim().length >= 2;
    const hasFilter = !!(brand.trim() || model.trim() || year.trim() || partType || minPrice || maxPrice || cat !== "Tümü");
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    let rows: (Part & { seller_id: string })[] = [];
    const isHomeFeed = !(hasQuery || hasOem || hasFilter);
    const pageSize = isHomeFeed ? HOME_PAGE_SIZE : PAGE_SIZE;

    if (!isHomeFeed) {
      const { data, error } = await supabase.rpc("search_parts_ranked", {
        _q: hasQuery ? qTerm : "",
        _category: cat !== "Tümü" ? cat : undefined,
        _part_type: partType || undefined,
        _brand: brand.trim() || undefined,
        _model: model.trim() || undefined,
        _year: year.trim() ? parseInt(year) : undefined,
        _min_price: minPrice ? parseFloat(minPrice) : undefined,
        _max_price: maxPrice ? parseFloat(maxPrice) : undefined,
        _oem: hasOem ? oem.trim() : undefined,
        _limit: PAGE_SIZE + 1,
        _offset: offset,
        _vehicle_class: vc,
      } as any);
      if (error && typeof window !== "undefined") console.warn("[SEARCH] rpc error:", error.message);
      rows = (data ?? []) as (Part & { seller_id: string })[];
    } else {
      // Ana sayfa vitrini: yalnızca görselli ürünler, her sayfa yüklemesinde farklı seed ile
      // rastgele sıra (yeni ilanlara hafif öncelik) + son gösterilenler en sona atılır.
      const { data, error } = await (supabase as any).rpc("home_feed_random", {
        _vehicle_class: vc,
        _seed: feedSeed,
        _limit: HOME_PAGE_SIZE + 1,
        _offset: offset,
        _exclude: offset === 0 ? getSeenPartIds() : [],
      });
      if (error && typeof window !== "undefined") console.warn("[HOME_FEED] rpc error:", error.message);
      rows = (data ?? []) as (Part & { seller_id: string })[];
      rememberSeenPartIds(rows.slice(0, HOME_PAGE_SIZE).map((r) => r.id));
    }


    return {
      rows: rows.slice(0, pageSize),
      hasMore: rows.length > pageSize,
      elapsedMs: (typeof performance !== "undefined" ? performance.now() - t0 : 0).toFixed(0),
    };
  };

  const enrichParts = async (rows: (Part & { seller_id: string })[]) => {
    const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
    let verifiedSet = new Set<string>();
    let trustedSet = new Set<string>();
    if (sellerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,is_verified,trusted_seller")
        .in("id", sellerIds);
      for (const p of ((profs ?? []) as { id: string; is_verified: boolean; trusted_seller: boolean }[])) {
        if (p.is_verified) verifiedSet.add(p.id);
        if (p.trusted_seller) trustedSet.add(p.id);
      }
    }
    return rows.map((r) => ({
      ...r,
      seller_verified: verifiedSet.has(r.seller_id),
      seller_trusted: trustedSet.has(r.seller_id),
    }));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHasMore(false);
    const t = setTimeout(async () => {
      const qTerm = committedQ.trim();
      const hasQuery = qTerm.length >= 2;
      const hasOem = oem.trim().length >= 2;
      const hasFilter = !!(brand.trim() || model.trim() || year.trim() || partType || minPrice || maxPrice || cat !== "Tümü");
      const page = await fetchPartsPage(0);
      if (!active) return;
      const enriched = await enrichParts(page.rows);
      if (!active) return;

      if (typeof window !== "undefined" && (hasQuery || hasOem)) {
        console.log(`[SEARCH] "${qTerm}" → ilk ${enriched.length} sonuç yüklendi, devamı ${page.hasMore ? "var" : "yok"} (${page.elapsedMs}ms)`);
        console.log("[SEARCH] top:", enriched.slice(0, 10).map((r) => r.title));
      }

      setParts(enriched);
      setHasMore(page.hasMore);
      setLoading(false);

      // Analitik kirliliğini önle: yalnızca Ara/Enter veya öneri tıklaması ile
      // yapılan GERÇEK aramalar kaydedilir; yazarken oluşan ara sorgular kaydedilmez.
      const intentional = searchIntentRef.current;
      searchIntentRef.current = false;

      if (intentional && hasQuery) {
        trackEvent("search", { query: qTerm, category: cat, results: enriched.length });
      }
      if (intentional && hasOem) {
        const oemUp = oem.trim().toUpperCase();
        trackEvent("oem_search", { oem: oemUp, results: enriched.length });
        supabase.from("oem_searches").insert({
          oem: oemUp,
          user_id: user?.id ?? null,
          results_count: enriched.length,
        }).then(() => { /* fire and forget */ });
      }
      if (intentional && (hasQuery || hasOem || hasFilter)) {
        supabase.from("search_logs").insert({
          query: hasQuery ? qTerm : null,
          brand: brand.trim() || null,
          model: model.trim() || null,
          category: cat !== "Tümü" ? cat : null,
          oem: hasOem ? oem.trim().toUpperCase() : null,
          part_type: partType || null,
          results_count: enriched.length,
          user_id: user?.id ?? null,
        }).then(() => { /* fire and forget */ });
      }

    }, 100);
    return () => { active = false; clearTimeout(t); };
  }, [committedQ, cat, brand, model, year, oem, minPrice, maxPrice, partType, vc, user?.id]);

  const loadMoreParts = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const page = await fetchPartsPage(parts.length);
    const enriched = await enrichParts(page.rows);
    setParts((current) => [...current, ...enriched]);
    setHasMore(page.hasMore);
    setLoadingMore(false);
    if (typeof window !== "undefined") {
      console.log(`[SEARCH] +${enriched.length} sonuç daha yüklendi, toplam ${parts.length + enriched.length}`);
    }
  };

  const activeFilterCount = useMemo(() =>
    [brand, model, year, oem, minPrice, maxPrice].filter((v) => v.trim() !== "").length,
    [brand, model, year, oem, minPrice, maxPrice]);

  const clearFilters = () => {
    setBrand(""); setModel(""); setYear(""); setOem(""); setMinPrice(""); setMaxPrice("");
  };

  return (
    <div className="min-h-screen pb-44 sm:pb-32">
      <AppHeader />

      {/* Yalnızca admin rolüne görünür yönetim kısayolu */}
      <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-3 empty:hidden">
        <AdminQuickAccess compact />
      </div>



      {/* HERO SEARCH */}
      <section className="bg-gradient-to-b from-gold/10 sm:from-gold/15 via-background to-background border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-4 pb-5 sm:pt-8 sm:pb-7 space-y-4 sm:space-y-6">
          <div className="text-center space-y-2 sm:space-y-3.5">
            <h1 className="font-display text-xl sm:text-5xl font-bold tracking-wide leading-tight">
              Türkiye'nin Atıl Yedek Parça Borsası
            </h1>
            <p className="mx-auto max-w-2xl text-xs sm:text-lg font-medium text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-none">
              Binlerce sıfır ve kullanılmamış yedek parçayı uygun fiyatlarla bulun veya atıl stoklarınızı değerlendirin.
            </p>
            <div className="flex flex-row justify-center gap-2 sm:gap-3 pt-1 sm:pt-2">
              <button
                type="button"
                onClick={() => {
                  searchInputRef.current?.focus();
                  searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="tap-gold inline-flex items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2 sm:px-8 sm:py-4 text-sm sm:text-lg font-bold text-gold-foreground sm:shadow-gold"
              >
                🔍 Parça Ara
              </button>
              <Link
                to="/sell"
                search={{ oem: undefined, title: undefined, brand: undefined, model: undefined, category: undefined }}
                className="tap-gold inline-flex items-center justify-center gap-2 rounded-xl border border-gold/50 sm:border-2 sm:border-gold/60 bg-card px-4 py-2 sm:px-8 sm:py-4 text-sm sm:text-lg font-bold text-gold hover:bg-gold/10"
              >
                📦 Ücretsiz İlan Ver
              </Link>
            </div>
          </div>


          <VehicleClassTabs value={vc} onChange={setVc} />


          <form
            onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
            className="relative flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-6 text-gold pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={q}

                onChange={(e) => { setQ(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 180)}
                placeholder="OEM kodu, parça adı, marka veya araç modeli ara..."
                className="pl-12 pr-12 h-14 sm:h-[4.5rem] text-base sm:text-lg bg-card border-2 border-gold/60 focus-visible:border-gold rounded-2xl animate-search-glow"
                autoComplete="off"
                enterKeyHint="search"
              />
              {q && (
                <button type="button" onClick={() => { setQ(""); setCommittedQ(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full hover:bg-gold/15 grid place-items-center tap-gold">
                  <X className="size-4" />
                </button>
              )}
              {showSuggest && (() => {
                const trimmed = q.trim();
                // With query typed: show title matches from current parts list.
                if (trimmed.length >= 2) {
                  const n = normSearch(trimmed);
                  const sugg = Array.from(new Set(
                    parts
                      .map((p) => p.title)
                      .filter((t): t is string => !!t && normSearch(t).includes(n))
                  )).slice(0, 6);
                  if (sugg.length === 0 && !vehicleCorrection) return null;
                  return (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                      {vehicleCorrection && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(vehicleCorrection.label); }}
                          className="w-full text-left px-4 py-3 border-b border-border bg-gold/5 hover:bg-gold/10 text-sm"
                        >
                          Bunu mu arıyorsunuz? <span className="font-semibold text-gold">{vehicleCorrection.label}</span>
                        </button>
                      )}
                      {sugg.map((s) => (

                        <button
                          key={s}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gold/10 flex items-center gap-2 border-b border-border/40 last:border-0"
                        >
                          <Search className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{s}</span>
                        </button>
                      ))}
                    </div>
                  );
                }
                // Empty query: show recent + popular
                const hasAny = recentSearches.length > 0 || popularOems.length > 0 || popularQueries.length > 0;
                if (!hasAny) return null;
                return (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
                    {recentSearches.length > 0 && (
                      <div className="py-2">
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                          <Clock className="size-3" /> Son Aramalar
                        </div>
                        {recentSearches.slice(0, 5).map((s) => (
                          <button key={`r-${s}`} type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gold/10 flex items-center gap-2">
                            <Clock className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{s}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {popularOems.length > 0 && (
                      <div className="py-2 border-t border-border/50">
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                          <Hash className="size-3" /> Popüler OEM Kodları
                        </div>
                        <div className="px-3 py-1 flex flex-wrap gap-1.5">
                          {popularOems.slice(0, 10).map((o) => (
                            <button key={`o-${o}`} type="button"
                              onMouseDown={(e) => { e.preventDefault(); setOem(o); setShowSuggest(false); }}
                              className="px-2.5 py-1 rounded-full border border-gold/40 bg-card text-[11px] font-mono text-gold hover:bg-gold/10">
                              {o}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {popularQueries.length > 0 && (
                      <div className="py-2 border-t border-border/50">
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                          <TrendingUp className="size-3" /> Popüler Aramalar
                        </div>
                        {popularQueries.slice(0, 6).map((s) => (
                          <button key={`p-${s}`} type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gold/10 flex items-center gap-2">
                            <TrendingUp className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{s}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <button
              type="submit"
              aria-label="Ara"
              className="tap-gold shrink-0 h-14 sm:h-[4.5rem] px-4 sm:px-7 rounded-2xl bg-gold-gradient text-gold-foreground font-bold text-sm sm:text-base shadow-gold flex items-center gap-2"
            >
              <Search className="size-5" />
              <span>Ara</span>
            </button>
            <button
              type="button"
              aria-label="Parça Talep Et"
              onClick={() => setRequestOpen(true)}
              className="tap-gold shrink-0 h-14 sm:h-[4.5rem] px-3 sm:px-5 rounded-2xl bg-foreground text-gold border border-gold/60 font-bold text-sm sm:text-base flex items-center gap-2 hover:bg-foreground/90"
            >
              <PackageSearch className="size-5" />
              <span className="hidden sm:inline">Parça Talep Et</span>
            </button>
          </form>

          {/* Hızlı arama önerileri — mobilde tek satır yatay kaydırma */}
          <div className="flex flex-nowrap sm:flex-wrap sm:justify-center gap-1.5 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
            <span className="text-[11px] text-muted-foreground self-center mr-1 shrink-0">Popüler:</span>
            {["Toyota Hilux", "2KD", "OEM", "Tampon", "Far", "Şanzıman"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickSuggestion(s)}
                className="tap-gold shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-muted-foreground hover:border-gold/60 hover:text-gold"
              >
                {s}
              </button>
            ))}
          </div>



          {/* Sadeleştirilmiş filtre satırı: Tümü / Orijinal / Yan Sanayi / Çıkma */}
          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:-mx-5 sm:px-5 pb-1 scrollbar-none">
            <button
              onClick={() => setPartType("")}
              className={`tap-gold shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border ${
                partType === "" ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold" : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >Tümü</button>
            {(["original", "aftermarket", "used"] as PartType[]).map((v) => {
              const m = PART_TYPE_META[v];
              const active = partType === v;
              return (
                <button
                  key={v}
                  onClick={() => setPartType(active ? "" : v)}
                  className={`tap-gold shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 ${
                    active ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold" : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
                  }`}
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`tap-gold shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border flex items-center gap-1.5 ml-auto ${
                showFilters || activeFilterCount
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
              {activeFilterCount > 0 ? `Filtre (${activeFilterCount})` : "Filtre"}
            </button>
          </div>

          {showFilters && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">Gelişmiş Filtreler</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground">Temizle</button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`tap-gold shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
                      cat === c
                        ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                        : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
                    }`}
                  >{c}</button>
                ))}
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

      {/* Orijinal Markalarımız — kayan marka şeridi */}
      {!committedQ.trim() && !oem.trim() && !brand.trim() && !model.trim() && !year.trim() && !partType && !minPrice && !maxPrice && cat === "Tümü" && (
        <BrandMarquee />
      )}


      {/* Conversion-focused home sections — sadece varsayılan görünümde */}
      {!committedQ.trim() && !oem.trim() && !brand.trim() && !model.trim() && !year.trim() && !partType && !minPrice && !maxPrice && cat === "Tümü" && (
        <section className="max-w-5xl xl:max-w-7xl mx-auto px-3 sm:px-5 pt-3 sm:pt-5 flex flex-col gap-4 sm:gap-6">
          {/* Mobilde ürünler öne alınır; sm+ sıralaması değişmez. */}
          <div className="order-1 sm:order-none">
            <NewProductsShowcase
              items={showcase.items}
              total={showcase.total}
              loading={showcaseLoading}
              loadingMore={showcaseMore}
              onLoadMore={() => void loadMoreShowcase()}
            />
          </div>
          <div className="order-2 sm:order-none"><PriceAdvantageBanner /></div>
          <div className="order-3 sm:order-none"><HomeLiveStats /></div>
          <div className="order-4 sm:order-none"><LiveActivityFeed /></div>
          <div className="order-5 sm:order-none"><TrustStrip /></div>
          <div className="order-6 sm:order-none"><TopDemandSection /></div>
        </section>
      )}



      <div className="max-w-5xl xl:max-w-7xl mx-auto px-3 sm:px-5 pt-5">


        {(externalLoading || catalogLoading) && (
          <div
            className="my-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-6 text-center"
            aria-live="polite"
            role="status"
          >
            <Loader2 className="size-6 text-gold animate-spin" />
            <p className="max-w-md text-[15px] sm:text-lg font-medium text-foreground text-balance break-words">
              Lütfen bekleyin, tüm tedarikçi stokları kontrol ediliyor…
            </p>
            {displayParts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Taşıtsan sonuçları aşağıda; tedarikçi stokları geldikçe eklenecek.
              </p>
            )}
          </div>
        )}


        {loading || ((externalLoading || catalogLoading) && displayParts.length === 0) ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : displayParts.length === 0 ? (
          <NoResultsConversion
            q={q}
            brand={brand}
            model={model}
            year={year}
            oem={oem}
            category={cat === "Tümü" ? "" : cat}
            isAuthed={!!user}
            phoneDigits={phoneDigits}
            onOpenRequest={() => setRequestOpen(true)}
            onGoAuth={(payload) => {
              try {
                sessionStorage.setItem("ts:pendingRequest", JSON.stringify(payload));
              } catch { /* ignore */ }
              trackEvent("no_results_cta_click", { authed: false, ...payload });
              window.location.href = "/auth?redirect=" + encodeURIComponent("/?request=1");
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 border-b border-border/40 pb-2">
              <h2 className="font-display text-base sm:text-lg text-foreground font-semibold">
                {(() => {
                  const qTerm = committedQ.trim();
                  const label = qTerm || oem.trim() || (brand.trim() || model.trim() ? `${brand.trim()} ${model.trim()}`.trim() : "") || (cat !== "Tümü" ? cat : "");
                  const countStr = displayParts.length.toLocaleString("tr-TR");
                  if (label) {
                    return (
                      <>
                        <span className="text-gold">“{label}”</span> için{" "}
                        <span className="text-gold font-bold">{countStr}</span> ürün bulundu
                      </>
                    );
                  }
                  return (
                    <>
                      Toplam <span className="text-gold font-bold">{countStr}</span> ürün listeleniyor
                    </>
                  );
                })()}
              </h2>
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                {(q.trim() || oem.trim() || brand.trim() || model.trim()) && (
                  <CreateAlertButton
                    userId={user?.id ?? null}
                    initial={{ keyword: q.trim(), brand: brand.trim(), model: model.trim(), oem: oem.trim().toUpperCase(), category: cat === "Tümü" ? "" : cat }}
                  />
                )}
                <div className="hidden sm:flex items-center rounded-full border border-border bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    aria-label="Izgara görünümü"
                    aria-pressed={view === "grid"}
                    className={`size-8 grid place-items-center rounded-full transition ${
                      view === "grid" ? "bg-gold-gradient text-gold-foreground shadow-gold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    aria-label="Liste görünümü"
                    aria-pressed={view === "list"}
                    className={`size-8 grid place-items-center rounded-full transition ${
                      view === "list" ? "bg-gold-gradient text-gold-foreground shadow-gold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Rows className="size-4" />
                  </button>
                </div>
              </div>
            </div>
            {view === "list" ? (
              <div className="flex flex-col gap-2 sm:gap-2.5 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
                {displayParts.map((p) => (
                  <div key={p.id} className="relative">
                    <DealBadge />
                    <PartCard part={p} variant="list" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {displayParts.map((p) => (
                  <div key={p.id} className="relative">
                    <DealBadge />
                    <PartCard part={p} />
                  </div>
                ))}
              </div>
            )}
            {hasMore && (
              <div className="pt-2 flex justify-center">
                <Button
                  type="button"
                  onClick={loadMoreParts}
                  disabled={loadingMore}
                  className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold min-w-44"
                >
                  {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
                </Button>
              </div>
            )}
            <div className="pt-6 text-center text-xs text-muted-foreground border-t border-border mt-6">
              <p>Aradığınızı bulamadınız mı?</p>
              <button onClick={() => setRequestOpen(true)} className="text-gold font-semibold mt-1 hover:underline">
                Parça Talebi Oluştur →
              </button>
            </div>
          </div>
        )}

        {/* SEO internal linking — SSR rendered for crawler visibility */}
        <SeoInterlinks blocks={seoBlocks} />

      </div>


      {/* Sabit sağ-alt aksiyon kümesi — mobilde sadece + FAB, sm+ tam yığın */}
      <div className="fixed right-3 sm:right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-30 flex flex-col items-end gap-2 sm:gap-3 pointer-events-none">
        <button
          type="button"
          onClick={handleCall}
          aria-label="Bizi Ara"
          className="hidden sm:flex pointer-events-auto tap-gold items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-card border-2 border-gold/70 text-gold font-semibold text-sm shadow-gold"
        >
          <Phone className="size-5" strokeWidth={2.4} />
          <span>Bizi Ara</span>
        </button>
        <button
          type="button"
          onClick={handleWhatsapp}
          aria-label="WhatsApp"
          className="hidden sm:flex pointer-events-auto tap-gold items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-whatsapp text-white font-semibold text-sm shadow-gold"
        >
          <MessageCircle className="size-5" strokeWidth={2.4} />
          <span>WhatsApp</span>
        </button>
        <Link
          to="/sell"
          search={{ oem: undefined, title: undefined, brand: undefined, model: undefined, category: undefined }}
          className="pointer-events-auto tap-gold size-12 sm:size-14 rounded-full bg-gold-gradient text-gold-foreground grid place-items-center shadow-gold ring-2 ring-background"
          aria-label="İlan ver"
        >
          <Plus className="size-6 sm:size-7" strokeWidth={2.5} />
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



type NoResultsPayload = {
  q: string;
  brand: string;
  model: string;
  year: string;
  oem: string;
  category: string;
};

function NoResultsConversion({
  q, brand, model, year, oem, category,
  isAuthed, phoneDigits, onOpenRequest, onGoAuth,
}: NoResultsPayload & {
  isAuthed: boolean;
  phoneDigits: string;
  onOpenRequest: () => void;
  onGoAuth: (p: NoResultsPayload) => void;
}) {
  const payload: NoResultsPayload = { q, brand, model, year, oem, category };
  const hasAnyTerm = !!(q.trim() || brand.trim() || model.trim() || year.trim() || oem.trim() || category.trim());
  const term = [q, brand, model, oem].filter((x) => x && x.trim()).join(" ").trim();

  // Fire analytics once per unique search context.
  useEffect(() => {
    const key = JSON.stringify(payload);
    trackEvent("no_results_view", { key, ...payload });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, brand, model, year, oem, category]);

  const handleCta = () => {
    if (isAuthed) {
      trackEvent("no_results_cta_click", { authed: true, ...payload });
      trackEvent("no_results_request_opened", { source: "direct" });
      onOpenRequest();
    } else {
      onGoAuth(payload);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-background via-card to-background">
        {/* subtle gold radial */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_60%)]" />

        <div className="relative px-5 sm:px-8 py-8 sm:py-10 text-center space-y-6">
          <div className="mx-auto size-16 sm:size-20 rounded-full bg-gold/15 grid place-items-center ring-1 ring-gold/40">
            <PackageSearch className="size-8 sm:size-10 text-gold" />
          </div>

          <div className="space-y-3 max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl text-gold leading-tight">
              😕 ARADIĞINIZ PARÇA BULUNAMADI
            </h2>
            <p className="text-sm sm:text-base text-foreground leading-relaxed">
              Bu parça henüz sisteme yüklenmemiş olabilir veya farklı bir OEM kodu ya da farklı bir parça adıyla kayıtlı olabilir.
            </p>
            <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-left space-y-1.5">
              <p className="font-display text-lg sm:text-xl text-gold">🎉 Tamamen Ücretsiz!</p>
              <p className="text-sm sm:text-base text-foreground/90 leading-relaxed">
                Ücretsiz üye olun ve parça talebinizi oluşturun.
              </p>
              <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                Talebiniz bu parçayı satabilecek ilgili satıcılara iletilir. Satıcılardan teklif geldikçe sizi bilgilendiririz.
              </p>
            </div>
          </div>

          <ul className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {[
              "Tamamen ücretsiz üyelik",
              "Tamamen ücretsiz parça talebi oluşturma",
              "Talebiniz ilgili satıcılara iletilir",
              "Teklif geldiğinde bildirim alırsınız",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 rounded-lg bg-card/60 border border-border/60 px-3 py-2 text-xs sm:text-sm text-foreground">
                <CheckCircle2 className="size-4 text-gold flex-shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>

          <div className="pt-1 space-y-3">
            <Button
              onClick={handleCta}
              size="lg"
              className="w-full sm:w-auto sm:min-w-[340px] h-14 text-base sm:text-lg font-bold bg-gold-gradient text-gold-foreground shadow-gold gap-2 px-6"
            >
              <Rocket className="size-5" />
              {isAuthed ? "Parça Talebi Oluştur" : "🚀 Ücretsiz Üye Ol ve Talep Oluştur"}
              <Sparkles className="size-4 opacity-80" />
            </Button>
          </div>


          {/* Discreet secondary actions */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs">
            {phoneDigits && (
              <button
                type="button"
                onClick={() => {
                  const text = term
                    ? `Merhaba, "${term}" parçasını arıyorum. Stoklarınızda var mı?`
                    : "Merhaba, bir parça arıyorum.";
                  trackEvent("click_whatsapp", { from: "empty_state", term });
                  window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                }}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-gold"
              >
                <MessageCircle className="size-3.5" /> WhatsApp ile sor
              </button>
            )}
            {hasAnyTerm && (
              <CreateAlertButton
                userId={null}
                initial={{ keyword: q.trim(), brand: brand.trim(), model: model.trim(), oem: oem.trim().toUpperCase(), category }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
