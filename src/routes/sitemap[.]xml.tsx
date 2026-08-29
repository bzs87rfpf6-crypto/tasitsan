import { createFileRoute } from "@tanstack/react-router";
import {
  SITE_URL,
  getSitemapPartsCount,
  getSitemapRequests,
  PRODUCTS_SITEMAP_PAGE_SIZE,
} from "@/lib/seo.functions";
import { getOemSitemapCount } from "@/lib/oem-seo.functions";
import { getSitemapStok } from "@/lib/stok-public.functions";
import { listIndexableLandingPages } from "@/lib/model-seo.functions";
import { getBrandIndex } from "@/lib/brand-seo.functions";


export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [total, reqs, stoks, oemMeta, landings, brands] = await Promise.all([
          getSitemapPartsCount(),
          getSitemapRequests().catch(() => []),
          getSitemapStok().catch(() => []),
          getOemSitemapCount().catch(() => ({ total: 0, pageSize: 5000, pageCount: 0 })),
          listIndexableLandingPages().catch(() => []),
          getBrandIndex().catch(() => []),
        ]);

        const pageCount = Math.max(1, Math.ceil(total / PRODUCTS_SITEMAP_PAGE_SIZE));
        const today = new Date().toISOString().slice(0, 10);

        const entries: string[] = [
          `  <sitemap><loc>${SITE_URL}/sitemaps/static.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          `  <sitemap><loc>${SITE_URL}/sitemaps/categories.xml</loc><lastmod>${today}</lastmod></sitemap>`,
        ];
        // Boş alt sitemap yayınlama — Google "0 URL" hatası veriyor.
        if (brands.length > 0) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/brands.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }
        if (reqs.length > 0) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/requests.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }
        if (stoks.length > 0) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/stok.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }
        for (let i = 1; i <= pageCount; i++) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/products-${i}.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }
        for (let i = 1; i <= oemMeta.pageCount; i++) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/oem-${i}.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }
        if (landings.length > 0) {
          entries.push(
            `  <sitemap><loc>${SITE_URL}/sitemaps/landings.xml</loc><lastmod>${today}</lastmod></sitemap>`,
          );
        }




        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries,
          `</sitemapindex>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});

