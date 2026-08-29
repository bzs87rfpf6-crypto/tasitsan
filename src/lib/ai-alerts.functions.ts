// Faz 4/6 — Sonuçsuz aramada kullanıcı alarm oluşturur; ürün eklenince DB trigger bildirir.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Schema = z.object({
  keyword: z.string().max(120).optional().nullable(),
  brand: z.string().max(60).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  oem_code: z.string().max(60).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  ai_log_id: z.string().uuid().optional().nullable(),
});

export const subscribePartAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const has = data.keyword || data.brand || data.model || data.oem_code || data.category;
    if (!has) throw new Error("En az bir kriter gerekli.");
    let q = context.supabase.from("part_alerts")
      .select("id").eq("user_id", context.userId);
    q = data.keyword ? q.eq("keyword", data.keyword) : q.is("keyword", null);
    q = data.brand ? q.eq("brand", data.brand) : q.is("brand", null);
    q = data.model ? q.eq("model", data.model) : q.is("model", null);
    q = data.oem_code ? q.eq("oem_code", data.oem_code) : q.is("oem_code", null);
    q = data.category ? q.eq("category", data.category) : q.is("category", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      await context.supabase.from("part_alerts").update({ is_active: true } as never).eq("id", existing.id);
      return { ok: true, id: existing.id, duplicate: true };
    }
    const { data: ins, error } = await context.supabase.from("part_alerts")
      .insert({
        user_id: context.userId,
        keyword: data.keyword ?? null,
        brand: data.brand ?? null,
        model: data.model ?? null,
        oem_code: data.oem_code ?? null,
        category: data.category ?? null,
        is_active: true,
      } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as { id: string }).id, duplicate: false };
  });

export const listMyPartAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("part_alerts")
      .select("id, keyword, brand, model, oem_code, category, is_active, match_count, last_matched_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMyPartAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("part_alerts").delete()
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
