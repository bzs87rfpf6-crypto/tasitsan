// Faz 4/5 — Kullanıcının AI arama geçmişi (tekrar, favori, sil).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface AiSearchHistoryRow {
  id: string;
  query: string;
  parts_found: number;
  confidence: number;
  confidence_tier: string;
  is_favorite: boolean;
  created_at: string;
}

export const listMyAiSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    only_favorites: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AiSearchHistoryRow[]> => {
    let q = context.supabase.from("ai_search_logs")
      .select("id, query, parts_found, confidence, confidence_tier, is_favorite, created_at")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (data.only_favorites) q = q.eq("is_favorite", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AiSearchHistoryRow[];
  });

export const toggleAiSearchFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_search_logs")
      .update({ is_favorite: data.value } as never)
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAiSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_search_logs")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
