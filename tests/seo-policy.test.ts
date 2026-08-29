import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SITE_ORIGIN,
  absoluteUrl,
  isPartIndexable,
  partUrl,
  ROBOTS_INDEX,
  partRobots,
} from "../src/lib/site-url";
import { canonicalHostRedirect } from "../src/lib/canonical-host";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe("merkezî SEO URL politikası", () => {
  it("kanonik origin www'lu ve tekil kaynaktan gelir", () => {
    expect(SITE_ORIGIN).toBe("https://www.tasitsan.com.tr");
  });

  it("absoluteUrl query/fragment ve sondaki slash'i temizler", () => {
    expect(absoluteUrl("/parts/abc")).toBe("https://www.tasitsan.com.tr/parts/abc");
    expect(absoluteUrl("/parts/abc?utm_source=x")).toBe("https://www.tasitsan.com.tr/parts/abc");
    expect(absoluteUrl("/parts/abc/#foto")).toBe("https://www.tasitsan.com.tr/parts/abc");
    expect(absoluteUrl("/")).toBe("https://www.tasitsan.com.tr");
  });

  it("ürün canonical URL'si sitemap URL'siyle birebir aynıdır", () => {
    const slug = "1k0615301aa-fren-diski-vw-golf";
    expect(partUrl(slug)).toBe(absoluteUrl(`/parts/${slug}`));
    expect(partUrl(slug)).toBe(`${SITE_ORIGIN}/parts/${slug}`);
  });

  it("onaylı + slug'lı gerçek ürün asla noindex olmaz (stok 0 olsa bile)", () => {
    const part = { status: "approved", seo_slug: "abc-fren-diski", stock_quantity: 0 };
    expect(isPartIndexable(part)).toBe(true);
    expect(partRobots(part)).toBe(ROBOTS_INDEX);
  });

  it("onaysız veya slug'sız kayıt indekslenmez", () => {
    expect(isPartIndexable({ status: "pending", seo_slug: "x" })).toBe(false);
    expect(isPartIndexable({ status: "approved", seo_slug: null })).toBe(false);
    expect(partRobots({ status: "pending", seo_slug: "x" })).toBe("noindex,follow");
  });
});

describe("kaynak kodu koruma kuralları", () => {
  const files = walk("src").filter((f) => !f.endsWith("routeTree.gen.ts"));

  it("hiçbir dosyada www'suz (yönlendirmeye giden) mutlak site URL'si kalmadı", () => {
    // İstisna: Search Console property eşleştirmesi eski www'suz property adını
    // tanımak zorunda (yalnızca `siteUrl` karşılaştırması, canonical üretmez).
    const bad = files.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((line) => /https:\/\/tasitsan\.com\.tr/.test(line) && !line.includes("siteUrl")),
    );
    expect(bad, `www'suz canonical üreten dosyalar: ${bad.join(", ")}`).toEqual([]);
  });

  it("ürün sitemap'i yalnızca kanonik seo_slug kullanır (fallback slug yok)", () => {
    const src = readFileSync("src/routes/sitemaps.$name.tsx", "utf8");
    expect(src).toContain("partUrl(slug)");
    expect(/buildPartParam\(/.test(src)).toBe(false);
  });

  it("ürün sayfası merkezî indeksleme politikasını kullanır", () => {
    const src = readFileSync("src/routes/parts.$id.tsx", "utf8");
    expect(src).toContain("isPartIndexable(");
    expect(src).toContain('rel: "canonical"');
  });

  it("filtreli/sayfalı liste URL'leri noindex verir", () => {
    const src = readFileSync("src/routes/parts.index.tsx", "utf8");
    expect(src).toContain('"noindex,follow"');
  });
});

describe("robots.txt", () => {
  const robots = readFileSync("public/robots.txt", "utf8");

  it("gerçek ürün/OEM/marka sayfalarını engellemez", () => {
    for (const path of ["/parts", "/oem", "/marka", "/kategori", "/stok"]) {
      expect(new RegExp(`^\\s*Disallow:\\s*${path}\\s*$`, "im").test(robots), `${path} engellenmiş`).toBe(false);
    }
  });

  it("sitemap kanonik www adresini gösterir", () => {
    expect(robots).toContain("Sitemap: https://www.tasitsan.com.tr/sitemap.xml");
    expect(/Sitemap:\s*https:\/\/tasitsan\.com\.tr/.test(robots)).toBe(false);
  });

  it("özel/teknik alanlar engellidir", () => {
    for (const path of ["/admin", "/account", "/cart", "/auth"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });
});

describe("404 / kanonik host kaynak kuralları", () => {
  it("ürün loader'ı gerçekten yok durumunda notFound() fırlatır", () => {
    const src = readFileSync("src/routes/parts.$id.tsx", "utf8");
    expect(src).toContain("throw notFound()");
    expect(src).toContain("__transient");
  });

  it("sunucu girişinde apex→www kalıcı 301 tanımlıdır", () => {
    expect(readFileSync("src/server.ts", "utf8")).toContain("canonicalHostRedirect(request)");
    const mod = readFileSync("src/lib/canonical-host.ts", "utf8");
    expect(mod).toContain("status: 301");
    expect(mod).toContain("www.tasitsan.com.tr");
  });
});

describe("kanonik host yönlendirmesi (301, tek adım)", () => {
  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

  it("apex host tek adımda 301 ile www'ya gider", () => {
    const res = canonicalHostRedirect(req("https://tasitsan.com.tr/parts?q=fren"));
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://www.tasitsan.com.tr/parts?q=fren");
  });

  it("proxy arkasındaki http isteği de 301 ile https+www olur", () => {
    const res = canonicalHostRedirect(
      req("http://localhost/parts", { "x-forwarded-host": "www.tasitsan.com.tr", "x-forwarded-proto": "http" }),
    );
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://www.tasitsan.com.tr/parts");
  });

  it("kanonik https+www isteği yönlendirilmez (loop/zincir yok)", () => {
    expect(canonicalHostRedirect(req("https://www.tasitsan.com.tr/parts"))).toBeNull();
  });

  it("preview/localhost host'ları etkilenmez", () => {
    expect(canonicalHostRedirect(req("http://localhost:8080/parts"))).toBeNull();
    expect(canonicalHostRedirect(req("https://tasitsan.lovable.app/parts"))).toBeNull();
  });
});
