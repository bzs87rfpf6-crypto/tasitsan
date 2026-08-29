import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getCategoryLanding, CATEGORY_SLUGS } from "@/lib/category-seo.functions";
import { buildCategoryDescription, buildCategoryFaq } from "@/lib/category-landing-content";
import { buildPartParam } from "@/lib/part-slug";
import { SafePartImage } from "@/components/SafePartImage";
import { MapPin, ArrowLeft, ChevronRight } from "lucide-react";

const SITE = "https://www.tasitsan.com.tr";

export const Route = createFileRoute("/kategori/$slug")({
  loader: async ({ params }) => {
    const result = await getCategoryLanding({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return { meta: [{ title: "Kategori — Taşıtsan" }, { name: "robots", content: "noindex,follow" }] };
    }
    // İnce içerik eşiği: 6'dan az ilan varsa dizine alma (sitemap ile aynı eşik).
    const isIndexable = (loaderData.data.total ?? 0) >= 6;
    const url = `${SITE}/kategori/${loaderData.slug}`;
    const c = loaderData.category;
    const title = `${c} Yedek Parça | OEM Numaraları ve Fiyatlar | Taşıtsan`;
    const desc = `${c} kategorisindeki ${loaderData.data.total} yedek parça ilanı, popüler OEM kodları ve doğrulanmış satıcılar Taşıtsan Parça Borsası'nda.`;

    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Anasayfa", item: SITE },
        { "@type": "ListItem", position: 2, name: "Kategoriler", item: `${SITE}/parts` },
        { "@type": "ListItem", position: 3, name: c, item: url },
      ],
    };
    const collectionLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      url,
      name: title,
      description: desc,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: loaderData.data.total,
        itemListElement: loaderData.data.top_products.slice(0, 12).map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE}/parts/${buildPartParam(p)}`,
          name: p.title,
        })),
      },
    };
    const faq = buildCategoryFaq({
      category: c, total: loaderData.data.total,
      brands: loaderData.data.brands, popularOems: loaderData.data.popular_oems,
    });
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question", name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        {
          name: "robots",
          content: isIndexable
            ? "index,follow,max-image-preview:large,max-snippet:-1"
            : "noindex,follow",
        },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
        { type: "application/ld+json", children: JSON.stringify(collectionLd) },
        { type: "application/ld+json", children: JSON.stringify(faqLd) },
      ],
    };
  },
  component: CategoryPage,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center text-muted-foreground">
      <div className="space-y-3">
        <p>Kategori bulunamadı.</p>
        <Link to="/" className="text-gold">← Anasayfa</Link>
        <div className="text-xs mt-4">
          Geçerli kategoriler: {Object.values(CATEGORY_SLUGS).join(", ")}
        </div>
      </div>
    </div>
  ),
});

function CategoryPage() {
  const { slug, category, data } = Route.useLoaderData();
  const description = buildCategoryDescription({
    category, total: data.total, brands: data.brands, popularOems: data.popular_oems,
  });
  const faqs = buildCategoryFaq({
    category, total: data.total, brands: data.brands, popularOems: data.popular_oems,
  });

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-4 lg:pt-8 space-y-6">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-gold">Anasayfa</Link>
          <ChevronRight className="size-3" />
          <Link to="/parts" className="hover:text-gold">Kategoriler</Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{category}</span>
        </nav>

        <header className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold">Kategori</div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-wide">
            {category} Yedek Parçaları
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {description.replace(/\*\*/g, "")}
          </p>
        </header>

        {data.popular_oems.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Popüler OEM Kodları</h2>
            <div className="flex flex-wrap gap-1.5">
              {data.popular_oems.map((oem: string) => (
                <a key={oem}
                  href={`/oem/${encodeURIComponent(oem.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}`}
                  className="font-mono text-xs px-2.5 py-1 rounded-md bg-background border border-gold/30 text-gold hover:bg-gold/10">
                  {oem}
                </a>
              ))}
            </div>
          </section>
        )}

        {data.top_products.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              En Çok Görüntülenen {category} İlanları
            </h2>
            <ProductGrid items={data.top_products} />
          </section>
        )}

        {data.recent_products.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Son Eklenen {category} İlanları
            </h2>
            <ProductGrid items={data.recent_products} />
          </section>
        )}

        {data.brands.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Bu Kategoride Markalar</h2>
            <div className="flex flex-wrap gap-1.5">
              {data.brands.map((b: string) => (
                <span key={b} className="text-xs px-2.5 py-1 rounded-md bg-background border border-border">{b}</span>
              ))}
            </div>
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-base font-display tracking-wide">Sık Sorulan Sorular</h2>
          {faqs.map((f, i) => (
            <details key={i} className="text-sm">
              <summary className="cursor-pointer font-semibold py-1">{f.q}</summary>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>

        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-3.5" /> Anasayfa
        </Link>
      </div>
    </div>
  );
}

function ProductGrid({ items }: { items: Array<{ id: string; title: string; seo_slug: string | null; brand: string | null; model: string | null; year: number | null; oem_code: string | null; price: number | null; city: string | null; photos: string[] | null }> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((p) => (
        <Link key={p.id} to="/parts/$id" params={{ id: buildPartParam(p) }}
          className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-gold transition-colors">
          <div className="aspect-square bg-secondary relative overflow-hidden">
            <SafePartImage images={p.photos} alt={`${p.oem_code ?? ""} ${p.title}`.trim()}
              width={420} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              brand={p.brand} title={p.title} oemCode={p.oem_code} placeholderSize="md" />
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
  );
}
