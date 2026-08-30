// Ana sayfanın public veri akışları için sunucu tarafı yedek (fallback).
//
// Tarayıcı istemcisi (VITE_SUPABASE_*) build sırasında tanımlı değilse veya
// ağ/CORS nedeniyle başarısız olursa, aynı SECURITY DEFINER RPC'leri sunucudan
// publishable key ile çağırırız. Service-role zorunluluğu yoktur.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Sunucudan çağrılmasına izin verilen public RPC'ler (allowlist). */
const PUBLIC_RPCS = ["platform_stats", "home_new_feed", "home_activity_feed"] as const;

const ArgsSchema = z.object({
  name: z.enum(PUBLIC_RPCS),
  args: z
    .object({
      _vehicle_class: z.string().max(40).optional(),
      _limit: z.number().int().min(1).max(60).optional(),
      _offset: z.number().int().min(0).max(100000).optional(),
    })
    .optional(),
});

export const callPublicHomeRpc = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ArgsSchema.parse(d))
  .handler(async ({ data }): Promise<{ json: string | null }> => {
    const { getServerReadClient } = await import("@/lib/supabase-admin.server");
    const client = getServerReadClient();
    if (!client) return { json: null };
    const { data: row, error } = await (client as unknown as {
      rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc(data.name, data.args ?? {});
    if (error) return { json: null };
    return { json: row == null ? null : JSON.stringify(row) };
  });

const BootstrapSchema = z.object({
  vehicleClass: z.enum(["automobile", "heavy_vehicle", "construction", "agriculture"]).optional(),
  limit: z.number().int().min(1).max(60).optional(),
});

/**
 * SSR başlangıç verisi: ana sayfa istatistikleri + yeni ürün vitrini.
 * Service-role gerektirmez; `getServerReadClient()` service-role yoksa
 * publishable key ile SECURITY DEFINER RPC'leri çağırır.
 */
export const getHomeBootstrap = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => BootstrapSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<{ json: string | null }> => {
    const { getServerReadClient } = await import("@/lib/supabase-admin.server");
    const client = getServerReadClient() as unknown as {
      rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    } | null;
    if (!client) return { json: null };
    const vc = data.vehicleClass ?? "automobile";
    const limit = data.limit ?? 24;
    const [statsRes, feedRes] = await Promise.all([
      client.rpc("platform_stats").catch(() => ({ data: null, error: true })),
      client
        .rpc("home_new_feed", { _vehicle_class: vc, _limit: limit, _offset: 0 })
        .catch(() => ({ data: null, error: true })),
    ]);
    const payload = {
      vehicleClass: vc,
      stats: statsRes.error ? null : statsRes.data,
      feed: feedRes.error ? null : feedRes.data,
    };
    return { json: JSON.stringify(payload) };
  });

