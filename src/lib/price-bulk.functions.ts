import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

async function admin(supabase: unknown, userId: string) {
  await assertOwnerAdmin(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}


const filtersSchema = z
  .object({
    in_stock: z.boolean().optional(),
    min_price: z.number().positive().optional(),
    max_price: z.number().positive().optional(),
    category: z.string().min(1).optional(),
    oem: z.string().min(1).optional(),
    has_photos: z.boolean().optional(),
  })
  .default({});

const percentSchema = z.number().finite().positive().max(1000);

export interface BrandPriceStat {
  brand: string;
  total_products: number;
  priced_products: number;
  avg_price: number;
  stock_value: number;
  last_price_update: string | null;
}

export const priceBulkBrandStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.supabase, context.userId);
    const { data, error } = await db.rpc("admin_price_brand_stats" as never, {
      _actor: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BrandPriceStat[];
  });

export interface PricePreview {
  count: number;
  old_total: number;
  new_total: number;
  diff_total: number;
  sample: {
    id: string;
    title: string;
    oem_code: string | null;
    old_price: number;
    new_price: number;
  }[];
}

export const priceBulkPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brand: z.string().min(1),
        operation: z.enum(["increase", "decrease"]),
        percent: percentSchema,
        filters: filtersSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    if (data.operation === "decrease" && data.percent >= 100)
      throw new Error("İndirim oranı %100 veya üzeri olamaz");
    const { data: res, error } = await db.rpc("admin_price_bulk_preview" as never, {
      _actor: context.userId,
      _brand: data.brand,
      _operation: data.operation,
      _percent: data.percent,
      _filters: data.filters,
      _sample_limit: 100,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as PricePreview;
  });

export const priceBulkApply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brand: z.string().min(1),
        operation: z.enum(["increase", "decrease"]),
        percent: percentSchema,
        filters: filtersSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    if (data.operation === "decrease" && data.percent >= 100)
      throw new Error("İndirim oranı %100 veya üzeri olamaz");

    const email =
      (context.claims as { email?: string } | undefined)?.email ?? null;

    const { data: res, error } = await db.rpc("admin_price_bulk_apply" as never, {
      _actor: context.userId,
      _actor_email: email,
      _brand: data.brand,
      _operation: data.operation,
      _percent: data.percent,
      _filters: data.filters,
    } as never);
    if (error) throw new Error(error.message);

    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "bulk_price_update",
      metadata: {
        brand: data.brand,
        operation: data.operation,
        percent: data.percent,
        filters: data.filters,
        result: res,
        actor_email: email,
      } as never,
    } as never);

    return res as unknown as {
      operation_id: string;
      count: number;
      old_total: number;
      new_total: number;
      diff_total: number;
    };
  });

export const priceBulkUndo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ operationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    const { data: res, error } = await db.rpc("admin_price_bulk_undo" as never, {
      _actor: context.userId,
      _operation_id: data.operationId,
    } as never);
    if (error) throw new Error(error.message);

    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "bulk_price_undo",
      metadata: { operation_id: data.operationId, result: res } as never,
    } as never);

    return res as unknown as { reverted_count: number };
  });

export interface PriceOperationRow {
  id: string;
  brand: string;
  operation_type: "increase" | "decrease";
  percent: number;
  affected_count: number;
  old_total: number;
  new_total: number;
  diff_total: number;
  status: string;
  actor_email: string | null;
  reverted_at: string | null;
  created_at: string;
}

export const priceBulkHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.supabase, context.userId);
    const { data, error } = await db
      .from("price_bulk_operations")
      .select(
        "id,brand,operation_type,percent,affected_count,old_total,new_total,diff_total,status,actor_email,reverted_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PriceOperationRow[];
  });

export const priceBulkOperationItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ operationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    const { data: items, error } = await db
      .from("price_bulk_operation_items")
      .select("part_id,old_price,new_price")
      .eq("operation_id", data.operationId)
      .order("old_price", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (items ?? []) as { part_id: string; old_price: number; new_price: number }[];
    if (!rows.length) return [];
    const { data: parts } = await db
      .from("parts")
      .select("id,title,oem_code")
      .in(
        "id",
        rows.map((r) => r.part_id),
      );
    const map = new Map((parts ?? []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({
      part_id: r.part_id,
      title: (map.get(r.part_id) as any)?.title ?? "—",
      oem_code: (map.get(r.part_id) as any)?.oem_code ?? null,
      old_price: r.old_price,
      new_price: r.new_price,
    }));
  });

export const priceBulkOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.supabase, context.userId);
    const [total, priced, branded, lastUpdate, lastOp] = await Promise.all([
      db.from("parts").select("id", { count: "exact", head: true }),
      db.from("parts").select("id", { count: "exact", head: true }).gt("price", 0),
      db.from("parts").select("id", { count: "exact", head: true }).not("brand", "is", null),
      db.from("parts").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      db
        .from("price_bulk_operations")
        .select("brand,operation_type,percent,affected_count,created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    return {
      totalProducts: total.count ?? 0,
      pricedProducts: priced.count ?? 0,
      brandedProducts: branded.count ?? 0,
      lastPriceUpdate: (lastUpdate.data?.[0] as any)?.updated_at ?? null,
      lastOperation: (lastOp.data?.[0] as any) ?? null,
    };
  });
