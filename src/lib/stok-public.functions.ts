import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type StokFile = { name: string; path: string; type?: string };

export type PublicStokListing = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  estimated_item_count: number | null;
  estimated_oem_count: number | null;
  expected_price: number | null;
  status: "active" | "offer_collecting";
  expert_requested: boolean;
  expert_completed: boolean;
  created_at: string;
  cover_image: string | null;
  image_count: number;
  file_count: number;
  seller: { company_name: string | null; city: string | null; is_verified: boolean };
};

export type PublicStokDetail = PublicStokListing & {
  images: { name: string; url: string }[];
  files: { name: string; url: string; type?: string }[];
};

const FilterSchema = z.object({
  city: z.string().trim().max(80).optional().nullable(),
  minPrice: z.number().nonnegative().optional().nullable(),
  maxPrice: z.number().nonnegative().optional().nullable(),
  minItems: z.number().int().nonnegative().optional().nullable(),
  expertOnly: z.boolean().optional().nullable(),
  status: z.enum(["all", "active", "offer_collecting"]).optional().nullable(),
  limit: z.number().int().min(1).max(120).optional().nullable(),
  vehicleClass: z.enum(["automobile", "heavy_vehicle", "construction", "agriculture"]).optional().nullable(),
});

async function signOne(supabase: any, path: string, ttl = 60 * 30): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("stok-uploads").createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

export const listPublicStok = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("stok_listings")
      .select(
        "id,seller_id,title,description,city,estimated_item_count,estimated_oem_count,expected_price,status,expert_requested,expert_completed,files,images,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 60);

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    else q = q.in("status", ["active", "offer_collecting"]);
    if (data.city) q = q.eq("city", data.city);
    if (data.minPrice != null) q = q.gte("expected_price", data.minPrice);
    if (data.maxPrice != null) q = q.lte("expected_price", data.maxPrice);
    if (data.minItems != null) q = q.gte("estimated_item_count", data.minItems);
    if (data.expertOnly) q = q.eq("expert_requested", true);
    if (data.vehicleClass) q = q.eq("vehicle_class", data.vehicleClass);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const sellerIds = Array.from(new Set((rows ?? []).map((r) => r.seller_id)));
    const profiles = sellerIds.length
      ? (await supabaseAdmin
          .from("profiles")
          .select("id,company_name,display_name,city,is_verified")
          .in("id", sellerIds)).data ?? []
      : [];
    const pMap = new Map(profiles.map((p) => [p.id, p]));

    const out: PublicStokListing[] = [];
    for (const r of rows ?? []) {
      const images = (r.images as StokFile[] | null) ?? [];
      const files = (r.files as StokFile[] | null) ?? [];
      const cover = images[0]?.path ? await signOne(supabaseAdmin, images[0].path) : null;
      const p = pMap.get(r.seller_id);
      out.push({
        id: r.id,
        title: r.title,
        description: r.description,
        city: r.city,
        estimated_item_count: r.estimated_item_count,
        estimated_oem_count: r.estimated_oem_count,
        expected_price: r.expected_price,
        status: r.status as "active" | "offer_collecting",
        expert_requested: r.expert_requested,
        expert_completed: r.expert_completed,
        created_at: r.created_at,
        cover_image: cover,
        image_count: images.length,
        file_count: files.length,
        seller: {
          company_name: (p?.company_name as string | null) ?? (p?.display_name as string | null) ?? null,
          city: (p?.city as string | null) ?? null,
          is_verified: Boolean(p?.is_verified),
        },
      });
    }
    return out;
  });

export const getPublicStok = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await supabaseAdmin
      .from("stok_listings")
      .select(
        "id,seller_id,title,description,city,estimated_item_count,estimated_oem_count,expected_price,status,expert_requested,expert_completed,files,images,created_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) return null;
    if (!["active", "offer_collecting"].includes(r.status)) return null;

    const images = (r.images as StokFile[] | null) ?? [];
    const files = (r.files as StokFile[] | null) ?? [];
    const signedImages = await Promise.all(
      images.map(async (f) => ({ name: f.name, url: (await signOne(supabaseAdmin, f.path, 3600)) ?? "" })),
    );
    const signedFiles = await Promise.all(
      files.map(async (f) => ({ name: f.name, type: f.type, url: (await signOne(supabaseAdmin, f.path, 3600)) ?? "" })),
    );
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("company_name,display_name,city,is_verified")
      .eq("id", r.seller_id)
      .maybeSingle();

    const detail: PublicStokDetail = {
      id: r.id,
      title: r.title,
      description: r.description,
      city: r.city,
      estimated_item_count: r.estimated_item_count,
      estimated_oem_count: r.estimated_oem_count,
      expected_price: r.expected_price,
      status: r.status as "active" | "offer_collecting",
      expert_requested: r.expert_requested,
      expert_completed: r.expert_completed,
      created_at: r.created_at,
      cover_image: signedImages[0]?.url ?? null,
      image_count: signedImages.length,
      file_count: signedFiles.length,
      images: signedImages,
      files: signedFiles,
      seller: {
        company_name: (p?.company_name as string | null) ?? (p?.display_name as string | null) ?? null,
        city: (p?.city as string | null) ?? null,
        is_verified: Boolean(p?.is_verified),
      },
    };
    return detail;
  });

export const submitStokOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string; amount: number; note?: string | null }) =>
    z.object({
      listingId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000_000),
      note: z.string().trim().max(1000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: e0 } = await supabase
      .from("stok_listings")
      .select("id,seller_id,status")
      .eq("id", data.listingId)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!row) throw new Error("İlan bulunamadı");
    if (!["active", "offer_collecting"].includes(row.status)) throw new Error("İlan teklife kapalı");
    if (row.seller_id === userId) throw new Error("Kendi ilanınıza teklif veremezsiniz");
    const { error } = await supabase.from("stok_offers").insert({
      listing_id: data.listingId,
      buyer_id: userId,
      offer_amount: data.amount,
      note: data.note || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSitemapStok = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stok_listings")
    .select("id,updated_at")
    .in("status", ["active", "offer_collecting"])
    .order("updated_at", { ascending: false })
    .limit(10000);
  return (data ?? []) as { id: string; updated_at: string }[];
});

export const getActiveStokCount = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("stok_listings")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "offer_collecting"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
});
