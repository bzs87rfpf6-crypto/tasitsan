import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcSupplierSalePrice, SUPPLY_STATUS_KEYS } from "@/lib/external-supplier";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

type AuthedSupabase = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  await assertOwnerAdmin(context.supabase as AuthedSupabase, context.userId);
}

/* ---------- Harici tedarikçi listesi (admin) ---------- */

export const listExternalSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("id, name, active, default_margin, last_scan_at, last_connected_at, last_success_at, last_error, last_error_at")
      .order("name");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const counts = await Promise.all(
      rows.map(async (s) => {
        const { count } = await supabaseAdmin
          .from("parts")
          .select("id", { count: "exact", head: true })
          .eq("source_type", "external_supplier")
          .eq("supplier_name", s.name);
        return count ?? 0;
      }),
    );
    return rows.map((s, i) => ({ ...s, product_count: counts[i] ?? 0 }));
  });

export const updateExternalSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        supplierId: z.string().uuid(),
        active: z.boolean().optional(),
        margin: z.number().min(0).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { active?: boolean; default_margin?: number } = {};
    if (data.active !== undefined) patch.active = data.active;
    if (data.margin !== undefined) patch.default_margin = data.margin;
    const { error } = await supabaseAdmin.from("suppliers").update(patch).eq("id", data.supplierId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------- Harici tedarikçi ürününü Taşıtsan ürünü olarak kaydet / güncelle ---------- */

const upsertSchema = z.object({
  supplierId: z.string().uuid(),
  supplier_product_id: z.string().min(1).max(120),
  supplier_oem: z.string().min(1).max(80),
  title: z.string().min(2).max(240),
  brand: z.string().max(120).nullable().optional(),
  cost_price: z.number().min(0),
  stock_status: z.string().max(40).nullable().optional(),
  stock_quantity: z.number().int().min(0).max(100000).optional(),
  photo: z.string().max(600).nullable().optional(),
});

export const upsertExternalSupplierProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: supplier, error: sErr } = await supabaseAdmin
      .from("suppliers")
      .select("id, name, default_margin, active")
      .eq("id", data.supplierId)
      .maybeSingle();
    if (sErr || !supplier) throw new Error("Tedarikçi bulunamadı");

    const margin = Number(supplier.default_margin ?? 0);
    const salePrice = calcSupplierSalePrice(data.cost_price, margin);
    const now = new Date().toISOString();

    // Duplicate kontrolü: supplier_name + supplier_product_id
    const { data: existing } = await supabaseAdmin
      .from("parts")
      .select("id")
      .eq("source_type", "external_supplier")
      .eq("supplier_name", supplier.name)
      .eq("supplier_product_id", data.supplier_product_id)
      .maybeSingle();

    const common = {
      title: data.title,
      brand: data.brand ?? null,
      price: salePrice,
      oem_code: data.supplier_oem,
      stock_quantity: data.stock_quantity ?? 1,
      stock_status: data.stock_status ?? null,
      source_type: "external_supplier",
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_product_id: data.supplier_product_id,
      supplier_oem: data.supplier_oem,
      supplier_stock_status: data.stock_status ?? null,
      supplier_last_checked_at: now,
      last_synced_at: now,
      photos: data.photo ? [data.photo] : [],
    };

    let partId = existing?.id ?? null;
    if (partId) {
      const { error } = await supabaseAdmin.from("parts").update(common).eq("id", partId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("parts")
        .insert({ ...common, seller_id: context.userId, whatsapp: "", status: "approved" })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Ürün oluşturulamadı");
      partId = inserted.id;
    }

    // Alış fiyatı yalnızca admin tablosunda saklanır.
    const { error: cErr } = await supabaseAdmin.from("part_supplier_costs").upsert(
      {
        part_id: partId,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_product_id: data.supplier_product_id,
        supplier_cost_price: data.cost_price,
        margin_percent: margin,
        sale_price: salePrice,
        supplier_last_checked_at: now,
        updated_at: now,
      },
      { onConflict: "part_id" },
    );
    if (cErr) throw new Error(cErr.message);

    await supabaseAdmin
      .from("suppliers")
      .update({ last_success_at: now, last_error: null })
      .eq("id", supplier.id);

    return { ok: true as const, part_id: partId, sale_price: salePrice, margin, created: !existing };
  });

/* ---------- Sipariş tedarik bilgileri (yalnızca admin) ---------- */

export const listOrderSupply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("order_item_supply")
      .select("id, order_item_id, source_type, supplier_name, supplier_product_id, supplier_cost_price, supplier_sale_price, supply_status, supplier_note")
      .eq("order_id", data.orderId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateOrderSupplyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        supply_status: z.string().refine((s) => SUPPLY_STATUS_KEYS.includes(s), "Geçersiz durum"),
        supplier_note: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_item_supply")
      .update({ supply_status: data.supply_status, supplier_note: data.supplier_note ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
