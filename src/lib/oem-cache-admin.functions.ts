import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * OEM araştırma önbelleği — TTL ve geçersiz kılma sözleşmesi
 *
 * Anahtar formatı: "{tip}:v{versiyon}:{normalize_oem}"
 *   - oem:eq:v2:*  → AI eşdeğer öneriler  (TTL: 30 gün)
 *   - oem:img:v1:* → Görsel arama         (TTL: 60 gün)
 *
 * Geçersiz kılma yolları (en hafiften en ağıra):
 *   1) Kullanıcı tarafı: bileşendeki "Yeniden çek" → server fn `force: true`
 *      ile çağrılır, cache'i atlar ve yeni sonucu üst yazar.
 *   2) Admin toplu: aşağıdaki `invalidateOemCache` server fn ile bir tip
 *      önekinin tüm kayıtlarını süresi geçmiş işaretler (silmez; istatistikler
 *      korunur). Süresi geçenler bir sonraki "Görsel Bul" / "Analiz Et"de
 *      yenilenir.
 *   3) Şema kırılımı: yazı koduna v2/v3 vb. yeni bir versiyon ön eki vermek
 *      eski anahtarları otomatik olarak vurulamaz (miss) hale getirir.
 *   4) Otomatik temizlik: `purge_expired_oem_research()` haftalık cron ile
 *      7 gün önce süresi dolmuş kayıtları siler.
 */

const PREFIX_OPTIONS = ["oem:eq:", "oem:img:", "oem:eq:v2:", "oem:img:v1:"] as const;

const inputSchema = z.object({
  prefix: z.string().min(3).max(60).refine(
    (p) => p.startsWith("oem:eq") || p.startsWith("oem:img"),
    "Sadece oem:eq veya oem:img önekleri geçersiz kılınabilir.",
  ),
});

export const invalidateOemCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // RPC içinde de admin kontrolü var, burada erken hata için.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Bu işlem için yönetici yetkisi gerekir.");

    const { data: count, error } = await context.supabase.rpc("invalidate_oem_research", {
      _prefix: data.prefix,
    });
    if (error) throw new Error(error.message);
    return { invalidated: Number(count ?? 0), prefix: data.prefix };
  });

export const oemCachePrefixes = PREFIX_OPTIONS;
