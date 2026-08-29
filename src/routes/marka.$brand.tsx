import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { getBrandLanding, brandSlug, type BrandLandingPart } from "@/lib/brand-seo.functions";
import { buildPartParam } from "@/lib/part-slug";
import { COMPANY } from "@/lib/eeat-content";

export const Route = createFileRoute("/marka/$brand")({
  loader: async ({ params }) => {
    // Slug doğrudan gönderilir; DB tarafı brand_slug() ile normalize eşleştirir
    // (mercedes-benz gibi tireli markalar da doğru çözülür).
    const decoded = decodeURIComponent(params.brand);
    const data = await getBrandLanding({ data: { brand: decoded } });
    if (!data || data.total === 0) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    const d = loaderData;
    if (!d) return { meta: [{ title: "Marka bulunamadı" }, { name: "robots", content: "noindex" }] };
    const canonical = `${COMPANY.url}/marka/${brandSlug(d.brand)}`;
    const title = `${d.brand} Yedek Parça (${d.total.toLocaleString("tr-TR")} İlan) — Taşıtsan`;
    const desc = `${d.brand} marka yedek parçalar: ${d.total.toLocaleString("tr-TR")} aktif ilan, OEM eşleştirme, doğrulanmış satıcılar. ${d.models.slice(0,5).map((m: { model: string }) => m.model).join(", ")} modelleri ve daha fazlası.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "website" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "robots", content: d.total >= 1 ? "index,follow,max-image-preview:large" : "noindex,follow" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description: desc,
            url: canonical,
            isPartOf: { "@type": "WebSite", name: "Taşıtsan", url: COMPANY.url },
            about: { "@type": "Brand", name: d.brand },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: d.total,
              itemListElement: d.parts.slice(0, 10).map((p: BrandLandingPart, i: number) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${COMPANY.url}/parts/${buildPartParam(p)}`,
                name: p.title,
              })),
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Anasayfa", item: `${COMPANY.url}/` },
              { "@type": "ListItem", position: 2, name: "Markalar", item: `${COMPANY.url}/parts` },
              { "@type": "ListItem", position: 3, name: d.brand, item: canonical },
            ],
          }),
        },
      ],
    };
  },
  component: BrandPage,
});

function BrandPage() {
  const d = Route.useLoaderData();
  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-4 lg:pt-8 space-y-6">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-gold">Anasayfa</Link>
          <ChevronRight className="size-3" />
          <Link to="/parts" className="hover:text-gold">Parçalar</Link>
          <ChevronRight className="size-3" />
          <span className="font-mono text-foreground">{d.brand}</span>
        </nav>

        <header className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-gold">Marka</div>
          <h1 className="font-display text-3xl tracking-wide">{d.brand} Yedek Parça</h1>
          <p className="text-sm text-muted-foreground">
            {d.total.toLocaleString("tr-TR")} aktif ilan • {d.with_photo.toLocaleString("tr-TR")} görselli
          </p>
        </header>

        <section className="space-y-2 text-sm leading-relaxed text-foreground/90">
          <p>
            <strong>{d.brand}</strong> marka araçlar için Taşıtsan'da {d.total.toLocaleString("tr-TR")} aktif ilan
            yer almaktadır. OEM numarası, motor kodu veya model seçerek aracınıza tam uyumlu yedek parçaya
            ulaşabilirsiniz. Tüm ilanlar doğrulanmış satıcılar tarafından yayımlanır; mesajlaşma ve teklif
            süreçleri Taşıtsan üzerinden güvenle yönetilir.
          </p>
        </section>

        {d.models.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg">{d.brand} Modelleri</h2>
            <div className="flex flex-wrap gap-2">
              {d.models.map((m: { model: string; count: number }) => (
                <span key={m.model}
                  className="px-3 py-1 bg-card border border-border rounded-full text-xs">
                  {m.model} <span className="text-muted-foreground">({m.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-lg">Öne Çıkan İlanlar</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {d.parts.map((p: BrandLandingPart) => (
              <Link key={p.id} to="/parts/$id" params={{ id: buildPartParam(p) }}
                className="bg-card border border-border rounded-xl p-3 hover:border-gold/40 transition">
                <div className="aspect-square bg-muted/30 rounded-md mb-2 overflow-hidden">
                  {p.photos?.[0] && (
                    <img src={p.photos[0]} alt={p.title} width={300} height={300}
                      loading="lazy" decoding="async"
                      className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="text-xs font-semibold line-clamp-2">{p.title}</div>
                {p.oem_code && <div className="text-[10px] font-mono text-gold mt-1">{p.oem_code}</div>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
