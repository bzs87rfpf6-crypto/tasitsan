import { beforeAll, describe, expect, it } from "vitest";

/**
 * SSR HTML seviyesinde SEO doğrulaması (client-side head değil, gerçek sunucu çıktısı).
 * Varsayılan olarak yerel dev sunucusuna gider.
 */
const BASE_URL = (process.env["SITEMAP_TEST_BASE_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
const CANONICAL_ORIGIN = "https://www.tasitsan.com.tr";

async function html(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  const body = (await res.text()).replace(/\0/g, "");
  return { status: res.status, location: res.headers.get("location") ?? "", body };
}

function canonicalOf(body: string) {
  return /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(body)?.[1] ?? null;
}
function robotsOf(body: string) {
  return /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i.exec(body)?.[1] ?? null;
}

describe("ürün SEO route politikası", () => {
  let slug = "";

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/sitemaps/products-1.xml`);
    const xml = await res.text();
    const loc = /<loc>([^<]+)<\/loc>/.exec(xml)?.[1] ?? "";
    slug = loc.split("/parts/")[1] ?? "";
  });

  it("sitemap ürün URL'leri kanonik www origin'i kullanır", async () => {
    const xml = await (await fetch(`${BASE_URL}/sitemaps/products-1.xml`)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs.slice(0, 50)) {
      expect(loc.startsWith(`${CANONICAL_ORIGIN}/parts/`), `kanonik olmayan URL: ${loc}`).toBe(true);
    }
  });

  it("aktif ürün sayfası 200 + index,follow + self-canonical döner", async () => {
    expect(slug).not.toBe("");
    const page = await html(`/parts/${slug}`);
    expect(page.status).toBe(200);
    expect(robotsOf(page.body)).toMatch(/^index,follow/);
    expect(canonicalOf(page.body)).toBe(`${CANONICAL_ORIGIN}/parts/${slug}`);
  });

  it("var olmayan ürün URL'si noindex verir (soft-404 yok)", async () => {
    const page = await html("/parts/bu-urun-kesinlikle-yok-999999");
    expect(robotsOf(page.body)).toBe("noindex,follow");
  });

  it("özel alanlar (admin/auth/cart/account) noindex", async () => {
    for (const p of ["/admin", "/auth", "/cart", "/account"]) {
      const page = await html(p);
      const robots = robotsOf(page.body) ?? "";
      expect(robots.startsWith("noindex"), `${p} robots=${robots}`).toBe(true);
    }
  });

  it("filtreli liste URL'si noindex, temiz liste index", async () => {
    const clean = await html("/parts");
    expect(robotsOf(clean.body)).toMatch(/^index,follow/);
    expect(canonicalOf(clean.body)).toBe(`${CANONICAL_ORIGIN}/parts`);
    const filtered = await html("/parts?q=fren&page=3");
    expect(robotsOf(filtered.body)).toBe("noindex,follow");
    expect(canonicalOf(filtered.body)).toBe(`${CANONICAL_ORIGIN}/parts`);
  });
});

describe("silinmiş ürün / kanonik host politikası", () => {
  it("olmayan ürün URL'si gerçek HTTP 404 döner (soft-404 yok)", async () => {
    const res = await fetch(`${BASE_URL}/parts/bu-urun-kesinlikle-yok-999999`, { redirect: "manual" });
    expect(res.status).toBe(404);
    const body = (await res.text()).replace(/\0/g, "");
    expect(robotsOf(body)).toBe("noindex,follow");
  });

  it("sitemap'teki her ürün URL'si 200 + index,follow + self-canonical", async () => {
    const xml = await (await fetch(`${BASE_URL}/sitemaps/products-1.xml`)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).slice(0, 5);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const path = loc.replace(CANONICAL_ORIGIN, "");
      const page = await html(path);
      expect(page.status, `${path} status=${page.status}`).toBe(200);
      expect(robotsOf(page.body), `${path} robots`).toMatch(/^index,follow/);
      expect(canonicalOf(page.body)).toBe(`${CANONICAL_ORIGIN}${path}`);
    }
  });
});
