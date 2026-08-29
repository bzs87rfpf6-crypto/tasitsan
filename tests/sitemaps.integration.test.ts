import { describe, expect, it, beforeAll } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Sitemap entegrasyon testleri.
 *
 * Hedef: her sitemap endpoint'i
 *  - beklenen HTTP kodunu (200 / 404) döndürsün
 *  - Content-Type olarak XML döndürsün
 *  - geçerli (parse edilebilir) XML gövdesi döndürsün
 *  - 500 ASLA dönmesin
 *
 * Varsayılan olarak yerel dev sunucusuna gider; SITEMAP_TEST_BASE_URL ile
 * (örn. https://tasitsan.com.tr) canlıya da yöneltilebilir.
 */
const BASE_URL = (process.env["SITEMAP_TEST_BASE_URL"] ?? "http://localhost:8080").replace(/\/$/, "");

type Fetched = { status: number; contentType: string; body: string };

async function get(path: string): Promise<Fetched> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { accept: "application/xml" } });
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: await res.text(),
  };
}

function expectXmlResponse(res: Fetched, path: string) {
  expect(res.contentType.toLowerCase(), `${path} Content-Type`).toContain("xml");
  const valid = XMLValidator.validate(res.body);
  expect(valid, `${path} geçerli XML değil: ${JSON.stringify(valid)}`).toBe(true);
}

const parser = new XMLParser({ ignoreAttributes: false });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

describe("sitemap endpoints", () => {
  let indexRes: Fetched;
  let childPaths: string[] = [];

  beforeAll(async () => {
    indexRes = await get("/sitemap.xml");
    if (indexRes.status === 200 && XMLValidator.validate(indexRes.body) === true) {
      const doc = parser.parse(indexRes.body) as {
        sitemapindex?: { sitemap?: { loc: string } | { loc: string }[] };
      };
      childPaths = asArray(doc.sitemapindex?.sitemap)
        .map((s) => s.loc)
        .filter((loc): loc is string => typeof loc === "string" && loc.length > 0)
        .map((loc) => new URL(loc).pathname);
    }
  });

  it("/sitemap.xml 200 + geçerli sitemapindex döndürür", () => {
    expect(indexRes.status).toBe(200);
    expectXmlResponse(indexRes, "/sitemap.xml");
    expect(indexRes.body).toContain("<sitemapindex");
    expect(childPaths.length).toBeGreaterThan(0);
  });

  it("index yalnızca https ve site alan adındaki mutlak URL'leri listeler", () => {
    const locs = [...indexRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc.startsWith("https://"), `mutlak https bekleniyordu: ${loc}`).toBe(true);
    }
  });

  it("index'te listelenen her sitemap parçası 200 + geçerli urlset döndürür", async () => {
    expect(childPaths.length).toBeGreaterThan(0);
    for (const path of childPaths) {
      const res = await get(path);
      expect(res.status, `${path} HTTP kodu`).toBe(200);
      expectXmlResponse(res, path);
      expect(res.body, `${path} urlset içermiyor`).toContain("<urlset");
    }
  });

  it("ürün sitemap parçaları geçerli /parts/<slug> URL'leri içerir (UUID/query yok)", async () => {
    const productPaths = childPaths.filter((p) => /products-\d+\.xml$/.test(p));
    expect(productPaths.length).toBeGreaterThan(0);
    const uuid = /\/parts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const path of productPaths) {
      const res = await get(path);
      expect(res.status, `${path} HTTP kodu`).toBe(200);
      expectXmlResponse(res, path);
      const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      expect(locs.length, `${path} boş`).toBeGreaterThan(0);
      for (const loc of locs) {
        expect(loc.startsWith("https://"), `mutlak URL değil: ${loc}`).toBe(true);
        expect(loc.includes("?"), `query parametresi var: ${loc}`).toBe(false);
        expect(uuid.test(loc), `UUID URL sitemap'te: ${loc}`).toBe(false);
      }
      // Ham & karakteri escape edilmiş olmalı
      expect(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(res.body), `${path} escape edilmemiş & içeriyor`).toBe(false);
    }
  });

  it("var olmayan ürün parçaları 500 değil 404 + XML döndürür", async () => {
    const existing = childPaths.filter((p) => /products-\d+\.xml$/.test(p)).length;
    const missing = [existing + 1, existing + 2, 99];
    for (const n of missing) {
      const path = `/sitemaps/products-${n}.xml`;
      const res = await get(path);
      expect(res.status, `${path} HTTP kodu`).toBe(404);
      expectXmlResponse(res, path);
    }
  });

  it("bilinmeyen sitemap adları 500 değil 404 döndürür", async () => {
    for (const path of ["/sitemaps/bilinmeyen.xml", "/sitemaps/oem-9999.xml", "/sitemaps/products-0.xml"]) {
      const res = await get(path);
      expect(res.status, `${path} HTTP kodu`).toBe(404);
      expectXmlResponse(res, path);
    }
  });

  it("hiçbir sitemap endpoint'i 5xx döndürmez", async () => {
    const paths = [
      "/sitemap.xml",
      ...childPaths,
      "/sitemaps/static.xml",
      "/sitemaps/categories.xml",
      "/sitemaps/brands.xml",
      "/sitemaps/landings.xml",
      "/sitemaps/requests.xml",
      "/sitemaps/stok.xml",
      "/sitemaps/products-4.xml",
      "/sitemaps/gecersiz.xml",
    ];
    for (const path of [...new Set(paths)]) {
      const res = await get(path);
      expect(res.status, `${path} 5xx döndürdü`).toBeLessThan(500);
    }
  });

  it("/robots.txt 200 döner ve sitemap'i engellemez", async () => {
    const res = await fetch(`${BASE_URL}/robots.txt`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("user-agent");
    expect(/^\s*Disallow:\s*\/sitemap/im.test(body)).toBe(false);
  });
});
