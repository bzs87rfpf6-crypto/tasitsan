import { createFileRoute } from "@tanstack/react-router";
import {
  SITE_URL,
  getSitemapPartsPage,
  getSitemapPartsCount,
  getSitemapRequests,
  PRODUCTS_SITEMAP_PAGE_SIZE,
} from "@/lib/seo.functions";
import { getOemSitemapCount, getOemSitemapPage } from "@/lib/oem-seo.functions";
import { getSitemapStok } from "@/lib/stok-public.functions";
import { slugifyOem } from "@/lib/part-slug";
import { partUrl } from "@/lib/site-url";
import { CATEGORY_SLUGS } from "@/lib/category-seo.functions";
import { getBrandIndex, brandSlug } from "@/lib/brand-seo.functions";
import { listIndexableLandingPages } from "@/lib/model-seo.functions";



const STATIC_PATHS = ["/", "/parts", "/requests", "/sell", "/urgent", "/insights", "/stok", "/agir-vasita-parcalari", "/hakkimizda", "/iletisim", "/iade-politikasi"];

function xmlResponse(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}

// Bilinmeyen / artık var olmayan sitemap parçaları için 500 yerine temiz 404.
function xmlNotFound() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
    {
      status: 404,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

function esc(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeDate(v: unknown, fallback: string) {
  if (typeof v !== "string" && !(v instanceof Date)) return fallback;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

function wrap(urls: string[]) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}


export const Route = createFileRoute("/sitemaps/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params.name;
        if (!raw.endsWith(".xml")) return xmlNotFound();
        const name = raw.slice(0, -4);
        const today = new Date().toISOString().slice(0, 10);

        if (name === "static") {
          const urls = STATIC_PATHS.map((p) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}${p}</loc>`,
              `    <lastmod>${today}</lastmod>`,
              `    <changefreq>${p === "/" ? "daily" : "weekly"}</changefreq>`,
              `    <priority>${p === "/" ? "1.0" : "0.7"}</priority>`,
              "  </url>",
            ].join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        if (name === "requests") {
          const reqs = await getSitemapRequests();
          const urls = reqs.map((r) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}/requests/${r.id}</loc>`,
              `    <lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod>`,
              "    <changefreq>daily</changefreq>",
              "    <priority>0.6</priority>",
              "  </url>",
            ].join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        if (name === "stok") {
          const stoks = await getSitemapStok();
          const urls = stoks.map((s) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}/stok/${s.id}</loc>`,
              `    <lastmod>${new Date(s.updated_at).toISOString().slice(0, 10)}</lastmod>`,
              "    <changefreq>daily</changefreq>",
              "    <priority>0.7</priority>",
              "  </url>",
            ].join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        if (name === "categories") {
          const today = new Date().toISOString().slice(0, 10);
          const { listIndexableCategorySlugs } = await import("@/lib/category-quality.functions");
          const indexable = await listIndexableCategorySlugs().catch(() => []);
          // Fallback: if the quality table is empty (never backfilled), emit
          // the curated set so we never ship an empty sitemap.
          const slugs = indexable.length > 0
            ? indexable.map((r) => ({ slug: r.slug, lastmod: r.updated_at.slice(0, 10) }))
            : Object.keys(CATEGORY_SLUGS).map((slug) => ({ slug, lastmod: today }));
          const urls = slugs.map(({ slug, lastmod }) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}/kategori/${slug}</loc>`,
              `    <lastmod>${lastmod}</lastmod>`,
              "    <changefreq>daily</changefreq>",
              "    <priority>0.8</priority>",
              "  </url>",
            ].join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        const productMatch = name.match(/^products-(\d+)$/);
        if (productMatch) {
          const page = Number(productMatch[1]);
          const total = await getSitemapPartsCount();
          const pageCount = Math.max(1, Math.ceil(total / PRODUCTS_SITEMAP_PAGE_SIZE));
          if (!Number.isFinite(page) || page < 1 || page > pageCount) return xmlNotFound();
          const parts = await getSitemapPartsPage({ data: { page } });
          const urls: string[] = [];
          for (const p of parts) {
            try {
              if (!p || !p.id) continue;
              // Sitemap'e YALNIZCA kanonik slug'ı olan ürünler girer.
              // buildPartParam fallback'i (OEM+başlık) canonical'dan farklı
              // olabildiği için sitemap 3xx URL üretiyordu; artık kullanılmıyor.
              const slug = (p.seo_slug ?? "").trim();
              if (!slug) continue;
              urls.push(
                [
                  "  <url>",
                  `    <loc>${esc(partUrl(slug))}</loc>`,
                  `    <lastmod>${safeDate(p.updated_at, today)}</lastmod>`,
                  "    <changefreq>weekly</changefreq>",
                  "    <priority>0.8</priority>",
                  "  </url>",
                ].join("\n"),
              );

            } catch (err) {
              console.error("sitemap: skipped invalid part", p?.id, err);
            }
          }
          return xmlResponse(wrap(urls));
        }

        const oemMatch = name.match(/^oem-(\d+)$/);
        if (oemMatch) {
          const page = Number(oemMatch[1]);
          const meta = await getOemSitemapCount();
          if (page < 1 || page > meta.pageCount) return xmlNotFound();
          const rows = await getOemSitemapPage({ data: { page } });

          const urls = rows.map((r) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}/oem/${slugifyOem(r.oem)}</loc>`,
              r.last_updated
                ? `    <lastmod>${new Date(r.last_updated).toISOString().slice(0, 10)}</lastmod>`
                : "",
              "    <changefreq>weekly</changefreq>",
              "    <priority>0.6</priority>",
              "  </url>",
            ].filter(Boolean).join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        if (name === "brands") {
          const brands = await getBrandIndex().catch(() => []);
          // Kanonik ile birebir aynı slug (TS tarafı) kullanılır; aksi hâlde
          // Google "Yönlendirmeli / kanonik farklı" olarak işaretliyor.
          const urls = brands.filter((b) => b.total > 0).map((b) =>
            [
              "  <url>",
              `    <loc>${esc(`${SITE_URL}/marka/${brandSlug(b.brand)}`)}</loc>`,
              b.last_updated
                ? `    <lastmod>${new Date(b.last_updated).toISOString().slice(0, 10)}</lastmod>`
                : "",
              "    <changefreq>daily</changefreq>",
              "    <priority>0.7</priority>",
              "  </url>",
            ].filter(Boolean).join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        if (name === "landings") {
          const rows = await listIndexableLandingPages().catch(() => []);
          const urls = rows.map((r) =>
            [
              "  <url>",
              `    <loc>${SITE_URL}/marka/${r.slug}</loc>`,
              r.last_scored_at
                ? `    <lastmod>${new Date(r.last_scored_at).toISOString().slice(0, 10)}</lastmod>`
                : "",
              "    <changefreq>weekly</changefreq>",
              `    <priority>${r.kind === "brand_model" ? "0.75" : "0.65"}</priority>`,
              "  </url>",
            ].filter(Boolean).join("\n"),
          );
          return xmlResponse(wrap(urls));
        }

        return xmlNotFound();


      },
    },
  },
});
