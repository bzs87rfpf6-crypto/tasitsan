import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, notFound, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { buildPartParam, extractPartUuid, slugifyOem } from "@/lib/part-slug";
import { absoluteUrl, isPartIndexable, ROBOTS_INDEX } from "@/lib/site-url";
import { displayOem } from "@/lib/oem-display";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, Calendar, Tag, ShieldCheck, Phone, MessageCircle, Eye, HelpCircle } from "lucide-react";
import { AddToCartButton } from "@/components/AddToCartButton";
import { SupplierStockNotice } from "@/components/SupplierStockBadge";
import { SoldRibbon } from "@/components/SoldBadge";
import { SoldActions } from "@/components/SoldActions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPartImageDisplayUrl, getSafePartPhotos } from "@/lib/part-images";
import { useOemLibraryImage } from "@/lib/oem-library-resolver";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartImageLightbox } from "@/components/PartImageLightbox";
import { PartGallery } from "@/components/PartGallery";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { trackEvent, getAiSearchBridge } from "@/lib/analytics";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PartWatchCard } from "@/components/PartWatchCard";

import { recordPartView } from "@/lib/views";
import { EquivalentParts } from "@/components/EquivalentParts";
import { AiOemSuggester } from "@/components/AiOemSuggester";
import { OemImageFinder } from "@/components/OemImageFinder";
import { OemBox } from "@/components/OemBox";
import { CompatibilityTable } from "@/components/CompatibilityTable";
import { RelatedLinks } from "@/components/RelatedLinks";
import { PartInternalLinks } from "@/components/PartInternalLinks";
import { HubLinks } from "@/components/HubLinks";
import { AiEnrichedSections } from "@/components/AiEnrichedSections";
import { buildProductFaq, faqJsonLd } from "@/lib/product-faq";
import { validateAll } from "@/lib/jsonld-validator";
import { buildAutoDescription } from "@/lib/product-content";
import { useServerFn } from "@tanstack/react-start";
import { getOrFetchOemCachedImage } from "@/lib/oem-image-cache.functions";
import { UserAvatar } from "@/components/UserAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { TrustedSellerBadge } from "@/components/TrustedSellerBadge";
import { PartTypeBadge } from "@/components/PartTypeBadge";
import { NoImageCard } from "@/components/NoImageCard";
import { DeliveryBadges } from "@/components/DeliveryBadges";
import { ReviewsSection } from "@/components/trust/ReviewsSection";
import { VerificationBadgeList } from "@/components/trust/VerificationBadgePill";


export const Route = createFileRoute("/parts/$id")({
  loader: async ({ params }) => {
    // NOTE: never wrap this in try/catch — a `redirect()` thrown by TanStack
    // Router doesn't always expose an enumerable `isRedirect` key, so an
    // `"isRedirect" in e` guard silently swallows 301s and users land on
    // "İlan bulunamadı" instead of the canonical URL.
    const { getPartSeo } = await import("@/lib/seo.functions");
    // Geçici sunucu hatası ile "gerçekten yok" durumunu ayırıyoruz:
    // - transient  → meta index kalır (8k+ ürünün topluca noindex olmasını önler)
    // - gerçek yok → noindex + 404 UI (soft-404 üretmeyiz)
    let data: Awaited<ReturnType<typeof getPartSeo>> | null = null;
    try {
      data = await getPartSeo({ data: { id: params.id } });
    } catch (err) {
      console.error("[parts/$id] getPartSeo failed", err);
      return { __transient: true } as unknown as null;
    }
    // Gerçekten yok → SSR'da gerçek HTTP 404 (soft-404 üretmeyiz).
    // Geçici hata yukarıda `__transient` ile ayrıldığı için buraya düşmez.
    if (!data) throw notFound();
    const canonical = buildPartParam({
      id: data.id,
      seo_slug: data.seo_slug,
      title: data.title,
      oem_code: data.oem_code,
      oem_codes: data.oem_codes,
    });
    if (params.id !== canonical) {
      throw redirect({
        to: "/parts/$id",
        params: { id: canonical },
        statusCode: 301,
        replace: true,
      });
    }
    // Fetch the pre-computed unique SEO title/description; failures are non-fatal.
    const { getProductSeoMeta } = await import("@/lib/product-seo-meta.functions");
    const meta = await getProductSeoMeta({ data: { partId: data.id } }).catch(() => null);
    return { ...data, seoMeta: meta } as typeof data & { seoMeta: typeof meta };
  },
  head: ({ params, loaderData }) => {
    const ld = loaderData as (typeof loaderData & { __transient?: boolean }) | null;
    const transient = !!ld && !(ld as { id?: string }).id;
    const p = ld && (ld as { id?: string }).id ? ld : null;
    const canonicalId = p
      ? buildPartParam({
          id: p.id,
          seo_slug: p.seo_slug,
          title: p.title,
          oem_code: p.oem_code,
          oem_codes: p.oem_codes,
        })
      : params.id;
    const url = absoluteUrl(`/parts/${canonicalId}`);
    if (!p) {
      if (transient) {
        // Geçici hata: kanonik korunur, noindex verilmez.
        return {
          meta: [
            { title: "İlan — Taşıtsan Parça Borsası" },
            { name: "robots", content: ROBOTS_INDEX },
            { property: "og:url", content: url },
          ],
          links: [{ rel: "canonical", href: url }],
        };
      }
      // Gerçekten bulunamadı → soft-404 değil: noindex.
      return {
        meta: [
          { title: "İlan bulunamadı — Taşıtsan" },
          { name: "robots", content: "noindex,follow" },
        ],
      };
    }
    // Merkezî indeksleme politikası: onaylı + kanonik slug'ı olan her ürün dizine girer.
    const isIndexable = isPartIndexable(p as { status?: string | null; seo_slug?: string | null });

    const allOems = (p.oem_codes && p.oem_codes.length > 0 ? p.oem_codes : (p.oem_code ? [p.oem_code] : []));
    const primaryOem = allOems[0] ?? null;
    const storedMeta = (p as { seoMeta?: { title: string; description: string } | null }).seoMeta ?? null;
    const seoTitle = storedMeta?.title ?? (() => {
      const parts: string[] = [];
      if (primaryOem) parts.push(`${primaryOem} ${p.title}`);
      else parts.push(p.title);
      if (p.brand) parts.push(p.brand);
      parts.push("Taşıtsan");
      return parts.join(" | ");
    })();
    const brandModel = [p.brand, p.model, p.year].filter(Boolean).join(" ");
    const autoDesc = primaryOem
      ? `${primaryOem} OEM numaralı ${p.title}${brandModel ? ` (${brandModel})` : ""}. Güvenilir satıcılardan uygun fiyatlarla Taşıtsan'da inceleyin.`
      : `${p.title} yedek parçası${brandModel ? ` — ${brandModel}` : ""}. Taşıtsan Parça Borsası üzerinden teklif alabilir ve satıcılarla iletişime geçebilirsiniz.`;
    const desc = storedMeta?.description ?? (p.description && p.description.trim().length > 20
      ? `${primaryOem ? `${primaryOem} OEM. ` : ""}${p.description.slice(0, 150)}`
      : autoDesc
    ).replace(/\s+/g, " ").trim();

    const keywords = [...allOems, p.engine_code, p.brand, p.model, p.title].filter(Boolean).join(", ");
    const image = (p.photos ?? []).find((u) => typeof u === "string" && u.startsWith("http")) ?? null;
    const availability = (p.stock_quantity ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
    const condition =
      p.condition === "new" ? "https://schema.org/NewCondition" :
      p.condition === "refurbished" ? "https://schema.org/RefurbishedCondition" :
      "https://schema.org/UsedCondition";

    // Pull enriched attributes / alt texts persisted by the enrichment engine.
    const enriched = (p as { seoMeta?: { attributes?: Record<string, string | number | boolean | null | string[]> | null; alt_texts?: string[] | null } | null }).seoMeta ?? null;
    const attrs = (enriched?.attributes ?? {}) as Record<string, string | number | boolean | null | string[]>;
    const storedAlt = Array.isArray(enriched?.alt_texts) && enriched!.alt_texts!.length > 0 ? enriched!.alt_texts![0] : null;

    // Build normalized additionalProperty from enriched attributes when available,
    // falling back to raw part fields. Only include values that actually exist.
    const attrProp = (name: string, value: unknown) =>
      value !== undefined && value !== null && value !== "" ? { "@type": "PropertyValue", name, value: String(value) } : null;
    const additionalProperty = [
      attrProp("Marka", attrs.brand ?? p.brand),
      attrProp("Model", attrs.model ?? p.model),
      attrProp("Yıl", attrs.year ?? p.year),
      attrProp("Motor Kodu", attrs.engine ?? p.engine_code),
      attrProp("Yakıt", attrs.fuel),
      attrProp("Şanzıman", attrs.transmission),
      attrProp("Kasa Tipi", attrs.body_type),
      attrProp("Araç Sınıfı", attrs.vehicle_class),
      attrProp("Kategori", attrs.category ?? p.category),
      attrProp("Parça Tipi", attrs.part_type ?? (p as { part_type?: string | null }).part_type),
      allOems.length > 1 ? { "@type": "PropertyValue", name: "OEM Kodları", value: allOems.join(", ") } : null,
    ].filter(Boolean);

    const priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const hasRealPrice = p.price != null && Number(p.price) > 0;
    const productLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": url,
      url,
      name: p.title,
      description: desc,
      sku: primaryOem ?? p.id,
      productID: p.id,
      mpn: primaryOem ?? undefined,
      category: attrs.category ?? p.category ?? undefined,
      brand: { "@type": "Brand", name: (attrs.brand as string) ?? p.brand ?? "Taşıtsan" },
      image: image
        ? [{
            "@type": "ImageObject",
            url: image,
            caption: storedAlt ?? `${primaryOem ? `${primaryOem} ` : ""}${p.title}${p.brand ? ` — ${p.brand}` : ""}`,
          }]
        : undefined,
      itemCondition: condition,
      isAccessoryOrSparePartFor: brandModel ? { "@type": "Vehicle", name: brandModel } : undefined,
      additionalProperty,
      // Offers only when we have a real positive price — validator strips otherwise.
      offers: hasRealPrice ? {
        "@type": "Offer",
        url,
        priceCurrency: "TRY",
        price: Number(p.price),
        priceValidUntil,
        availability,
        itemCondition: condition,
        seller: { "@type": "Organization", name: "Taşıtsan Parça Borsası" },
        areaServed: p.city ?? "TR",
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "TR",
          returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 14,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/FreeReturn",
        },
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: { "@type": "DefinedRegion", addressCountry: "TR" },
          shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "TRY" },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
          },
        },
      } : undefined,
      // NOTE: aggregateRating intentionally omitted — never fabricate ratings.
    };

    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Anasayfa", item: "https://www.tasitsan.com.tr/" },
        { "@type": "ListItem", position: 2, name: "Parçalar", item: "https://www.tasitsan.com.tr/parts" },
        ...(primaryOem ? [{ "@type": "ListItem", position: 3, name: primaryOem, item: `https://www.tasitsan.com.tr/oem/${slugifyOem(primaryOem)}` }] : []),
        { "@type": "ListItem", position: primaryOem ? 4 : 3, name: p.title, item: url },
      ],
    };

    const faqs = buildProductFaq({
      id: p.id,
      title: p.title,
      brand: p.brand,
      model: p.model,
      year: p.year,
      oem_code: p.oem_code,
      oem_codes: p.oem_codes,
      engine_code: p.engine_code,
      condition: p.condition,
      category: p.category,
    });
    const faqLd = faqJsonLd(faqs);

    const imageAlt = storedAlt ?? `${primaryOem ? `${primaryOem} ` : ""}${p.title}${p.brand ? ` — ${p.brand}` : ""}${p.model ? ` ${p.model}` : ""} OEM Parça`.replace(/\s+/g, " ").trim();

    const meta: Array<Record<string, string>> = [
      { title: seoTitle },
      { name: "description", content: desc },
      ...(keywords ? [{ name: "keywords", content: keywords }] : []),
      { property: "og:title", content: seoTitle },
      { property: "og:description", content: desc },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
      { property: "og:locale", content: "tr_TR" },
      { property: "product:price:amount", content: String(p.price ?? 0) },
      { property: "product:price:currency", content: "TRY" },
      { property: "product:availability", content: (p.stock_quantity ?? 0) > 0 ? "in stock" : "out of stock" },
      { property: "product:condition", content: p.condition === "new" ? "new" : "used" },
      { name: "twitter:title", content: seoTitle },
      { name: "twitter:description", content: desc },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (isIndexable) meta.push({ name: "robots", content: ROBOTS_INDEX });
    else meta.push({ name: "robots", content: "noindex,follow" });
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ property: "og:image:alt", content: imageAlt });
      meta.push({ property: "og:image:width", content: "1200" });
      meta.push({ property: "og:image:height", content: "1200" });
      meta.push({ name: "twitter:image", content: image });
      meta.push({ name: "twitter:image:alt", content: imageAlt });
    }
    const links: Array<Record<string, string>> = [{ rel: "canonical", href: url }];
    if (image) {
      links.push({ rel: "preload", as: "image", href: image, fetchpriority: "high" } as Record<string, string>);
    }

    // Validate every JSON-LD before publishing; invalid docs are skipped.
    const { published } = validateAll([productLd, breadcrumbLd, faqLd]);
    const scripts = published.map((doc) => ({
      type: "application/ld+json",
      children: JSON.stringify(doc),
    }));

    return { meta, links, scripts };
  },
  component: PartDetail,
});

interface PartFull {
  id: string; seo_slug: string | null; title: string; description: string | null;
  brand: string | null; model: string | null; year: number | null;
  category: string | null; condition: string; price: number | null;
  city: string | null; photos: string[] | null;
  seller_id: string; created_at: string;
  oem_code: string | null; stock_quantity: number | null;
  oem_codes: string[] | null; engine_code: string | null;
  part_type: string | null;
  delivery_options: string[] | null;
  urgent_delivery: boolean | null;
  is_sold?: boolean | null;
}


function PartDetail() {
  const { id: rawId } = useParams({ from: "/parts/$id" });
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [idNotFound, setIdNotFound] = useState(false);
  const loaderData = Route.useLoaderData();
  const { user } = useAuth();
  const nav = useNavigate();
  // SSR seed — hydrate the visible above-the-fold content from server data so
  // Google (and users on slow networks) never see a blank "Yükleniyor..." shell.
  // Client-side fetch still runs to fill seller_id / delivery / part_type.
  const seedFromLoader = (): PartFull | null => {
    if (!loaderData || !loaderData.id) return null;
    return {
      id: loaderData.id,
      seo_slug: loaderData.seo_slug,
      title: loaderData.title,
      description: loaderData.description,
      brand: loaderData.brand,
      model: loaderData.model,
      year: loaderData.year,
      category: loaderData.category,
      condition: loaderData.condition,
      price: loaderData.price,
      city: loaderData.city,
      photos: loaderData.photos,
      seller_id: "",
      created_at: loaderData.created_at,
      oem_code: loaderData.oem_code,
      stock_quantity: loaderData.stock_quantity,
      oem_codes: loaderData.oem_codes,
      engine_code: loaderData.engine_code,
      part_type: null,
      delivery_options: null,
      urgent_delivery: null,
    };
  };
  const [part, setPart] = useState<PartFull | null>(seedFromLoader);
  const [activePhoto, setActivePhoto] = useState(0);
  const [loading, setLoading] = useState(!loaderData?.id);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "" });

  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const [contactPhone, setContactPhone] = useState<string>("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [seller, setSeller] = useState<{ id: string; display_name: string | null; avatar_url: string | null; city: string | null; is_verified: boolean; trusted_seller: boolean; created_at: string } | null>(null);
  const [sellerPartsCount, setSellerPartsCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uuid = extractPartUuid(rawId);
      if (uuid) {
        if (!cancelled) setResolvedId(uuid);
        return;
      }
      // Resolve canonical SEO slug to the real parts.id UUID.
      const { data } = await supabase.from("parts").select("id").eq("seo_slug", rawId).maybeSingle();
      if (data?.id) {
        if (!cancelled) setResolvedId(data.id);
        return;
      }
      const { data: hist } = await supabase.from("parts_slug_history")
        .select("part_id").eq("slug", rawId).maybeSingle();
      if (hist?.part_id) {
        if (!cancelled) setResolvedId(hist.part_id);
        return;
      }
      if (!cancelled) {
        setIdNotFound(true);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rawId]);

  useEffect(() => {
    if (!part?.seller_id) { setSeller(null); setSellerPartsCount(0); return; }
    let cancelled = false;
    Promise.all([
      supabase.from("profiles")
        .select("id,display_name,avatar_url,city,is_verified,trusted_seller,created_at,seller_badges,seller_verified")
        .eq("id", part.seller_id).maybeSingle(),
      supabase.from("parts").select("id", { count: "exact", head: true })
        .eq("seller_id", part.seller_id).eq("status", "approved"),
    ]).then(([{ data }, { count }]) => {
      if (cancelled) return;
      setSeller((data as any) ?? null);
      setSellerPartsCount(count ?? 0);
    });
    return () => { cancelled = true; };
  }, [part?.seller_id]);

  useEffect(() => {
    supabase.rpc("get_public_site_settings").maybeSingle()
      .then(({ data }) => setContactPhone(((data as any)?.contact_phone as string) ?? ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedId) {
      setLoading(!loaderData?.id);
      return;
    }
    setLoading(true);
    setActivePhoto(0);
    setBrokenPhotos(new Set());
    (async () => {
      const FULL_COLS =
        "id,seo_slug,title,description,brand,model,year,category,condition,price,city,photos,seller_id,created_at,oem_code,oem_codes,engine_code,stock_quantity,part_type,delivery_options,urgent_delivery,is_sold,supplier_stock,minimum_order_amount,single_shipment_allowed,procurement_days";
      const FALLBACK_COLS =
        "id,seo_slug,title,description,brand,model,year,category,condition,price,city,photos,seller_id,created_at,oem_code,oem_codes,engine_code,stock_quantity,part_type,is_sold,supplier_stock,minimum_order_amount,single_shipment_allowed,procurement_days";
      let { data, error } = await supabase
        .from("parts")
        .select(FULL_COLS)
        .eq("id", resolvedId).maybeSingle();
      if (error && /delivery_options|urgent_delivery|column .* does not exist|schema cache/i.test(error.message || "")) {
        console.warn("[part-detail] retry select without delivery fields:", error.message);
        const retry = await supabase.from("parts").select(FALLBACK_COLS).eq("id", resolvedId).maybeSingle();
        data = retry.data as any;
        error = retry.error;
      }
      if (cancelled) return;
      if (error) {
        console.error("[part-detail] fetch failed:", error);
        toast.error(`İlan yüklenemedi: ${error.message}`);
      }
      setPart((data as PartFull | null) ?? null);
      setLoading(false);
      if (data) {
        const bridge = getAiSearchBridge(data.id);
        trackEvent("part_view", { part_id: data.id, title: data.title, brand: data.brand, model: data.model, ai_log_id: bridge?.log_id ?? null });
        if (bridge) trackEvent("ai_search_to_product_view", { part_id: data.id, log_id: bridge.log_id, query: bridge.query });
        // Skip self-views: seller browsing own listing must not inflate counts.
        if (user?.id && user.id === data.seller_id) {
          // Just read the current count for display without recording.
          import("@/lib/views").then(({ getPartViewCount }) =>
            getPartViewCount(data.id).then((c) => { if (!cancelled) setViewCount(c); }),
          );
        } else {
          recordPartView(data.id, user?.id ?? null).then((c) => {
            if (!cancelled && c !== null) setViewCount(c);
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedId, loaderData, user?.id]);

  // Defensive: filter null, non-string, unsupported and broken URLs; use Storage
  // render URLs so Safari decodes small optimized images instead of huge originals.
  const ownOemCodes = useMemo(() => {
    const list: string[] = [];
    if (part?.oem_code) list.push(part.oem_code);
    if (Array.isArray(part?.oem_codes)) for (const c of part!.oem_codes) if (c) list.push(c);
    return list;
  }, [part?.oem_code, part?.oem_codes]);

  const hasOwnPhoto = Array.isArray(part?.photos) && (part?.photos?.length ?? 0) > 0;
  const { data: oemLibraryImage } = useOemLibraryImage({
    oemCodes: ownOemCodes,
    enabled: !!part && !hasOwnPhoto && ownOemCodes.length > 0,
  });

  const photos = useMemo(() => {
    const raw = Array.isArray(part?.photos) ? part!.photos : [];
    const filtered = getSafePartPhotos(raw, brokenPhotos, 960);
    if (filtered.length === 0 && oemLibraryImage) {
      const display = getPartImageDisplayUrl(oemLibraryImage.url, 960) ?? oemLibraryImage.url;
      return [{ original: oemLibraryImage.url, display }];
    }
    if (raw.length !== filtered.length) {
      console.warn("[part-detail] filtered photos", {
        total: raw.length,
        kept: filtered.length,
        dropped: raw.filter((u) => !filtered.some((p) => p.original === u)),
      });
    }
    return filtered;
  }, [part, brokenPhotos, oemLibraryImage]);

  const currentPartParam = useMemo(() => (
    part ? buildPartParam(part) : rawId
  ), [part, rawId]);


  // OEM Cache — ürünün kendi fotoğrafı yoksa OEM havuzundan / Firecrawl'dan arka planda çek.
  const fetchOemCache = useServerFn(getOrFetchOemCachedImage);
  useEffect(() => {
    if (!part) return;
    const hasOwnPhoto = Array.isArray(part.photos) && part.photos.length > 0;
    if (hasOwnPhoto) return;
    const oem = part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? null;
    if (!oem) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchOemCache({
          data: {
            oem,
            brand: part.brand ?? null,
            title: part.title ?? null,
            model: part.model ?? null,
          },
        });
        if (cancelled || !res.ok) return;
        setPart((p) => {
          if (!p) return p;
          const cur = Array.isArray(p.photos) ? p.photos : [];
          if (cur.includes(res.image.image_url)) return p;
          return { ...p, photos: [res.image.image_url, ...cur] };
        });
      } catch (e) {
        console.warn("[oem-cache] auto-fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [part?.id, part?.oem_code, fetchOemCache]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp active index whenever the displayable list shrinks.
  useEffect(() => {
    if (activePhoto >= photos.length) setActivePhoto(0);
  }, [photos.length, activePhoto]);

  // Klavye ok tuşlarıyla galeride gezinme (lightbox kapalıyken).
  useEffect(() => {
    if (lightboxOpen || photos.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") setActivePhoto((i) => Math.min(photos.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setActivePhoto((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, lightboxOpen]);

  const markBroken = (photo: { original: string; display: string }) => {
    console.warn("[part-detail] image failed to load:", { original: photo.original, display: photo.display });
    setBrokenPhotos((prev) => {
      if (prev.has(photo.original) && prev.has(photo.display)) return prev;
      const next = new Set(prev);
      next.add(photo.original);
      next.add(photo.display);
      return next;
    });
  };


  const openForm = () => {
    if (!user) {
      toast.info("Talep oluşturmak için giriş yapmalısın");
      nav({ to: "/auth" });
      return;
    }
    setForm((f) => ({ ...f, message: f.message || `"${part?.title}" ilanı hakkında bilgi almak istiyorum.` }));
    setOpen(true);
  };



  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !part) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("inquiries").insert({
        part_id: part.id,
        buyer_id: user.id,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        message: form.message.trim(),
      });
      if (error) throw error;
      toast.success("Teklif talebin alındı! Taşıtsan en kısa sürede seninle iletişime geçecek.");
      setOpen(false);
      setForm({ full_name: "", phone: "", email: "", message: "" });
    } catch (err: any) {
      toast.error(translateError(err, "Talep gönderilemedi"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!part && loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  if (idNotFound || !part) return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div>
        <p className="text-muted-foreground">İlan bulunamadı.</p>
        <Link to="/" className="text-gold mt-3 inline-block">← Anasayfa</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-32 lg:pb-12" data-part-id={part.id}>
      <div className="lg:max-w-7xl lg:mx-auto lg:px-6 lg:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-8 lg:items-start">
        <div className="relative lg:sticky lg:top-6">
          {photos.length === 0 ? (
            <div className="aspect-square lg:aspect-[4/3] lg:rounded-2xl overflow-hidden">
              <NoImageCard
                title={part.title}
                price={part.price}
                whatsappNumber={contactPhone}
                phoneNumber={contactPhone}
                onRequestMessage={openForm}
                className="lg:rounded-2xl h-full"
              />

            </div>
          ) : (
            <PartGallery
              photos={photos}
              index={activePhoto}
              onIndexChange={setActivePhoto}
              onOpen={() => setLightboxOpen(true)}
              onError={markBroken}
              title={part.title}
              brand={part.brand}
              oemCode={part.oem_code}
            />
          )}
          {(part.is_sold ?? (loaderData as { is_sold?: boolean } | null)?.is_sold) && <SoldRibbon />}
          <Link
            to="/"
            className="absolute top-4 left-4 size-10 rounded-full bg-background/70 backdrop-blur grid place-items-center z-20"
            aria-label="Geri"
          >
            <ArrowLeft className="size-5" />
          </Link>
        </div>

        {lightboxOpen && photos.length > 0 && (
          <PartImageLightbox
            photos={photos}
            index={activePhoto}
            onIndexChange={setActivePhoto}
            onClose={() => setLightboxOpen(false)}
            onError={markBroken}
          />
        )}

        <div className="max-w-md mx-auto lg:max-w-none lg:mx-0 px-4 lg:px-0 pt-4 lg:pt-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-block text-[10px] uppercase tracking-widest bg-gold/10 text-gold px-2 py-1 rounded border border-gold/30">
              {part.condition === "new" ? "Sıfır" : part.condition === "refurbished" ? "Yenilenmiş" : "İkinci El"}
            </span>
            {part.part_type && <PartTypeBadge partType={part.part_type} size="md" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-full px-3 py-1.5">
              <Eye className="size-3.5 text-gold" />
              {(viewCount ?? 0).toLocaleString("tr-TR")} Görüntülenme
            </span>
            <FavoriteButton partId={part.id} size="md" />
          </div>
        </div>
        {(part.is_sold ?? (loaderData as { is_sold?: boolean } | null)?.is_sold) && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-2.5 text-sm font-semibold flex items-center gap-2">
            <span aria-hidden>✅</span> Bu ürün satılmıştır.
          </div>
        )}
        <h1 className="font-display text-2xl tracking-wide leading-tight">
          {ownOemCodes[0] ? (
            <>
              <span className="font-mono text-gold">{ownOemCodes[0]}</span>{" "}
              <span className="text-muted-foreground text-base">OEM Numaralı</span>{" "}
              {part.title}
            </>
          ) : (
            part.title
          )}
        </h1>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="text-3xl font-display text-gold tracking-wider">
            {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
          </div>
          {part.stock_quantity != null && (
            <div className="text-xs">
              <span className="text-muted-foreground">Stok: </span>
              <span className={`font-semibold ${part.stock_quantity > 0 ? "text-foreground" : "text-destructive"}`}>
                {part.stock_quantity > 0 ? `${part.stock_quantity} adet` : "Tükendi"}
              </span>
            </div>
          )}
        </div>

        <DeliveryBadges
          options={part.delivery_options}
          urgent={part.urgent_delivery}
          variant="full"
        />

        <PartWatchCard partId={part.id} price={part.price != null ? Number(part.price) : null} />





        {/* Masaüstü satır içi aksiyon paneli (mobilde sabit alt bar görünür) */}
        <div className="hidden lg:block space-y-2 bg-card border border-border rounded-2xl p-4">
          {!user ? (
            <button
              onClick={() => nav({ to: "/auth", search: { redirect: `/parts/${currentPartParam}` } as any })}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-gold/40 font-semibold text-sm hover:bg-gold/5 transition"
            >
              <Phone className="size-4 text-gold" />
              İletişim için giriş yap
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <a href={contactPhone ? `tel:${contactPhone.replace(/\s/g, "")}` : undefined}
                onClick={(e) => {
                  if (!contactPhone) { e.preventDefault(); toast.info("İletişim numarası yakında"); return; }
                  trackEvent("click_call", { from: "part_detail", part_id: part.id, seller_id: part.seller_id });
                }}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-background border border-border font-semibold text-sm hover:border-gold/60 transition">
                <Phone className="size-4 text-gold" /> Bizi Ara
              </a>
              <a href={contactPhone ? `https://wa.me/${contactPhone.replace(/\D/g, "")}` : undefined}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => {
                  if (!contactPhone) { e.preventDefault(); toast.info("WhatsApp hattı yakında"); return; }
                  trackEvent("click_whatsapp", { from: "part_detail", part_id: part.id, seller_id: part.seller_id });
                }}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-background border border-border font-semibold text-sm hover:border-gold/60 transition">
                <MessageCircle className="size-4 text-gold" /> WhatsApp
              </a>
            </div>
          )}
          {(part.is_sold ?? (loaderData as { is_sold?: boolean } | null)?.is_sold) ? (
            <SoldActions
              part={{
                id: part.id, title: part.title,
                oem_code: part.oem_code, oem_codes: part.oem_codes,
                brand: part.brand, model: part.model, year: part.year,
                category: part.category, city: part.city,
              }}
            />
          ) : (
          <AddToCartButton
            className="w-full h-12"
            item={{
              part_id: part.id,
              seo_slug: part.seo_slug,
              title: part.title,
              oem_code: part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? null,
              product_code: null,
              seller_id: part.seller_id ?? null,
              seller_name: seller?.display_name ?? null,
              photo: (part.photos && part.photos[0]) ?? null,
              unit_price: part.price != null ? Number(part.price) : null,
              supplier_stock: (part as { supplier_stock?: boolean | null }).supplier_stock ?? false,
              minimum_order_amount: (part as { minimum_order_amount?: number | null }).minimum_order_amount ?? null,
              single_shipment_allowed: (part as { single_shipment_allowed?: boolean | null }).single_shipment_allowed ?? true,
              procurement_days: (part as { procurement_days?: number | null }).procurement_days ?? null,
            }}
          />
          )}
          <SupplierStockNotice
            className="mt-3"
            part={{
              supplier_stock: (part as { supplier_stock?: boolean | null }).supplier_stock ?? false,
              minimum_order_amount: (part as { minimum_order_amount?: number | null }).minimum_order_amount ?? null,
              single_shipment_allowed: (part as { single_shipment_allowed?: boolean | null }).single_shipment_allowed ?? true,
              procurement_days: (part as { procurement_days?: number | null }).procurement_days ?? null,
              price: part.price != null ? Number(part.price) : null,
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {(part.brand || part.model) && (
            <Info icon={<Tag className="size-4" />} label="Araç" value={[part.brand, part.model].filter(Boolean).join(" ")} />
          )}
          {part.year && <Info icon={<Calendar className="size-4" />} label="Yıl" value={String(part.year)} />}
          {part.category && <Info icon={<Tag className="size-4" />} label="Kategori" value={part.category} />}
          {part.city && <Info icon={<MapPin className="size-4" />} label="Bölge" value={part.city} />}
          {part.engine_code && <Info icon={<Tag className="size-4" />} label="Motor Kodu" value={part.engine_code} />}
        </div>

        {((part.oem_codes && part.oem_codes.length > 0) || part.oem_code) && (
          <div className="bg-card rounded-xl p-4 border border-border space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gold">OEM Numaraları</h2>
            <div className="flex flex-wrap gap-1.5">
              {(part.oem_codes && part.oem_codes.length > 0 ? part.oem_codes : [part.oem_code!]).map((code) => (
                <Link
                  key={code}
                  to="/oem/$oem"
                  params={{ oem: slugifyOem(code) }}
                  className="font-mono text-xs px-2.5 py-1 rounded-md bg-background border border-gold/30 text-gold hover:bg-gold/10 transition"
                >
                  {displayOem(code)}
                </Link>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              OEM koduna tıklayarak aynı parçanın diğer ilanlarını ve eşdeğer kodları görebilirsiniz.
            </p>
          </div>
        )}

        {ownOemCodes.length > 0 && (
          <OemBox
            oemCodes={ownOemCodes}
            brand={part.brand}
            model={part.model}
            year={part.year}
            engineCode={part.engine_code}
          />
        )}

        <div className="bg-card rounded-xl p-4 border border-border">
          <h2 className="text-xs uppercase tracking-wider text-gold mb-2">Açıklama</h2>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {part.description && part.description.trim().length > 30
              ? part.description
              : buildAutoDescription({
                  id: part.id,
                  title: part.title,
                  brand: part.brand,
                  model: part.model,
                  year: part.year,
                  category: part.category,
                  oem_code: part.oem_code,
                  oem_codes: part.oem_codes,
                  engine_code: part.engine_code,
                  condition: part.condition,
                })}
          </p>
        </div>

        <CompatibilityTable
          brand={part.brand}
          model={part.model}
          year={part.year}
          engineCode={part.engine_code}
          fuelType={null}
        />

        {(() => {
          const faqs = buildProductFaq({
            id: part.id,
            title: part.title,
            brand: part.brand,
            model: part.model,
            year: part.year,
            oem_code: part.oem_code,
            oem_codes: part.oem_codes,
            engine_code: part.engine_code,
            condition: part.condition,
            category: part.category,
          });
          return (
            <section className="bg-card rounded-xl p-4 border border-border space-y-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-gold" />
                <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Sık Sorulan Sorular</h2>
              </div>
              <ul className="space-y-3">
                {faqs.map((f, i) => (
                  <li key={i} className="border-b border-border/50 last:border-0 pb-3 last:pb-0">
                    <h3 className="text-sm font-semibold mb-1">{f.question}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.answer}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        <EquivalentParts partId={part.id} />

        <AiEnrichedSections partId={part.id} />

        <HubLinks
          brand={part.brand}
          model={part.model}
          category={part.category}
          oemCodes={(part.oem_codes && part.oem_codes.length > 0 ? part.oem_codes : (part.oem_code ? [part.oem_code] : []))}
        />

        <RelatedLinks partId={part.id} />
        <PartInternalLinks partId={part.id} />

        {seller && (
          <Link
            to="/u/$id"
            params={{ id: seller.id }}
            className="flex items-center gap-3 bg-card rounded-xl p-4 border border-border hover:border-gold transition"
          >
            <UserAvatar url={seller.avatar_url} name={seller.display_name} size={48} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Satıcı</div>
              <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                <span className="truncate">{seller.display_name ?? "Satıcı"}</span>
                {seller.is_verified && <VerifiedBadge size={14} />}
                {seller.trusted_seller && <TrustedSellerBadge size={14} />}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[seller.city, `${sellerPartsCount} ilan`, `Üyelik: ${new Date(seller.created_at).toLocaleDateString("tr-TR", { year: "numeric", month: "short" })}`].filter(Boolean).join(" • ")}
              </div>
              <VerificationBadgeList badges={(seller as any).seller_badges} className="mt-1.5" />
            </div>
            <span className="text-xs text-gold font-semibold">Profili gör →</span>
          </Link>
        )}


        {part.oem_code && (
          <AiOemSuggester
            oem={part.oem_code}
            brand={part.brand}
            model={part.model}
            title={part.title}
          />
        )}
        {(part.oem_code || part.title || part.brand) && (
          <OemImageFinder
            partId={part.id}
            oem={part.oem_code}
            brand={part.brand}
            model={part.model}
            title={part.title}
            isOwner={!!user?.id && user.id === part.seller_id}
            hasExistingPhoto={Array.isArray(part.photos) && part.photos.length > 0}
            onPhotoUpdated={(url) => setPart((p) => p ? { ...p, photos: [url, ...(p.photos ?? []).filter((x) => x !== url)].slice(0, 10) } : p)}
          />
        )}

        <ReviewsSection partId={part.id} sellerId={part.seller_id} partParam={currentPartParam} />

        <div className="bg-card rounded-xl p-4 border border-gold/30 flex gap-3">
          <ShieldCheck className="size-5 text-gold shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Güvenli ticaret ve doğru eşleştirme için tüm talepler{" "}
            <span className="text-gold font-semibold">Taşıtsan</span> aracılığıyla yönetilmektedir.
          </p>
        </div>
        </div>
      </div>


      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border safe-bottom lg:hidden">
        <div className="max-w-md mx-auto p-3 space-y-2">
          {!user ? (
            <button
              onClick={() => nav({ to: "/auth", search: { redirect: `/parts/${currentPartParam}` } as any })}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-gold/40 font-semibold text-sm active:scale-[0.98] transition-transform"
            >
              <Phone className="size-4 text-gold" />
              İletişim bilgilerini görmek için giriş yap
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <a href={contactPhone ? `tel:${contactPhone.replace(/\s/g, "")}` : undefined}
                onClick={(e) => {
                  if (!contactPhone) { e.preventDefault(); toast.info("İletişim numarası yakında"); return; }
                  trackEvent("click_call", { from: "part_detail", part_id: part.id, seller_id: part.seller_id });
                }}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border font-semibold text-sm active:scale-[0.98] transition-transform">
                <Phone className="size-4 text-gold" />
                Bizi Ara
              </a>
              <a href={contactPhone ? `https://wa.me/${contactPhone.replace(/\D/g, "")}` : undefined}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => {
                  if (!contactPhone) { e.preventDefault(); toast.info("WhatsApp hattı yakında"); return; }
                  trackEvent("click_whatsapp", { from: "part_detail", part_id: part.id, seller_id: part.seller_id });
                }}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border font-semibold text-sm active:scale-[0.98] transition-transform">
                <MessageCircle className="size-4 text-gold" />
                WhatsApp
              </a>
            </div>
          )}
          {(part.is_sold ?? (loaderData as { is_sold?: boolean } | null)?.is_sold) ? (
            <SoldActions
              part={{
                id: part.id, title: part.title,
                oem_code: part.oem_code, oem_codes: part.oem_codes,
                brand: part.brand, model: part.model, year: part.year,
                category: part.category, city: part.city,
              }}
            />
          ) : (
          <AddToCartButton
            size="lg"
            className="w-full"
            item={{
              part_id: part.id,
              seo_slug: part.seo_slug,
              title: part.title,
              oem_code: part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? null,
              product_code: null,
              seller_id: part.seller_id ?? null,
              seller_name: seller?.display_name ?? null,
              photo: (part.photos && part.photos[0]) ?? null,
              unit_price: part.price != null ? Number(part.price) : null,
              supplier_stock: (part as { supplier_stock?: boolean | null }).supplier_stock ?? false,
              minimum_order_amount: (part as { minimum_order_amount?: number | null }).minimum_order_amount ?? null,
              single_shipment_allowed: (part as { single_shipment_allowed?: boolean | null }).single_shipment_allowed ?? true,
              procurement_days: (part as { procurement_days?: number | null }).procurement_days ?? null,
            }}
          />
          )}
          <SupplierStockNotice
            className="mt-3"
            part={{
              supplier_stock: (part as { supplier_stock?: boolean | null }).supplier_stock ?? false,
              minimum_order_amount: (part as { minimum_order_amount?: number | null }).minimum_order_amount ?? null,
              single_shipment_allowed: (part as { single_shipment_allowed?: boolean | null }).single_shipment_allowed ?? true,
              procurement_days: (part as { procurement_days?: number | null }).procurement_days ?? null,
              price: part.price != null ? Number(part.price) : null,
            }}
          />
        </div>
      </div>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wide">Teklif Talebi</DialogTitle>
            <DialogDescription className="text-xs">
              Bilgilerin sadece Taşıtsan ekibine iletilir. Satıcıyla doğrudan paylaşılmaz.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <Input placeholder="Ad Soyad" required maxLength={100} value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-11" />
            <Input placeholder="Telefon Numarası" required maxLength={20} inputMode="tel" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11" />
            <Input type="email" placeholder="E-posta" required maxLength={150} value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" />
            <Textarea placeholder="Mesajınız" required maxLength={1000} rows={4} value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })} className="resize-none" />
            <Button type="submit" disabled={submitting}
              className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {submitting ? "Gönderiliyor..." : "Talebi Gönder"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg p-3 border border-border">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        <span className="text-gold">{icon}</span>{label}
      </div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );
}
