import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, PackageSearch, Inbox, SlidersHorizontal, Flame, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PartCard, type Part } from "@/components/PartCard";
import { ExternalSupplierResults } from "@/components/ExternalSupplierResults";

import { recordDemandSignal } from "@/lib/demand";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildSearchTokens } from "@/lib/search-tokens";
import { useExternalOemPart } from "@/lib/use-external-oem-part";

import { useSmartOemPart } from "@/lib/use-smart-oem-part";
import { useCatalogOemParts } from "@/lib/use-catalog-oem-parts";
import { useVehicleSuggest } from "@/lib/use-vehicle-suggest";
import { useDidYouMean } from "@/lib/use-did-you-mean";
import { isOemLikeQuery, pickVehicleCorrection, shouldRewriteQuery, type VehicleSuggestion } from "@/lib/vehicle-match";



const PAGE_SIZE = 24;

const RECENT_KEY = "tsn:recent-searches";
const LAST_LOG_KEY = "tsn:last-search-log";

/**
 * URL arama parametreleri JSON olarak çözümlendiği için "5193124050" gibi
 * tamamen sayısal OEM sorguları number'a dönüşüp z.string() ile eleniyordu.
 * Bu yüzden sayısal OEM aramaları sessizce boşaltılıyordu → daima string'e çevir.
 */
const asText = (v: unknown) => (v == null ? "" : String(v));
const text = () => z.preprocess(asText, z.string());
const flag = <T extends readonly [string, ...string[]]>(vals: T) => z.preprocess(asText, z.enum(vals));

const searchSchema = z.object({
  q: fallback(text(), "").optional(),
  brand: fallback(text(), "").optional(),
  oem: fallback(text(), "").optional(),
  vc: fallback(flag(["", "automobile", "heavy_vehicle", "construction", "agriculture"] as const), "").optional(),
  city: fallback(text(), "").optional(),
  cond: fallback(flag(["", "new", "used", "refurbished"] as const), "").optional(),
  pmin: fallback(text(), "").optional(),
  pmax: fallback(text(), "").optional(),
  instock: fallback(flag(["", "1"] as const), "").optional(),
  photo: fallback(flag(["", "1"] as const), "").optional(),
  dsame: fallback(flag(["", "1"] as const), "").optional(),
  dbus: fallback(flag(["", "1"] as const), "").optional(),
  dhand: fallback(flag(["", "1"] as const), "").optional(),
  urgent: fallback(flag(["", "1"] as const), "").optional(),
  verified: fallback(flag(["", "1"] as const), "").optional(),
  sold: fallback(flag(["", "1", "0"] as const), "").optional(),
  page: fallback(z.coerce.number().int().min(1), 1).optional(),
});


export const Route = createFileRoute("/parts/")({
  validateSearch: zodValidator(searchSchema),
  // Filtre/sayfalama kombinasyonları dizine girmez; canonical daima temiz /parts.
  loaderDeps: ({ search }) => ({
    filtered:
      Object.entries(search).some(([k, v]) =>
        k === "page" ? Number(v) > 1 : typeof v === "string" && v.trim() !== "",
      ),
  }),
  loader: ({ deps }) => ({ filtered: deps.filtered }),
  head: ({ loaderData }) => {
    const url = "https://www.tasitsan.com.tr/parts";
    const title = "Yedek Parça İlanları — Akıllı OEM Arama | Taşıtsan";
    const description =
      "Türkiye'nin en hızlı OEM yedek parça arama motoru. OEM kodu, marka, model, motor kodu veya kategori ile arayın; görselli ve stoktaki ilanlar üstte.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        {
          name: "robots",
          content: loaderData?.filtered
            ? "noindex,follow"
            : "index,follow,max-image-preview:large,max-snippet:-1",
        },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PartsHubPage,
});

type Suggestion = { kind: string; label: string; hint: string };
type PopularQuery = { query: string; search_count: number };

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string").slice(0, 8) : [];
  } catch { return []; }
}

function pushRecent(term: string) {
  if (typeof window === "undefined" || !term.trim()) return;
  const cur = readRecent().filter((s) => s.toLowerCase() !== term.toLowerCase());
  cur.unshift(term);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8))); } catch {}
}

function PartsHubPage() {
  // Boş filtreler URL'ye yazılmaz: /parts kanonik olarak yönlendirmesiz kalır.
  const sp = Route.useSearch();
  const q = sp.q ?? "";
  const brand = sp.brand ?? "";
  const oem = sp.oem ?? "";
  const vc = sp.vc ?? "";
  const city = sp.city ?? "";
  const cond = sp.cond ?? "";
  const pmin = sp.pmin ?? "";
  const pmax = sp.pmax ?? "";
  const instock = sp.instock ?? "";
  const photo = sp.photo ?? "";
  const dsame = sp.dsame ?? "";
  const dbus = sp.dbus ?? "";
  const dhand = sp.dhand ?? "";
  const urgent = sp.urgent ?? "";
  const verified = sp.verified ?? "";
  const sold = sp.sold ?? "";
  const page = sp.page ?? 1;
  const navigate = useNavigate({ from: "/parts/" });

  const [qInput, setQInput] = useState(q);
  const [brandInput, setBrandInput] = useState(brand);
  const [oemInput, setOemInput] = useState(oem);
  const [cityInput, setCityInput] = useState(city);
  const [pminInput, setPminInput] = useState(pmin);
  const [pmaxInput, setPmaxInput] = useState(pmax);
  const [condInput, setCondInput] = useState<typeof cond>(cond);
  const [instockInput, setInstockInput] = useState(instock === "1");
  const [photoInput, setPhotoInput] = useState(photo === "1");
  const [dsameInput, setDsameInput] = useState(dsame === "1");
  const [dbusInput, setDbusInput] = useState(dbus === "1");
  const [dhandInput, setDhandInput] = useState(dhand === "1");
  const [urgentInput, setUrgentInput] = useState(urgent === "1");
  const [verifiedInput, setVerifiedInput] = useState(verified === "1");

  useEffect(() => setQInput(q), [q]);
  useEffect(() => setBrandInput(brand), [brand]);
  useEffect(() => setOemInput(oem), [oem]);
  useEffect(() => setCityInput(city), [city]);
  useEffect(() => setPminInput(pmin), [pmin]);
  useEffect(() => setPmaxInput(pmax), [pmax]);
  useEffect(() => setCondInput(cond), [cond]);
  useEffect(() => setInstockInput(instock === "1"), [instock]);
  useEffect(() => setPhotoInput(photo === "1"), [photo]);
  useEffect(() => setDsameInput(dsame === "1"), [dsame]);
  useEffect(() => setDbusInput(dbus === "1"), [dbus]);
  useEffect(() => setDhandInput(dhand === "1"), [dhand]);
  useEffect(() => setUrgentInput(urgent === "1"), [urgent]);
  useEffect(() => setVerifiedInput(verified === "1"), [verified]);

  const [parts, setParts] = useState<Part[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [soldMap, setSoldMap] = useState<Record<string, boolean>>({});
  const [alternatives, setAlternatives] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<PopularQuery[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedCorrection, setAppliedCorrection] = useState<string | null>(null);
  const took = useRef<number>(0);

  // Yarım/hatalı marka-model yazımı için canlı öneri ("Bunu mu arıyorsunuz?").
  const { correction: liveCorrection } = useVehicleSuggest(qInput, !oemInput.trim());


  const externalSearchTerm = (oem || q).trim();
  const {
    part: externalPart,
    loading: externalLoading,
    normalizedOem: normalizedExternalOem,
    enabled: shouldSearchExternal,
  } = useExternalOemPart(externalSearchTerm);
  const externalResultCount = externalPart ? 1 : 0;

  // Parça adı → OEM Kataloğu → OnlineParça (kullanıcı OEM bilmek zorunda değil).
  const { parts: catalogParts, loading: catalogLoading } = useCatalogOemParts(
    q.trim(),
    !externalPart,
  );

  // AKILLI OEM FALLBACK — yalnızca Taşıtsan'da ve OEM aramasında sonuç yoksa.
  const smartTerm = q.trim();
  const { part: smartPart, loading: smartLoading } = useSmartOemPart(
    smartTerm,
    !loading && !externalLoading && !catalogLoading && catalogParts.length === 0 && parts.length === 0 && !externalPart && !shouldSearchExternal,
  );



  useEffect(() => { setRecent(readRecent()); }, [q, oem]);

  // Popüler aramalar (cache)
  useEffect(() => {
    let alive = true;
    supabase.rpc("top_search_queries", { _range: "7d", _limit: 8 }).then(({ data }) => {
      if (!alive) return;
      setPopular(((data ?? []) as PopularQuery[]).filter((r) => r.query && r.query !== "(boş)"));
    });
    return () => { alive = false; };
  }, []);

  // Autocomplete
  useEffect(() => {
    const term = qInput.trim();
    if (term.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_suggest", { _q: term, _limit: 8 });
      setSuggestions((data ?? []) as Suggestion[]);
    }, 180);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const started = performance.now();
    (async () => {
      const term = (q || oem || "").trim();

      const baseFilters = {
        _brand: brand.trim() || null,
        _city: city.trim() || null,
        _min_price: pmin ? Number(pmin) : null,
        _max_price: pmax ? Number(pmax) : null,
        _condition: cond || null,
        _in_stock: instock === "1" ? true : null,
        _with_photo: photo === "1" ? true : null,
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      } as Record<string, unknown>;

      // Direct query when any advanced filter is set (RPC does not support them)
      const useDirect = !!vc || dsame === "1" || dbus === "1" || dhand === "1" || urgent === "1" || verified === "1";
      if (useDirect) {
        const selectCols =
          "id,seo_slug,title,brand,model,year,price,city,photos,condition,part_type,stock_quantity,oem_code,oem_codes,created_at,has_photos,delivery_options,urgent_delivery,is_sold" +
          (verified === "1" ? ",seller:profiles!inner(is_verified)" : "");
        let qb = supabase
          .from("parts")
          .select(selectCols, { count: "exact" })
          .eq("status", "approved");
        if (vc) qb = qb.eq("vehicle_class" as any, vc);
        if (term) qb = qb.or(`title.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%,oem_code.ilike.%${term}%`);
        if (brand.trim()) qb = qb.ilike("brand", `%${brand.trim()}%`);
        if (city.trim()) qb = qb.ilike("city", `%${city.trim()}%`);
        if (cond) qb = qb.eq("condition", cond);
        if (pmin) qb = qb.gte("price", Number(pmin));
        if (pmax) qb = qb.lte("price", Number(pmax));
        if (instock === "1") qb = qb.gt("stock_quantity", 0);
        if (photo === "1") qb = qb.eq("has_photos" as any, true);
        if (urgent === "1") qb = qb.eq("urgent_delivery" as any, true);
        const deliveryFilters: string[] = [];
        if (dsame === "1") deliveryFilters.push("same_day");
        if (dbus === "1") deliveryFilters.push("bus");
        if (dhand === "1") deliveryFilters.push("hand");
        if (deliveryFilters.length) qb = qb.overlaps("delivery_options" as any, deliveryFilters);
        if (verified === "1") qb = qb.eq("seller.is_verified" as any, true);
        const from = (page - 1) * PAGE_SIZE;
        qb = qb.order("has_photos" as any, { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
        const { data, error, count } = await qb;
        if (cancelled) return;
        took.current = Math.round(performance.now() - started);
        if (error) { console.error("[parts-hub] direct query failed:", error); setParts([]); setTotalCount(0); setAlternatives([]); setLoading(false); return; }
        setParts((data ?? []) as unknown as Part[]);
        setTotalCount(count ?? data?.length ?? 0);
        setAlternatives([]);
        setLoading(false);
        return;
      }

      // Yeni arama motoru: token bazlı AND + yazım hatası toleransı + OEM ürün ailesi.
      // Hata durumunda eski motora (search_parts_smart) düşer.
      const tokens = term ? buildSearchTokens(term) : [];
      let data: unknown = null;
      let error: { message?: string } | null = null;
      const famRes = await supabase.rpc(
        "search_parts_family" as never,
        { _tokens: tokens, _q: term || null, ...baseFilters } as never,
      );
      if (famRes.error) {
        console.error("[parts-hub] family rpc failed, falling back:", famRes.error);
        const legacy = await supabase.rpc("search_parts_smart", { _q: term || undefined, ...baseFilters });
        data = legacy.data;
        error = legacy.error;
      } else {
        data = famRes.data;
      }
      if (cancelled) return;
      took.current = Math.round(performance.now() - started);
      if (error) {
        console.error("[parts-hub] rpc failed:", error);
        setParts([]); setTotalCount(0); setAlternatives([]); setLoading(false); return;
      }


      let rows = (data ?? []) as (Part & { total_count?: number })[];

      // Yarım/hatalı araç yazımı: sonuç yoksa yüksek güvenli marka-model düzeltmesiyle tekrar dene.
      // OEM sorguları bu katmana hiç girmez.
      if (rows.length === 0 && term && !oem.trim() && !isOemLikeQuery(term)) {
        const { data: vs } = await supabase.rpc("vehicle_suggest" as never, { _q: term, _limit: 5 } as never);
        const best = pickVehicleCorrection(term, (vs ?? []) as unknown as VehicleSuggestion[]);
        if (shouldRewriteQuery(term, best) && best) {
          const retry = await supabase.rpc(
            "search_parts_family" as never,
            { _tokens: buildSearchTokens(best.label), _q: best.label, ...baseFilters } as never,
          );
          if (cancelled) return;
          if (!retry.error && ((retry.data ?? []) as unknown[]).length > 0) {
            rows = (retry.data ?? []) as (Part & { total_count?: number })[];
            setAppliedCorrection(best.label);
          } else {
            setAppliedCorrection(null);
          }
        } else {
          setAppliedCorrection(null);
        }
      } else {
        setAppliedCorrection(null);
      }

      const merged: Part[] = rows as Part[];


      // OEM cross-reference expansion
      if (oem.trim()) {
        const normalized = oem.trim().toUpperCase().replace(/[\s\-./_]+/g, "");
        const { data: eqs } = await supabase.rpc(
          "find_oem_equivalents" as never,
          { _oem_normalized: normalized } as never,
        );
        const equivCodes = Array.from(new Set(
          ((eqs ?? []) as Array<{ equivalent_code?: string | null }>)
            .map((e) => (e.equivalent_code ?? "").trim())
            .filter((c) => c.length >= 4),
        ));
        if (equivCodes.length > 0) {
          const filterExpr = equivCodes.slice(0, 20).map((c) => `oem_code.ilike.%${c.replace(/[,()]/g, "")}%`).join(",");
          const { data: equivRows } = await supabase
            .from("parts")
            .select("id,seo_slug,title,brand,model,year,price,city,photos,condition,part_type,stock_quantity,oem_code,oem_codes,created_at,is_sold,supplier_stock,minimum_order_amount,single_shipment_allowed,procurement_days")
            .eq("status", "approved")
            .or(filterExpr)
            .limit(PAGE_SIZE);
          const known = new Set(merged.map((p) => p.id));
          for (const r of (equivRows ?? []) as Part[]) {
            if (!known.has(r.id)) { merged.push(r); known.add(r.id); }
          }
        }
      }

      setParts(merged);
      setTotalCount(merged.length === rows.length ? (rows[0]?.total_count ?? rows.length) : merged.length);

      if (merged.length === 0 && term) {
        const { data: alt } = await supabase.rpc("suggest_alternatives", { _q: term, _limit: 8 });
        if (!cancelled) setAlternatives(((alt ?? []) as Part[]));
      } else {
        setAlternatives([]);
      }

      // Analytics + click-tracking
      if (term || brand.trim()) {
        if (term) pushRecent(term);
        const isOemish = /^[A-Z0-9 .\-/]{4,}$/i.test(term);
        if (isOemish && term) {
          supabase.from("oem_searches").insert({ oem: term.toUpperCase(), results_count: rows.length }).then(() => {});
        }
        const { data: ins } = await supabase
          .from("search_logs")
          .insert({
            query: q.trim() || null,
            brand: brand.trim() || null,
            city: city.trim() || null,
            oem: oem.trim() ? oem.trim().toUpperCase() : null,
            results_count: rows.length,
          })
          .select("id")
          .maybeSingle();
        if (ins?.id && typeof window !== "undefined") {
          try { window.sessionStorage.setItem(LAST_LOG_KEY, ins.id); } catch {}
        }

        // Fırsatlar (Talep İstihbaratı) — bulunamayan/az sonuçlu aramaları kaydet
        void recordDemandSignal({
          oem: oem.trim() || (isOemish ? term : null),
          query: q.trim() || null,
          partName: q.trim() || null,
          brand: brand.trim() || null,
          vehicleClass: vc || null,
          resultsCount: merged.length,
        });
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [q, brand, oem, vc, city, cond, pmin, pmax, instock, photo, dsame, dbus, dhand, urgent, verified, page]);

  // Satış durumu (RPC sonuçlarında gelmiyor) — id listesi için tek sorguda çekilir.
  useEffect(() => {
    const ids = parts.map((p) => p.id).filter((id) => !(id in soldMap));
    if (ids.length === 0) return;
    let alive = true;
    supabase.from("parts").select("id,is_sold").in("id", ids).then(({ data }) => {
      if (!alive) return;
      setSoldMap((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = false;
        for (const r of (data ?? []) as Array<{ id: string; is_sold: boolean | null }>) next[r.id] = !!r.is_sold;
        return next;
      });
    });
    return () => { alive = false; };
  }, [parts, soldMap]);

  const withSold = useMemo(
    () => parts.map((p) => ({ ...p, is_sold: p.is_sold ?? soldMap[p.id] ?? false })),
    [parts, soldMap],
  );
  const visibleParts = useMemo(() => {
    const base =
      sold === "1" ? withSold.filter((p) => p.is_sold)
      : sold === "0" ? withSold.filter((p) => !p.is_sold)
      : withSold;
    // Doğrulanmış harici sonuç normal ürünlerle TEK listede birleştirilir.
    if (sold === "1") return base;
    const extras = [
      ...(externalPart ? [externalPart] : []),
      ...catalogParts,
      ...(!externalPart && catalogParts.length === 0 && smartPart ? [smartPart] : []),
    ] as typeof base;
    return extras.length ? [...extras, ...base] : base;
  }, [withSold, sold, externalPart, smartPart, catalogParts]);
  const combinedResultCount = visibleParts.length;
  // KADEMELİ GÖSTERİM: Taşıtsan sonuçları hemen; tedarikçi sonuçları gelince eklenir.
  const supplierLoading = externalLoading || smartLoading || catalogLoading;
  const isLoading = loading || (supplierLoading && visibleParts.length === 0);
  const showNotFound = !loading && !supplierLoading && visibleParts.length === 0;

  // "Bunu mu aradınız?" — yalnızca sonuç yok/zayıfsa, güven eşiğinin üstündeki 3–5 öneri.
  const didYouMeanTerm = (q || oem || "").trim();
  const didYouMean = useDidYouMean(didYouMeanTerm, showNotFound || (!loading && combinedResultCount > 0 && combinedResultCount < 3), 5);


  useEffect(() => {
    if (!shouldSearchExternal || loading || externalLoading) return;
    console.info("[parts-search][result-flow]", JSON.stringify({
      SEARCH_Q: externalSearchTerm,
      NORMALIZED_OEM: normalizedExternalOem,
      LOCAL_RESULTS_COUNT: visibleParts.length - externalResultCount,
      EXTERNAL_RESULTS_COUNT: externalResultCount,
      COMBINED_RESULTS_COUNT: combinedResultCount,
      IS_LOADING: isLoading,
      SHOW_NOT_FOUND: showNotFound,
    }));
  }, [
    combinedResultCount,
    externalLoading,
    externalResultCount,
    isLoading,
    externalSearchTerm,
    loading,
    normalizedExternalOem,
    shouldSearchExternal,
    showNotFound,

    visibleParts.length,
  ]);

  const totalPages = useMemo(
    () => (totalCount === null ? 1 : Math.max(1, Math.ceil(totalCount / PAGE_SIZE))),
    [totalCount],
  );

  const applyFilters = (e?: React.FormEvent) => {
    e?.preventDefault();
    navigate({
      search: {
        q: qInput.trim(),
        brand: brandInput.trim(),
        oem: oemInput.trim().toUpperCase(),
        vc,
        city: cityInput.trim(),
        cond: condInput,
        pmin: pminInput.trim(),
        pmax: pmaxInput.trim(),
        instock: instockInput ? "1" : "",
        photo: photoInput ? "1" : "",
        dsame: dsameInput ? "1" : "",
        dbus: dbusInput ? "1" : "",
        dhand: dhandInput ? "1" : "",
        urgent: urgentInput ? "1" : "",
        verified: verifiedInput ? "1" : "",
        sold,
        page: 1,
      },
    });
  };

  const clearFilters = () => {
    setQInput(""); setBrandInput(""); setOemInput(""); setCityInput("");
    setPminInput(""); setPmaxInput(""); setCondInput(""); setInstockInput(false); setPhotoInput(false);
    setDsameInput(false); setDbusInput(false); setDhandInput(false); setUrgentInput(false); setVerifiedInput(false);
    navigate({ search: { q: "", brand: "", oem: "", vc: "", city: "", cond: "", pmin: "", pmax: "", instock: "", photo: "", dsame: "", dbus: "", dhand: "", urgent: "", verified: "", sold: "", page: 1 } });
  };

  const goToPage = (p: number) => {
    navigate({ search: (prev: any) => ({ ...prev, page: p }) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setVc = (next: typeof vc) => {
    navigate({ search: (prev: any) => ({ ...prev, vc: next, page: 1 }) });
  };

  const quickSearch = (term: string) => {
    setQInput(term);
    navigate({ search: (prev: any) => ({ ...prev, q: term, page: 1 }) });
  };

  // Click tracking → write clicked_part_id to last search log
  const onCardClick = (partId: string) => {
    if (typeof window === "undefined") return;
    const id = window.sessionStorage.getItem(LAST_LOG_KEY);
    if (!id) return;
    supabase.rpc("log_search_click", { _log_id: id, _part_id: partId } as never).then(() => {});
  };

  const VC_TABS: Array<{ v: typeof vc; label: string }> = [
    { v: "", label: "Tümü" },
    { v: "automobile", label: "🚗 Otomobil" },
    { v: "heavy_vehicle", label: "🚚 Ağır Vasıta" },
    { v: "construction", label: "🚜 İş Makinesi" },
    { v: "agriculture", label: "🌾 Tarım" },
  ];

  const SOLD_TABS: Array<{ v: typeof sold; label: string }> = [
    { v: "", label: "Tümü" },
    { v: "0", label: "Satışta" },
    { v: "1", label: "Satıldı" },
  ];

  const CONDS: Array<{ v: typeof cond; label: string }> = [
    { v: "", label: "Tümü" },
    { v: "new", label: "Sıfır" },
    { v: "used", label: "2. El" },
    { v: "refurbished", label: "Yenilenmiş" },
  ];

  const hasFilters = q || brand || oem || vc || city || cond || pmin || pmax || instock || photo || dsame || dbus || dhand || urgent || verified;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 pt-4 lg:pt-8 space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-2xl lg:text-3xl tracking-wide">Akıllı Parça Arama</h1>
          <p className="text-sm text-muted-foreground">
            OEM, marka, model, motor kodu, kategori veya ürün adı — tek arama kutusu, anlık öneri.
          </p>
        </header>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {VC_TABS.map((t) => (
            <button key={t.v || "all"} type="button" onClick={() => setVc(t.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                vc === t.v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:text-foreground"
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Satış durumu filtresi">
          {SOLD_TABS.map((t) => (
            <button key={t.v || "all"} type="button"
              onClick={() => navigate({ search: (prev: any) => ({ ...prev, sold: t.v, page: 1 }) })}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                sold === t.v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:text-foreground"
              }`}>{t.label}</button>
          ))}
        </div>

        <form onSubmit={applyFilters} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder="OEM, ürün, marka veya model"
                className="h-11 pl-9"
                aria-label="Akıllı arama"
                autoComplete="off"
                enterKeyHint="search"
              />
              {showSuggest && (liveCorrection || suggestions.length > 0 || recent.length > 0 || popular.length > 0) && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-80 overflow-auto">
                  {liveCorrection && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQInput(liveCorrection.label);
                        navigate({ search: (prev: any) => ({ ...prev, q: liveCorrection.label, oem: "", page: 1 }) });
                        setShowSuggest(false);
                      }}
                      className="w-full text-left px-3 py-2 border-b border-border bg-gold/5 hover:bg-gold/10 text-sm"
                    >
                      Bunu mu arıyorsunuz? <span className="font-semibold text-gold">{liveCorrection.label}</span>
                    </button>
                  )}

                  {suggestions.map((s, i) => (
                    <button key={`${s.kind}-${s.label}-${i}`} type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (s.kind === "oem") {
                          setOemInput(s.label);
                          navigate({ search: (prev: any) => ({ ...prev, q: "", oem: s.label, page: 1 }) });
                        } else {
                          setQInput(s.label);
                          navigate({ search: (prev: any) => ({ ...prev, q: s.label, oem: "", page: 1 }) });
                        }
                        setShowSuggest(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        <span className="text-[10px] uppercase text-gold mr-2">{s.kind === "oem" ? "OEM" : s.kind === "brand_model" ? "Araç" : "Parça"}</span>
                        {s.label}
                      </span>
                      {s.hint && <span className="text-xs text-muted-foreground truncate">{s.hint}</span>}
                    </button>
                  ))}
                  {qInput.trim().length < 2 && recent.length > 0 && (
                    <div className="px-3 py-2 border-t border-border">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1"><History className="size-3" /> Son aramalar</p>
                      <div className="flex flex-wrap gap-1">
                        {recent.map((r) => (
                          <button key={r} type="button" onMouseDown={(e) => { e.preventDefault(); quickSearch(r); setShowSuggest(false); }}
                            className="px-2 py-0.5 rounded-md bg-muted text-xs hover:bg-accent">{r}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {qInput.trim().length < 2 && popular.length > 0 && (
                    <div className="px-3 py-2 border-t border-border">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1"><Flame className="size-3" /> Popüler</p>
                      <div className="flex flex-wrap gap-1">
                        {popular.map((p) => (
                          <button key={p.query} type="button" onMouseDown={(e) => { e.preventDefault(); quickSearch(p.query); setShowSuggest(false); }}
                            className="px-2 py-0.5 rounded-md bg-gold/10 text-gold text-xs hover:bg-gold/20">{p.query}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Input value={brandInput} onChange={(e) => setBrandInput(e.target.value)} placeholder="Marka (örn. Mercedes)" className="h-11" aria-label="Marka filtresi" />
            <Input value={oemInput} onChange={(e) => setOemInput(e.target.value.toUpperCase())} placeholder="OEM kodu" className="h-11 font-mono" aria-label="OEM kodu filtresi" />
          </div>

          {filtersOpen && (
            <div className="grid sm:grid-cols-4 gap-2 pt-2 border-t border-border">
              <Input value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Şehir" className="h-10" />
              <select value={condInput} onChange={(e) => setCondInput(e.target.value as typeof cond)}
                className="h-10 px-3 rounded-md border border-border bg-background text-sm">
                {CONDS.map((c) => <option key={c.v || "all"} value={c.v}>{c.label}</option>)}
              </select>
              <Input type="number" inputMode="numeric" value={pminInput} onChange={(e) => setPminInput(e.target.value)} placeholder="Min ₺" className="h-10" />
              <Input type="number" inputMode="numeric" value={pmaxInput} onChange={(e) => setPmaxInput(e.target.value)} placeholder="Max ₺" className="h-10" />
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={photoInput} onChange={(e) => setPhotoInput(e.target.checked)} className="size-4 accent-gold" />
                Sadece görselli
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={instockInput} onChange={(e) => setInstockInput(e.target.checked)} className="size-4 accent-gold" />
                Sadece stoktakiler
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={dsameInput} onChange={(e) => setDsameInput(e.target.checked)} className="size-4 accent-gold" />
                🚚 Aynı Gün Kargo
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={dbusInput} onChange={(e) => setDbusInput(e.target.checked)} className="size-4 accent-gold" />
                🚌 Otobüs Kargo
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={dhandInput} onChange={(e) => setDhandInput(e.target.checked)} className="size-4 accent-gold" />
                🏪 Elden Teslim
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={urgentInput} onChange={(e) => setUrgentInput(e.target.checked)} className="size-4 accent-gold" />
                🔥 Acil Teslim
              </label>
              <label className="flex items-center gap-2 text-sm px-2">
                <input type="checkbox" checked={verifiedInput} onChange={(e) => setVerifiedInput(e.target.checked)} className="size-4 accent-gold" />
                ✓ Doğrulanmış Satıcı
              </label>
            </div>
          )}


          <div className="flex gap-2">
            <Button type="submit" className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold h-11 flex-1 sm:flex-initial sm:px-8">
              <Search className="size-4 mr-1.5" /> Ara
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => setFiltersOpen((v) => !v)}>
              <SlidersHorizontal className="size-4 mr-1" /> {filtersOpen ? "Filtreleri Gizle" : "Gelişmiş"}
            </Button>
            {hasFilters && (
              <Button type="button" variant="outline" onClick={clearFilters} className="h-11">
                <X className="size-4 mr-1" /> Temizle
              </Button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>
            {totalCount === null ? "Yükleniyor..." : `${totalCount.toLocaleString("tr-TR")} ilan`}
            {!loading && took.current > 0 && ` · ${took.current} ms`}
          </p>
          <p>Sayfa {page} / {totalPages}</p>
        </div>

        {appliedCorrection && !loading && (
          <p className="text-sm rounded-xl border border-gold/30 bg-gold/5 px-3 py-2">
            <span className="text-muted-foreground">Şunun sonuçları gösteriliyor:</span>{" "}
            <button
              type="button"
              className="font-semibold text-gold underline underline-offset-2"
              onClick={() => { setQInput(appliedCorrection); quickSearch(appliedCorrection); }}
            >
              {appliedCorrection}
            </button>
          </p>
        )}

        {didYouMean.length > 0 && !loading && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 space-y-2">
            <p className="text-sm font-semibold text-gold">Bunu mu aradınız?</p>
            <div className="flex flex-wrap gap-1.5">
              {didYouMean.map((s, i) => (
                <button
                  key={`${s.kind}-${s.label}-${i}`}
                  type="button"
                  onClick={() => {
                    if (s.kind === "oem") {
                      setOemInput(s.label);
                      navigate({ search: (prev: any) => ({ ...prev, q: "", oem: s.label, page: 1 }) });
                    } else {
                      setQInput(s.label);
                      navigate({ search: (prev: any) => ({ ...prev, q: s.label, oem: "", page: 1 }) });
                    }
                  }}
                  className="px-2.5 py-1 rounded-full border border-gold/40 bg-card text-xs hover:bg-gold/10 max-w-full"
                >
                  <span className="text-[9px] uppercase text-gold mr-1.5">
                    {s.kind === "oem" ? "OEM" : s.kind === "brand_model" ? "Araç" : "Parça"}
                  </span>
                  <span className="truncate">{s.label}</span>
                  {s.hint ? <span className="ml-1.5 text-[10px] text-muted-foreground font-mono">{s.hint}</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}




        {/* Tedarikçi stok sorgusu sürerken tek ve net bekleme mesajı.
            Sonuç gelir gelmez kaybolur; yerel sonuçlar gizlenmez. */}
        <ExternalSupplierResults
          loading={supplierLoading}
          localResultCount={visibleParts.length}
        />


        {isLoading && !supplierLoading ? (
          <div className="py-16 text-center text-muted-foreground">Yükleniyor...</div>


        ) : showNotFound ? (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
              <PackageSearch className="size-10 text-gold mx-auto" />
              <p className="font-semibold">Bu kriterlere uyan ilan bulunamadı.</p>
              <p className="text-sm text-muted-foreground">
                Aradığınız parçayı bulamadıysanız Talep Merkezi'nden talep oluşturun.
              </p>
              <Button asChild className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                <Link to="/requests"><Inbox className="size-4 mr-1.5" /> Talep Merkezi'ne Git</Link>
              </Button>
            </div>
            {alternatives.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gold">Benzer OEM önerileri</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {alternatives.map((p) => (
                    <div key={p.id} onClick={() => onCardClick(p.id)}>
                      <PartCard part={p} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : visibleParts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {visibleParts.map((p) => (
              <div key={p.id} onClick={() => onCardClick(p.id)}>
                <PartCard part={p} />
              </div>
            ))}
          </div>
        ) : (
          <div className="sr-only" aria-live="polite">
            Harici tedarikçi sonucu bulundu.
          </div>
        )}

        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 pt-4" aria-label="Sayfalama">
            <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Önceki</Button>
            <span className="text-sm text-muted-foreground px-3">{page} / {totalPages}</span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Sonraki →</Button>
          </nav>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
