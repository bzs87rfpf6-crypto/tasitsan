import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

/**
 * Self-host doğrulaması: service-role anahtarı olmadan da çalışması gereken
 * public/read-only akışlar, service-role zorunlu client'a bağlı olmamalı.
 */
const PUBLIC_READ_MODULES = [
  "src/lib/seo-blocks.functions.ts",
  "src/lib/brand-seo.functions.ts",
  "src/lib/category-seo.functions.ts",
  "src/lib/oem-seo.functions.ts",
  "src/lib/stok-public.functions.ts",
  "src/lib/home-public.functions.ts",
];

describe("self-host public read paths", () => {
  it("public read modülleri service-role client'ı doğrudan kullanmaz", () => {
    for (const f of PUBLIC_READ_MODULES) {
      expect(read(f), f).not.toContain("integrations/supabase/client.server");
    }
  });

  it("ana sayfa RPC'leri dayanıklı sarmalayıcıdan geçer", () => {
    const idx = read("src/routes/index.tsx");
    expect(idx).toContain("homePublicRpc");
    expect(idx).not.toContain('rpc("home_new_feed"');
    expect(read("src/lib/platform-stats.ts")).toContain('homePublicRpc<Record<string, unknown>>("platform_stats")');
    expect(read("src/components/home/LiveActivityFeed.tsx")).toContain('homePublicRpc<ActivityItem[]>("home_activity_feed"');
  });

  it("ana sayfa loader'ı SSR public verisini service-role'süz çeker", () => {
    const idx = read("src/routes/index.tsx");
    expect(idx).toContain("getHomeBootstrap");
    expect(idx).toContain("primePlatformStats");
    const fn = read("src/lib/home-public.functions.ts");
    expect(fn).toContain("export const getHomeBootstrap");
    expect(fn).toContain('client.rpc("platform_stats")');
    expect(fn).toContain('.rpc("home_new_feed"');
  });

  it("sunucu fallback'i yalnızca izin verilen public RPC'leri çağırır", () => {
    const fn = read("src/lib/home-public.functions.ts");
    expect(fn).toContain('const PUBLIC_RPCS = ["platform_stats", "home_new_feed", "home_activity_feed"] as const;');
    expect(fn).toContain("getServerReadClient");
    expect(fn).not.toContain("requireServiceRoleClient");
  });

  it("gerçek admin yazma işlemleri service-role zorunluluğunu korur", () => {
    expect(read("src/lib/product-seo-meta.functions.ts")).toContain('requireServiceRoleClient("upsertProductSeoMeta")');
  });

  it("okuma client'ı service-role yoksa publishable anahtara düşer", () => {
    const s = read("src/lib/supabase-admin.server.ts");
    expect(s).toContain("export const serverReadClient");
    expect(s).toContain("getServiceRoleClient() ?? getPublicServerClient()");
  });
});
