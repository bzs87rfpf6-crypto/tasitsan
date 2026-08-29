import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const Scope = z.enum(["requests", "quotes"]);
const Visibility = z.enum(["active", "passive", "deleted", "all"]);
const Action = z.enum(["delete", "restore", "deactivate", "activate", "hard_delete"]);

export const adminModerationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    // Use the user-scoped client so auth.uid() inside the SECURITY DEFINER RPC resolves to the admin.
    const { data, error } = await context.supabase.rpc("admin_moderation_stats");
    if (error) throw new Error(error.message);
    return data as {
      requests: { active: number; passive: number; deleted: number; total: number };
      quotes: { active: number; passive: number; deleted: number; total: number };
    };
  });

export const adminListModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      scope: Scope,
      visibility: Visibility,
      limit: z.number().int().min(1).max(500).default(100),
      search: z.string().trim().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.scope === "requests" ? "part_requests" : "request_quotes";
    const cols =
      data.scope === "requests"
        ? "id,buyer_id,full_name,phone,email,part_name,brand,model,year,oem_code,city,status,is_active,deleted_at,deleted_by,created_at"
        : "id,request_id,seller_id,price,delivery_time,condition,note,status,is_active,deleted_at,deleted_by,created_at";

    let q: any = (supabaseAdmin.from as any)(table).select(cols).order("created_at", { ascending: false }).limit(data.limit);
    if (data.visibility === "active") q = q.is("deleted_at", null).eq("is_active", true);
    else if (data.visibility === "passive") q = q.is("deleted_at", null).eq("is_active", false);
    else if (data.visibility === "deleted") q = q.not("deleted_at", "is", null);

    if (data.search && data.scope === "requests") {
      const s = `%${data.search}%`;
      q = q.or(
        `part_name.ilike.${s},brand.ilike.${s},model.ilike.${s},oem_code.ilike.${s},full_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const adminModerateRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      scope: Scope,
      id: z.string().uuid(),
      action: Action,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const tbl = data.scope === "requests" ? "part_requests" : "request_quotes";
    // RPC must run as the admin user (auth.uid() check inside SECURITY DEFINER fn).
    const { error } = await context.supabase.rpc("admin_moderate_record", {
      _table: tbl,
      _id: data.id,
      _action: data.action,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RequestPatch = z.object({
  part_name: z.string().trim().max(200).optional(),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  oem_code: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  full_name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(100).optional(),
  description: z.string().trim().max(4000).optional(),
  is_active: z.boolean().optional(),
}).partial();

const QuotePatch = z.object({
  price: z.number().min(0).max(1e9).optional(),
  delivery_time: z.string().trim().max(100).optional(),
  condition: z.string().trim().max(50).optional(),
  note: z.string().trim().max(2000).optional(),
  status: z.string().trim().max(40).optional(),
  is_active: z.boolean().optional(),
}).partial();

export const adminEditRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      scope: Scope,
      id: z.string().uuid(),
      patch: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const tbl = data.scope === "requests" ? "part_requests" : "request_quotes";
    const patch = data.scope === "requests"
      ? RequestPatch.parse(data.patch)
      : QuotePatch.parse(data.patch);
    if (Object.keys(patch).length === 0) throw new Error("Boş güncelleme");
    const { error } = await context.supabase.rpc("admin_edit_record", {
      _table: tbl,
      _id: data.id,
      _patch: patch as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

