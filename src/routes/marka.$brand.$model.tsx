// /marka/$brand/$model — model landing (kalite kontrollü)
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { getModelLanding, type ModelLandingPart } from "@/lib/model-seo.functions";
import { brandSlug } from "@/lib/brand-seo.functions";
import { buildPartParam } from "@/lib/part-slug";
import { COMPANY } from "@/lib/eeat-content";
import { HubLinks } from "@/components/HubLinks";

export const Route = createFileRoute("/marka/$brand/$model")({
  loader: async ({ params }) => {
    const d = await getModelLanding({
      data: { brand: decodeURIComponent(params.brand), model: decodeURIComponent(params.model) },
    });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    const d = loaderData;
    if (!d) return { meta: [{ title: "Model bulunamadı" }, { name: "robots", content: "noindex" }] };
    const canonical = `${COMPANY.url}/marka/${brandSlug(d.brand)}/${brandSlug(d.model)}`;
    const title = `${d.brand} ${d.model} Yedek Parça (${d.total.toLocaleString("tr-TR")} İlan) — Taşıtsan`;
    const desc = `${d.brand} ${d.model} için ${d.total.toLocaleString("tr-TR")} aktif ilan, ${d.unique_oems} benzersiz OEM, doğrulanmış satıcılar. Motor, fren, şanzıman ve elektrik parçaları tek panelde.`;
    const robots = d.indexable ? "index,follow,max-image-preview:large" : "noindex,follow";

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
        { name: "robots", content: robots },
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
            about: { "@type": "Vehicle", vehicleModelDate: d.model, brand: { "@type": "Brand", name: d.brand } },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: d.total,
              itemListElement: d.parts.slice(0, 10).map((p, i) => ({
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
              { "@type": "ListItem", position: 2, name: d.brand, item: `${COMPANY.url}/marka/${brandSlug(d.brand)}` },
              { "@type": "ListItem", position: 3, name: d.model, item: canonical },
            ],
          }),
        },
        ...(d.faqs.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: d.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }),
              },
            ]
          : []),
      ],
    };
  },
  component: ModelPage,
});

function ModelPage() {
  const d = Route.useLoaderData();
  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-4 lg:pt-8 space-y-6">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-gold">Anasayfa</Link>
          <ChevronRight className="size-3" />
          <Link to="/marka/$brand" params={{ brand: brandSlug(d.brand) }} className="hover:text-gold">{d.brand}</Link>
          <ChevronRight className="size-3" />
          <span className="font-mono text-foreground">{d.model}</span>
        </nav>

        <header className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-gold">Model</div>
          <h1 className="font-display text-3xl tracking-wide">{d.brand} {d.model} Yedek Parça</h1>
          <p className="text-sm text-muted-foreground">
            {d.total.toLocaleString("tr-TR")} aktif ilan • {d.unique_oems} benzersiz OEM • {d.unique_years} model yılı
          </p>
        </header>

        <section className="text-sm leading-relaxed text-foreground/90">
          <p>
            <strong>{d.brand} {d.model}</strong> araçları için Taşıtsan'da güncel yedek parça ilanları listelenmektedir.
            OEM eşleştirme, motor kodu ve yıl bilgisi ile aracınıza tam uyumlu parçayı hızla bulabilirsiniz.
            Tüm ilanlar doğrulanmış satıcılar tarafından yayınlanır.
          </p>
        </section>

        {d.categories.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg">Kategoriler</h2>
            <div className="flex flex-wrap gap-2">
              {d.categories.map((c: { slug: string; label: string; count: number }) => (
                <Link
                  key={c.slug}
                  to="/marka/$brand/$model/$category"
                  params={{ brand: brandSlug(d.brand), model: brandSlug(d.model), category: c.slug }}
                  className="px-3 py-1.5 bg-card border border-border rounded-full text-xs hover:border-gold/40"
                >
                  {c.label} <span className="text-muted-foreground">({c.count})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {d.top_oems.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg">Popüler OEM Numaraları</h2>
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {d.top_oems.map((o: { oem: string; count: number }) => (
                <span key={o.oem} className="px-2.5 py-1 bg-card border border-border rounded">
                  {o.oem} <span className="text-muted-foreground">({o.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-lg">Öne Çıkan İlanlar</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {d.parts.map((p: ModelLandingPart) => (
              <Link key={p.id} to="/parts/$id" params={{ id: buildPartParam(p) }}
                className="bg-card border border-border rounded-xl p-3 hover:border-gold/40 transition">
                <div className="aspect-square bg-muted/30 rounded-md mb-2 overflow-hidden">
                  {p.photos?.[0] && (
                    <img src={p.photos[0]} alt={p.title} width={300} height={300}
                      loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="text-xs font-semibold line-clamp-2">{p.title}</div>
                {p.oem_code && <div className="text-[10px] font-mono text-gold mt-1">{p.oem_code}</div>}
              </Link>
            ))}
          </div>
        </section>

        {d.faqs.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg">Sıkça Sorulan Sorular</h2>
            <div className="space-y-3">
              {d.faqs.map((f: { q: string; a: string }, i: number) => (
                <div key={i} className="bg-card border border-border rounded-lg p-3">
                  <div className="text-sm font-semibold">{f.q}</div>
                  <p className="text-sm text-muted-foreground mt-1">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <HubLinks
          brand={d.brand}
          model={d.model}
          category={d.category}
          oemCodes={d.top_oems.map((o: { oem: string }) => o.oem)}
        />
      </div>
    </div>
  );
}

