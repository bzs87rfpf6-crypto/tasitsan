/**
 * OEM Cache — on-demand görsel çözücü.
 *
 * Çalışma şekli:
 *   1) İstenen OEM için oem_image_library'ye bak. Varsa (reddedilmemiş)
 *      doğrudan dön. use_count + last_used_at güncellenir.
 *   2) Yoksa Firecrawl tabanlı resolveOemImage çalışır; başarılı görsel
 *      Supabase Storage'a yüklenir ve oem_image_library'ye eklenir.
 *
 * Toplu kuyruk yok. Sadece kullanıcı sayfası açtığında tetiklenir.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  oem: z.string().trim().min(2).max(60),
  brand: z.string().trim().max(60).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
});

export interface OemCacheImage {
  id: string;
  image_url: string;
  source_type: string;
  confidence: number;
  origin: "cache" | "fetched";
}

export type OemCacheResult =
  | { ok: true; image: OemCacheImage }
  | { ok: false; reason: string };

function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-./_]+/g, "");
}

export const getOrFetchOemCachedImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<OemCacheResult> => {
    const { createClient } = await import("@supabase/supabase-js");
    const sbPublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const oemNorm = normalizeOem(data.oem);
    if (!oemNorm) return { ok: false, reason: "empty oem" };

    // 1) Cache lookup — en iyi görseli al (primary > confidence)
    const { data: cached } = await sbPublic
      .from("oem_image_library")
      .select("id, image_url, source_type, confidence, is_primary")
      .eq("oem_normalized", oemNorm)
      .order("is_primary", { ascending: false })
      .order("confidence", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      const row = cached[0];
      // Kullanım sayacını arka planda güncelle (await edilmiyor)
      void sbPublic.rpc("touch_oem_image", { _id: row.id }).then(() => {/* noop */});
      return {
        ok: true,
        image: {
          id: row.id,
          image_url: row.image_url,
          source_type: row.source_type,
          confidence: row.confidence,
          origin: "cache",
        },
      };
    }

    // 2) Yoksa Firecrawl ile bul ve havuza ekle
    const { resolveOemImage } = await import("./oem-image-resolver.server");
    const result = await resolveOemImage(data.oem, {
      brand: data.brand ?? null,
      title: data.title ?? null,
      model: data.model ?? null,
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    // Servis tarafında havuza ekle (service-role)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("oem_image_library")
      .upsert(
        {
          oem: data.oem,
          brand: data.brand ?? null,
          image_url: result.public_url,
          source_type: "firecrawl",
          source_name: result.source_url ?? result.source ?? null,
          source_query: oemNorm,
          confidence: result.confidence,
          verified: result.confidence >= 80,
          use_count: 1,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "oem_normalized,image_url", ignoreDuplicates: false },
      )
      .select("id")
      .maybeSingle();

    if (insErr) {
      console.warn("[oem-cache] upsert failed", insErr.message);
    }

    return {
      ok: true,
      image: {
        id: ins?.id ?? "",
        image_url: result.public_url,
        source_type: "firecrawl",
        confidence: result.confidence,
        origin: "fetched",
      },
    };
  });

// ============== Admin: Cache stats ==============

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOemCacheStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_oem_cache_stats");
    if (error) throw new Error(error.message);
    return { stats: data };
  });
