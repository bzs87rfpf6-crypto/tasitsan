import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import type { ExternalOemPublicResult } from "@/lib/external-oem.server";

export type { ExternalOemPublicResult };

/**
 * Herkese açık: bir OEM için harici tedarikçi (OnlineParça) sonucunu döndürür.
 * Alış fiyatı (supplier_cost_price) ASLA bu yanıtta yer almaz.
 */
export const lookupExternalOem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ oem: z.string().min(3).max(60), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ result: ExternalOemPublicResult | null; error: string | null }> => {
    try {
      const { lookupExternalOemServer } = await import("./external-oem.server");
      if (data.force) return await lookupExternalOemServer(data.oem, true);
      // 30 dk sonuç önbelleği + eş zamanlı istek birleştirme (doğrulama mantığı değişmez).
      const { cachedOemLookup } = await import("./oem-lookup-cache.server");
      return await cachedOemLookup(data.oem, async () => {
        const r = await lookupExternalOemServer(data.oem, false);
        return { result: r.result, error: r.error };
      });
    } catch (err) {
      // Tedarikçi hatası Taşıtsan OEM aramasını bozmaz.
      return { result: null, error: err instanceof Error ? err.message : "Tedarikçi sorgusu başarısız" };
    }
  });

type AuthedSupabase = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  await assertOwnerAdmin(context.supabase as AuthedSupabase, context.userId);
}

/** Admin: kâr oranı değişince harici ürünlerin satış fiyatlarını yeniden hesapla. */
export const recalcSupplierPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ supplierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { recalcSupplierPricesServer } = await import("./external-oem.server");
    return await recalcSupplierPricesServer(data.supplierId);
  });

/**
 * Herkese açık: harici tedarikçi sonucunu sepete eklenebilir gerçek bir Taşıtsan ürününe dönüştürür.
 * Yanıt yalnızca part_id / satış fiyatı içerir; alış fiyatı asla dönmez.
 */
export const materializeExternalPart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ oem: z.string().min(3).max(60), source: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ part_id: string | null; price: number | null; title: string | null; error: string | null }> => {
    try {
      // Oturum varsa tetikleyen kullanıcı güvenli şekilde (bearer doğrulanarak) çözümlenir;
      // misafir kullanıcı için null kalır ve akış bozulmaz.
      let userId: string | null = null;
      try {
        const { getRequestHeader } = await import("@tanstack/react-start/server");
        const auth = getRequestHeader("authorization");
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (auth?.startsWith("Bearer ") && url && key) {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
          const { data: u } = await sb.auth.getUser(auth.slice(7));
          userId = u?.user?.id ?? null;
        }
      } catch {
        userId = null;
      }

      const { materializeExternalPartServer } = await import("./external-oem.server");
      return await materializeExternalPartServer(data.oem, { userId, source: data.source ?? "cart_add" });
    } catch (err) {
      return { part_id: null, price: null, title: null, error: err instanceof Error ? err.message : "İşlem başarısız" };
    }
  });
