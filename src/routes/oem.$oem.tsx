import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getOemListing, type OemListingResult, type OemLandingExtras } from "@/lib/oem-seo.functions";
import { OemRichContent } from "@/components/OemRichContent";


import { SafePartImage } from "@/components/SafePartImage";
import { buildPartParam, slugifyOem } from "@/lib/part-slug";
import { MapPin, Layers, Car, ArrowLeft, ChevronRight } from "lucide-react";

const SITE = "https://www.tasitsan.com.tr";

export const Route = createFileRoute("/oem/$oem")({
  loader: async ({ params }) => {
    const oem = decodeURIComponent(params.oem);
    if (!oem || oem.length < 2) throw notFound();
    const result = await getOemListing({ data: { oem } });
    if (!result.normalized) throw notFound();
    return { ...result, raw: oem };
  },
  head: ({ loaderData, params }) => {
    const oem = loaderData?.normalized ?? params.oem.toUpperCase();
    const url = `${SITE}/oem/${slugifyOem(oem)}`;
    const count = loaderData?.parts.length ?? 0;
    const equivalentsCount = loaderData?.equivalents.length ?? 0;
    const vehiclesShort = (loaderData?.vehicles ?? []).slice(0, 3).join(", ");
    // Thin content guard: OEM sayfası hem ilan hem eşdeğer yoksa dizine alma
    // (marka pattern) — Google "Keşfedildi, dizine eklenmedi" kirliliğini önler.
    const isThin = count === 0 && equivalentsCount === 0;
    const title = `${oem} OEM Numaralı Yedek Parça | Taşıtsan`;
    const description = vehiclesShort
      ? `${oem} OEM numaralı yedek parça. Uyumlu: ${vehiclesShort}. ${count} ilan ve eşdeğer kodlar Taşıtsan'da.`
      : `${oem} OEM numaralı yedek parça ilanları, eşdeğer kodlar ve uyumlu araçlar Taşıtsan Parça Borsası'nda.`;
    const firstImage = (loaderData?.parts ?? [])
      .flatMap((p) => ((p as { photos?: string[] | null }).photos ?? []))
      .find((u): u is string => typeof u === "string" && u.startsWith("http")) ?? null;
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: title,
      itemListElement: (loaderData?.parts ?? []).slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/parts/${buildPartParam(p)}`,
        name: p.title,
      })),
    };
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Anasayfa", item: SITE },
        { "@type": "ListItem", position: 2, name: "OEM Numaraları", item: `${SITE}/parts` },
        { "@type": "ListItem", position: 3, name: oem, item: url },
      ],
    };
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `${oem} OEM numarası hangi araca uyumludur?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: vehiclesShort
              ? `${oem} OEM numarası ${vehiclesShort} modellerinde kullanılır. Uyumluluk için satıcıyla teyit edin.`
              : `${oem} OEM kodu birden fazla araç modelinde kullanılabilir. Detay için ilanlara göz atın.`,
          },
        },
        {
          "@type": "Question",
          name: `${oem} OEM numarasının eşdeğeri var mı?`,
          acceptedAnswer: {
            "@type": "Answer",
            text:
              (loaderData?.equivalents.length ?? 0) > 0
                ? `Evet, eşdeğer OEM'ler: ${loaderData!.equivalents.slice(0, 6).join(", ")}.`
                : `Eşdeğer kodlar Taşıtsan veritabanında sürekli güncellenmektedir.`,
          },
        },
        {
          "@type": "Question",
          name: `${oem} OEM numaralı parçayı nereden alabilirim?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Taşıtsan Parça Borsası'nda doğrulanmış satıcılardan teklif alabilir ve güvenle satın alabilirsiniz.`,
          },
        },
      ],
    };
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { name: "robots", content: isThin ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: firstImage ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (firstImage) {
      meta.push({ property: "og:image", content: firstImage });
      meta.push({ name: "twitter:image", content: firstImage });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
        { type: "application/ld+json", children: JSON.stringify(ld) },
        { type: "application/ld+json", children: JSON.stringify(faq) },
      ],
    };
  },
  component: OemPage,
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center text-muted-foreground p-6">
      <div className="text-center space-y-3">
        <p>OEM sayfası yüklenemedi.</p>
        <Link to="/" className="text-gold">← Anasayfa</Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center text-muted-foreground p-6">
      <div className="text-center space-y-3">
        <p>OEM numarası bulunamadı.</p>
        <Link to="/" className="text-gold">← Anasayfa</Link>
      </div>
    </div>
  ),
});

type OemPart = OemListingResult["parts"][number];

function OemPage() {
  const data = Route.useLoaderData() as OemListingResult & { raw: string; extras: OemLandingExtras };
  const normalized: string = data.normalized;
  const parts: OemPart[] = data.parts;
  const equivalents: string[] = data.equivalents;
  const vehicles: string[] = data.vehicles;
  const extras = data.extras;

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-4 lg:pt-8 space-y-6">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-gold">Anasayfa</Link>
          <ChevronRight className="size-3" />
          <Link to="/parts" className="hover:text-gold">OEM Numaraları</Link>
          <ChevronRight className="size-3" />
          <span className="font-mono text-foreground">{normalized}</span>
        </nav>

        <header className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold">OEM Numarası</div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-wide leading-tight">
            <span className="font-mono">{normalized}</span> OEM Numaralı Yedek Parçalar
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {normalized} OEM kodlu yedek parça için aktif ilanlar, eşdeğer numaralar ve uyumlu araç bilgileri
            aşağıda listelenmiştir. Tüm satıcılar Taşıtsan tarafından doğrulanır.
          </p>
        </header>

        {vehicles.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Car className="size-4 text-gold" />
              <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Uyumlu Araçlar</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vehicles.map((v) => (
                <span key={v} className="text-xs px-2.5 py-1 rounded-md bg-background border border-border">
                  {v}
                </span>
              ))}
            </div>
          </section>
        )}

        {equivalents.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-gold" />
              <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Eşdeğer OEM Numaraları</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {equivalents.map((c) => (
                <Link
                  key={c}
                  to="/oem/$oem"
                  params={{ oem: slugifyOem(c) }}
                  className="font-mono text-xs px-2.5 py-1 rounded-md bg-background border border-gold/40 text-gold hover:bg-gold/10 transition"
                >
                  {c}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {parts.length > 0 ? `Taşıtsan Stoğu — ${parts.length} İlan` : "Şu an aktif ilan yok"}
          </h2>

          {parts.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              Bu OEM için aktif ilan bulunamadı. Eşdeğer kodlara göz atabilir veya talep oluşturabilirsiniz.
              <div className="mt-3">
                <Link to="/urgent/new" className="text-gold font-semibold">Acil Parça Talebi Oluştur →</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {parts.map((p) => (
                <Link
                  key={p.id}
                  to="/parts/$id"
                  params={{ id: buildPartParam(p) }}
                  className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-gold transition-colors"
                >
                  <div className="aspect-square bg-secondary relative overflow-hidden">
                    <SafePartImage
                      images={p.photos}
                      alt={`${normalized} ${p.title}`}
                      width={420}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      brand={p.brand}
                      title={p.title}
                      oemCode={p.oem_code}
                      oemCodes={p.oem_codes ?? undefined}
                      placeholderSize="md"
                    />
                  </div>
                  <div className="p-2.5 space-y-1">
                    <h3 className="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]">{p.title}</h3>
                    {(p.brand || p.model) && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {[p.brand, p.model, p.year].filter(Boolean).join(" • ")}
                      </p>
                    )}
                    <div className="flex items-end justify-between pt-1">
                      <div className="text-gold font-display text-sm tracking-wider">
                        {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
                      </div>
                      {p.city && (
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin className="size-3" /> {p.city}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <OemRichContent data={{
          oem: normalized,
          vehicles: extras.vehicles,
          engineCodes: extras.engine_codes,
          supplierBrands: extras.supplier_brands,
          categories: extras.categories,
          equivalents,
          total: extras.total || parts.length,
        }} />

        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-3.5" /> Anasayfa
        </Link>
      </div>
    </div>
  );
}
