import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, getSitemapParts, getSitemapRequests } from "@/lib/seo.functions";

const STATIC_PATHS = ["/", "/auth", "/requests", "/sell"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const parts = await getSitemapParts();
        const today = new Date().toISOString().slice(0, 10);
        const staticUrls = STATIC_PATHS.map((p) => [
          "  <url>",
          `    <loc>${SITE_URL}${p}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          `    <changefreq>${p === "/" ? "daily" : "weekly"}</changefreq>`,
          `    <priority>${p === "/" ? "1.0" : "0.7"}</priority>`,
          "  </url>",
        ].join("\n"));
        const partUrls = parts.map((p) => [
          "  <url>",
          `    <loc>${SITE_URL}/parts/${p.id}</loc>`,
          `    <lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod>`,
          "    <changefreq>weekly</changefreq>",
          "    <priority>0.8</priority>",
          "  </url>",
        ].join("\n"));

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...staticUrls,
          ...partUrls,
          `</urlset>`,
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
