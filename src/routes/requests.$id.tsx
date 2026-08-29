import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Calendar, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SafePartImage } from "@/components/SafePartImage";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/requests/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("open_part_requests")
      .select("id,part_name,search_query,oem_code,engine_code,brand,model,year,category,city,description,photos,status,created_at")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const url = `https://www.tasitsan.com.tr/requests/${params.id}`;
    if (!loaderData) {
      return {
        meta: [
          { title: "Talep — Taşıtsan Parça Borsası" },
          { name: "robots", content: "noindex,follow" },
          { property: "og:url", content: url },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const title = `${loaderData.part_name || loaderData.search_query || "Parça"} aranıyor` +
      (loaderData.brand ? ` — ${loaderData.brand}${loaderData.model ? " " + loaderData.model : ""}` : "") +
      " | Taşıtsan";
    const descBits = [
      loaderData.part_name || loaderData.search_query,
      loaderData.brand,
      loaderData.model,
      loaderData.year,
      loaderData.oem_code && `OEM: ${loaderData.oem_code}`,
      loaderData.engine_code && `Motor: ${loaderData.engine_code}`,
      loaderData.city,
    ].filter(Boolean).join(" · ");
    const description = (loaderData.description || descBits || "Taşıtsan parça talep havuzu").slice(0, 160);
    const keywords = [
      loaderData.part_name, loaderData.brand, loaderData.model, loaderData.oem_code,
      loaderData.engine_code, loaderData.category, loaderData.city, "parça talebi", "Taşıtsan",
    ].filter(Boolean).join(", ");
    const image = loaderData.photos?.[0];
    const ld = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      datePublished: loaderData.created_at,
      mainEntityOfPage: url,
      ...(image ? { image: [image] } : {}),
      author: { "@type": "Organization", name: "Taşıtsan Parça Borsası" },
      publisher: {
        "@type": "Organization",
        name: "Taşıtsan Parça Borsası",
        logo: { "@type": "ImageObject", url: "https://www.tasitsan.com.tr/icon-512.png" },
      },
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "keywords", content: keywords },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image ? [
          { property: "og:image", content: image },
          { name: "twitter:image", content: image },
        ] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },

  errorComponent: ({ error }) => {
    console.error("[talep] load failed", error);
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center text-muted-foreground">
        Talep şu anda yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    );
  },

  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <p className="font-display text-lg mb-2">Talep bulunamadı veya kapatılmış.</p>
        <Link to="/requests" className="text-gold text-sm">← Talep Havuzu</Link>
      </div>
    </div>
  ),
  component: RequestDetailPage,
});

function RequestDetailPage() {
  const r = Route.useLoaderData();
  const title = r.part_name || r.search_query || "Parça talebi";

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/requests" className="size-9 rounded-full bg-card grid place-items-center">
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="font-display text-base tracking-wide truncate">{title}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {r.photos?.[0] && (
          <div className="rounded-xl overflow-hidden bg-card border border-border aspect-[4/3]">
            <SafePartImage images={r.photos} alt={title} width={800} />
          </div>
        )}

        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="font-display text-lg leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.brand && <span><Tag className="size-3 inline mr-0.5" />{r.brand} {r.model} {r.year}</span>}
            {r.city && <span><MapPin className="size-3 inline mr-0.5" />{r.city}</span>}
            {r.created_at && <span><Calendar className="size-3 inline mr-0.5" />{new Date(r.created_at).toLocaleDateString("tr-TR")}</span>}
          </p>
          {(r.oem_code || r.engine_code) && (
            <p className="text-[11px] font-mono text-muted-foreground/90">
              {r.oem_code && <>OEM: {r.oem_code}</>}
              {r.oem_code && r.engine_code && " · "}
              {r.engine_code && <>Motor: {r.engine_code}</>}
            </p>
          )}
          {r.category && (
            <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-gold/40 text-gold">
              {r.category}
            </span>
          )}
          {r.description && (
            <p className="text-sm text-foreground/90 leading-relaxed pt-2 border-t border-border/50 mt-2">
              {r.description}
            </p>
          )}
        </section>

        <div className="bg-card border border-gold/30 rounded-xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold">Bu parçayı sağlayabilir misin?</p>
          <p className="text-xs text-muted-foreground">Satıcı olarak giriş yap, Talep Havuzu'ndan teklif ver.</p>
          <Button asChild className="bg-gold-gradient text-gold-foreground font-semibold">
            <Link to="/requests">Talep Havuzuna Git</Link>
          </Button>
        </div>

      </main>

    </div>
  );
}
