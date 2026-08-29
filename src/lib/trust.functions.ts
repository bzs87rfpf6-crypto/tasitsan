// Güven Merkezi 1.0 — server functions
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Public: satıcının güven puanı ve son yorumları */
export const getSellerTrust = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ sellerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const [scoreRes, reviewsRes] = await Promise.all([
      sb.from("seller_scores" as any).select("*").eq("seller_id", data.sellerId).maybeSingle(),
      sb.from("seller_reviews" as any)
        .select("id,rating,quality_rating,price_rating,communication_rating,shipping_rating,title,comment,images,recommend,matches_description,verified_purchase,helpful_count,created_at,buyer_id,part_id")
        .eq("seller_id", data.sellerId)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      score: scoreRes.data ?? null,
      reviews: reviewsRes.data ?? [],
    };
  });

/** Public: ürün detay sayfası için yorumlar */
export const getPartReviews = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows } = await sb.from("seller_reviews" as any)
      .select("id,rating,quality_rating,price_rating,communication_rating,shipping_rating,title,comment,images,recommend,matches_description,verified_purchase,helpful_count,created_at,buyer_id")
      .eq("part_id", data.partId)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(50);
    return { reviews: rows ?? [] };
  });

/** Auth: mevcut kullanıcı bu ürüne yorum yazabilir mi? */
export const canReviewPart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: part } = await context.supabase.from("parts").select("id,seller_id").eq("id", data.partId).maybeSingle();
    if (!part) return { canReview: false, reason: "not_found" as const };
    if (part.seller_id === context.userId) return { canReview: false, reason: "self" as const };

    const { data: sale } = await context.supabase
      .from("seller_sales" as any)
      .select("id")
      .eq("part_id", data.partId)
      .eq("seller_id", part.seller_id)
      .eq("buyer_id", context.userId)
      .maybeSingle();
    if (!sale) return { canReview: false, reason: "not_verified" as const, sellerId: part.seller_id };

    const { data: existing } = await context.supabase
      .from("seller_reviews" as any)
      .select("id")
      .eq("part_id", data.partId)
      .eq("buyer_id", context.userId)
      .maybeSingle();
    return {
      canReview: !existing,
      reason: existing ? ("already" as const) : ("ok" as const),
      sellerId: part.seller_id,
      saleId: (sale as any).id,
      existingReviewId: (existing as any)?.id ?? null,
    };
  });

/** Auth: satıcı bir satışı onaylar → alıcı yorum yazabilir hale gelir */
export const confirmSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    partId: z.string().uuid(),
    buyerId: z.string().uuid(),
    note: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // ilan gerçekten bu satıcının mı?
    const { data: part } = await context.supabase.from("parts").select("id,seller_id").eq("id", data.partId).maybeSingle();
    if (!part) throw new Error("İlan bulunamadı");
    if (part.seller_id !== context.userId) throw new Error("Sadece kendi ilanınız için satış onaylayabilirsiniz");
    if (data.buyerId === context.userId) throw new Error("Kendinizi alıcı olarak ekleyemezsiniz");

    const { error } = await context.supabase.from("seller_sales" as any).insert({
      seller_id: context.userId,
      buyer_id: data.buyerId,
      part_id: data.partId,
      note: data.note ?? null,
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

/** Auth: satıcının onayladığı alıcı listesi (satıcı UI'sı için) */
export const listSellerBuyers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("seller_sales" as any)
      .select("id,part_id,buyer_id,confirmed_at")
      .eq("seller_id", context.userId)
      .order("confirmed_at", { ascending: false })
      .limit(200);
    return { sales: data ?? [] };
  });

/** Auth: yorum kaydet / güncelle */
const reviewSchema = z.object({
  reviewId: z.string().uuid().optional(),
  partId: z.string().uuid(),
  sellerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5).optional(),
  price: z.number().int().min(1).max(5).optional(),
  communication: z.number().int().min(1).max(5).optional(),
  shipping: z.number().int().min(1).max(5).optional(),
  matchesDescription: z.boolean().optional(),
  recommend: z.boolean().optional(),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(2000).optional(),
  images: z.array(z.string().url()).max(4).optional(),
});

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      seller_id: data.sellerId,
      buyer_id: context.userId,
      part_id: data.partId,
      rating: data.rating,
      quality_rating: data.quality ?? null,
      price_rating: data.price ?? null,
      communication_rating: data.communication ?? null,
      shipping_rating: data.shipping ?? null,
      matches_description: data.matchesDescription ?? null,
      recommend: data.recommend ?? null,
      title: data.title || null,
      comment: data.comment || null,
      images: data.images ?? [],
    };
    if (data.reviewId) {
      const { error } = await context.supabase.from("seller_reviews" as any).update(payload).eq("id", data.reviewId).eq("buyer_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("seller_reviews" as any).insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Auth: faydalı bulma toggle */
export const toggleHelpful = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("review_helpful" as any)
      .select("review_id").eq("review_id", data.reviewId).eq("user_id", context.userId).maybeSingle();
    if (existing) {
      await context.supabase.from("review_helpful" as any).delete().eq("review_id", data.reviewId).eq("user_id", context.userId);
      return { helpful: false };
    }
    const { error } = await context.supabase.from("review_helpful" as any).insert({ review_id: data.reviewId, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { helpful: true };
  });

/** Auth: yorum şikayet */
export const reportReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    reviewId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("review_reports" as any).insert({
      review_id: data.reviewId,
      reporter_id: context.userId,
      reason: data.reason,
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: yorumları listele / gizle */
async function assertAdmin(context: { supabase: any; userId: string }) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

export const adminListReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["all", "reported", "hidden"]).default("all") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("seller_reviews" as any).select("*").order("created_at", { ascending: false }).limit(200);
    if (data.scope === "hidden") q = q.eq("status", "hidden");
    const { data: reviews, error } = await q;
    if (error) throw new Error(error.message);
    const { data: reports } = await context.supabase.from("review_reports" as any).select("*").order("created_at", { ascending: false }).limit(200);
    return { reviews: reviews ?? [], reports: reports ?? [] };
  });

export const adminSetReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    reviewId: z.string().uuid(),
    status: z.enum(["visible", "hidden"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("seller_reviews" as any).update({ status: data.status }).eq("id", data.reviewId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
