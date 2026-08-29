import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LocationInput = {
  city: string | null;
  district: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "gps" | "ip" | "unknown";
};

/**
 * Oturumu açık kullanıcının profil kaydına doğrulanmış (veya IP tabanlı) konumu yazar.
 * IP tabanlı konumun `city` alanının üzerine yazmaz — kullanıcının manuel girdiği
 * şehri korumak için, IP kaynağında yalnızca lat/lng/country doldurulur.
 */
export const saveVisitorLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LocationInput) => {
    if (!input || typeof input !== "object") throw new Error("invalid input");
    const src = input.source;
    if (src !== "gps" && src !== "ip" && src !== "unknown") throw new Error("invalid source");
    const clean = (v: unknown): string | null =>
      typeof v === "string" && v.trim().length > 0 && v.length <= 120 ? v.trim() : null;
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    return {
      city: clean(input.city),
      district: clean(input.district),
      country: clean(input.country),
      latitude: num(input.latitude),
      longitude: num(input.longitude),
      source: src,
    } satisfies LocationInput;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const patch: Record<string, unknown> = {
      location_source: data.source,
      location_updated_at: new Date().toISOString(),
    };
    if (data.latitude !== null && data.longitude !== null) {
      patch.latitude = data.latitude;
      patch.longitude = data.longitude;
    }

    // GPS doğrulaması varsa şehri/ilçeyi güvenle yaz. IP fallback ise mevcut şehri koru,
    // yalnızca boşsa doldur.
    if (data.source === "gps") {
      if (data.city) patch.city = data.city;
      if (data.district) patch.district = data.district;
    } else {
      const { data: existing } = await supabase
        .from("profiles")
        .select("city, district" as never)
        .eq("id", userId)
        .maybeSingle();
      const row = (existing ?? {}) as { city?: string | null; district?: string | null };
      if (!row.city && data.city) patch.city = data.city;
      if (!row.district && data.district) patch.district = data.district;
    }

    const { error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

