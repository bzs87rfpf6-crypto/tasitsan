import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkCartSupplierRules, money } from "@/lib/supplier-stock";
import { calcOrderTotals } from "@/lib/tax";

interface OrderItemInput {
  part_id: string;
  title: string;
  oem_code: string | null;
  product_code: string | null;
  seller_id: string | null;
  seller_name: string | null;
  photo: string | null;
  quantity: number;
  unit_price: number | null;
}

interface CreateOrderInput {
  full_name: string;
  company: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  note: string | null;
  user_id: string | null;
  items: OrderItemInput[];
  shipping_method: string | null;
  shipping_fee: number | null;
  is_urgent: boolean;
  billing_type: "bireysel" | "kurumsal";
  billing_company: string | null;
  tax_office: string | null;
  tax_number: string | null;
}


const SHIPPING_OPTIONS: Record<string, number> = {
  "yurtici_kargo": 0,
  "aras_kargo": 0,
  "mng_kargo": 0,
  "surat_kargo": 0,
  "ambar": 0,
  "firma_teslimati": 0,
  "musteri_teslim": 0,
};

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): CreateOrderInput => {
    const d = raw as CreateOrderInput;
    if (!d || typeof d !== "object") throw new Error("Geçersiz istek");
    if (!d.full_name?.trim()) throw new Error("Ad soyad zorunlu");
    if (!d.phone?.trim()) throw new Error("Telefon zorunlu");
    if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("Sepet boş");
    if (d.items.length > 100) throw new Error("Çok fazla ürün");
    const billing_type = d.billing_type === "kurumsal" ? "kurumsal" : "bireysel";
    if (billing_type === "kurumsal") {
      if (!d.billing_company?.trim()) throw new Error("Firma adı zorunlu");
      if (!d.tax_number?.trim()) throw new Error("Vergi no zorunlu");
    }
    return {
      full_name: d.full_name.trim().slice(0, 120),
      company: d.company?.trim().slice(0, 120) || null,
      phone: d.phone.trim().slice(0, 40),
      email: d.email?.trim().slice(0, 160) || null,
      city: d.city?.trim().slice(0, 80) || null,
      note: d.note?.trim().slice(0, 2000) || null,
      user_id: d.user_id || null,
      shipping_method: d.shipping_method?.slice(0, 40) || null,
      shipping_fee: d.shipping_fee != null && Number.isFinite(Number(d.shipping_fee))
        ? Math.max(0, Number(d.shipping_fee)) : null,
      is_urgent: !!d.is_urgent,
      billing_type,
      billing_company: d.billing_company?.trim().slice(0, 160) || null,
      tax_office: d.tax_office?.trim().slice(0, 120) || null,
      tax_number: d.tax_number?.trim().slice(0, 40) || null,
      items: d.items.map((i) => ({
        part_id: String(i.part_id),
        title: String(i.title).slice(0, 240),
        oem_code: i.oem_code ? String(i.oem_code).slice(0, 80) : null,
        product_code: i.product_code ? String(i.product_code).slice(0, 80) : null,
        seller_id: i.seller_id || null,
        seller_name: i.seller_name ? String(i.seller_name).slice(0, 160) : null,
        photo: i.photo ? String(i.photo).slice(0, 500) : null,
        quantity: Math.max(1, Math.min(999, Math.floor(Number(i.quantity) || 1))),
        unit_price: i.unit_price != null && Number.isFinite(Number(i.unit_price)) ? Number(i.unit_price) : null,
      })),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

    // Tedarikçi stoğu kuralları — sunucu tarafında doğrulanır (istemciye güvenilmez).
    const partIds = Array.from(new Set(data.items.map((i) => i.part_id)));
    const { data: partRows } = await sb
      .from("parts")
      .select(
        "id, seller_id, price, supplier_stock, minimum_order_amount, single_shipment_allowed, procurement_days, source_type, supplier_id, supplier_name, supplier_product_id",
      )
      .in("id", partIds);
    const partMap = new Map((partRows ?? []).map((p) => [p.id, p]));


    const supplierCheck = checkCartSupplierRules(
      data.items.map((i) => {
        const p = partMap.get(i.part_id);
        return {
          part_id: i.part_id,
          seller_id: p?.seller_id ?? i.seller_id,
          seller_name: i.seller_name,
          unit_price: p?.price != null ? Number(p.price) : i.unit_price,
          quantity: i.quantity,
          supplier_stock: p?.supplier_stock ?? false,
          minimum_order_amount: p?.minimum_order_amount != null ? Number(p.minimum_order_amount) : null,
          single_shipment_allowed: p?.single_shipment_allowed ?? true,
          procurement_days: p?.procurement_days ?? null,
        };
      }),
    );
    const failing = supplierCheck.requirements.find((r) => !r.ok);
    if (failing) {
      throw new Error(
        `Tedarikçi stoğu ürünleri için minimum sipariş tutarı sağlanmadı. ${failing.seller_name || "Satıcı"} için eksik tutar: ${money(failing.missing)}`,
      );
    }

    let subtotal = 0;
    let has_quote_items = false;
    let item_count = 0;
    for (const it of data.items) {
      item_count += it.quantity;
      if (it.unit_price == null) { has_quote_items = true; continue; }
      subtotal += it.unit_price * it.quantity;
    }
    const shippingFee = data.shipping_fee ?? (data.shipping_method ? SHIPPING_OPTIONS[data.shipping_method] ?? 0 : 0);
    const totals = calcOrderTotals(subtotal, shippingFee);
    subtotal = totals.subtotal;
    const shipping = totals.shipping;
    const tax = totals.tax;
    const total = totals.total;

    const { data: order, error: oErr } = await sb.from("orders").insert({
      user_id: data.user_id,
      full_name: data.full_name,
      company: data.company,
      phone: data.phone,
      email: data.email,
      city: data.city,
      note: data.note,
      subtotal, tax, shipping, total, item_count,
      has_quote_items,
      has_supplier_items: supplierCheck.hasSupplierItems,
      status: "bekliyor",
      shipping_method: data.shipping_method,
      is_urgent: data.is_urgent,
      billing_type: data.billing_type,
      billing_company: data.billing_company,
      tax_office: data.tax_office,
      tax_number: data.tax_number,
    }).select("id, order_number, created_at").single();

    if (oErr || !order) throw new Error(oErr?.message || "Sipariş oluşturulamadı");

    const rows = data.items.map((it) => {
      const p = partMap.get(it.part_id);
      return {
        order_id: order.id,
        part_id: it.part_id,
        seller_id: it.seller_id,
        title: it.title,
        oem_code: it.oem_code,
        product_code: it.product_code,
        seller_name: it.seller_name,
        photo: it.photo,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.unit_price != null ? it.unit_price * it.quantity : null,
        is_quote: it.unit_price == null,
        supplier_stock: p?.supplier_stock ?? false,
        procurement_days: p?.procurement_days ?? null,
        source_type: p?.source_type ?? "own_stock",
        supplier_name: p?.supplier_name ?? null,

      };
    });

    const { data: insertedItems, error: iErr } = await sb.from("order_items").insert(rows).select("id, part_id");
    if (iErr) throw new Error(iErr.message);

    // Harici tedarikçi kalemleri için tedarik takip kaydı (alış fiyatı yalnızca admin tarafında).
    try {
      const externalItems = (insertedItems ?? []).filter(
        (row) => partMap.get(row.part_id as string)?.source_type === "external_supplier",
      );
      if (externalItems.length) {
        const { data: costs } = await sb
          .from("part_supplier_costs")
          .select("part_id, supplier_cost_price, sale_price")
          .in("part_id", externalItems.map((r) => r.part_id as string));
        const costMap = new Map((costs ?? []).map((c) => [c.part_id, c]));
        await sb.from("order_item_supply").insert(
          externalItems.map((row) => {
            const p = partMap.get(row.part_id as string);
            const c = costMap.get(row.part_id as string);
            return {
              order_id: order.id,
              order_item_id: row.id as string,
              source_type: "external_supplier",
              supplier_id: p?.supplier_id ?? null,
              supplier_name: p?.supplier_name ?? null,
              supplier_product_id: p?.supplier_product_id ?? null,
              supplier_cost_price: c?.supplier_cost_price ?? null,
              supplier_sale_price: c?.sale_price ?? (p?.price != null ? Number(p.price) : null),
              supply_status: "pending_supplier_order",
            };
          }),
        );
      }
    } catch {
      /* tedarik kaydı hatası siparişi bozmaz */
    }


    // Notifications (correct column names: kind/priority/link/related_id)
    const urgentTag = data.is_urgent ? "🚨 ACİL " : "";
    try {
      await sb.from("admin_notifications").insert({
        kind: "new_order",
        priority: data.is_urgent ? "high" : "normal",
        title: `${urgentTag}Yeni sipariş #${order.order_number}`,
        body: `${data.full_name} • ${item_count} ürün • ₺${total.toLocaleString("tr-TR")}`,
        link: `/admin?tab=orders&order=${order.id}`,
        related_id: order.id,
      });
    } catch { /* ignore */ }

    try {
      const sellerIds = Array.from(new Set(data.items.map((i) => i.seller_id).filter(Boolean))) as string[];
      if (sellerIds.length) {
        const notifs = sellerIds.map((sid) => ({
          user_id: sid,
          kind: "new_order",
          title: `${urgentTag}Yeni Sipariş`,
          body: `Sipariş #${order.order_number} — ürünleriniz sipariş edildi.`,
          link: `/account/orders`,
          related_id: order.id,
        }));
        await sb.from("user_notifications").insert(notifs);
      }
      if (data.user_id) {
        await sb.from("user_notifications").insert({
          user_id: data.user_id,
          kind: "order_created",
          title: "Siparişiniz alındı",
          body: `Sipariş #${order.order_number} başarıyla oluşturuldu.`,
          link: `/order-success/${order.id}`,
          related_id: order.id,
        });
      }
    } catch { /* ignore */ }

    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      subtotal, tax, shipping, total, has_quote_items,
    };
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as {
      status?: string; limit?: number; q?: string; from?: string; to?: string; seller_id?: string;
    };
    return {
      status: d.status || "all",
      limit: Math.min(500, Math.max(1, Number(d.limit) || 200)),
      q: d.q?.trim() || "",
      from: d.from || "",
      to: d.to || "",
      seller_id: d.seller_id || "",
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    let q = sb.from("orders").select("*")
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status as never);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.q) {
      const t = data.q.replace(/[%_]/g, "");
      q = q.or(`order_number.ilike.%${t}%,phone.ilike.%${t}%,full_name.ilike.%${t}%,company.ilike.%${t}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (data.seller_id) {
      const { data: si } = await sb.from("order_items").select("order_id").eq("seller_id", data.seller_id);
      const ids = new Set((si ?? []).map((r) => r.order_id));
      return (rows ?? []).filter((r) => ids.has(r.id));
    }
    return rows ?? [];
  });

export const adminGetOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string };
    if (!d?.id) throw new Error("id required");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await sb.from("orders").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: items, error: iErr } = await sb.from("order_items").select("*").eq("order_id", data.id);
    if (iErr) throw new Error(iErr.message);
    return { order, items: items ?? [] };
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string; status: string };
    if (!d?.id || !d?.status) throw new Error("id and status required");
    return { id: d.id, status: d.status };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await sb.from("orders")
      .update({ status: data.status as never }).eq("id", data.id)
      .select("id, order_number, user_id").maybeSingle();
    if (error) throw new Error(error.message);
    // Notify customer of status change
    if (order?.user_id) {
      try {
        await sb.from("user_notifications").insert({
          user_id: order.user_id,
          kind: "order_status",
          title: "Sipariş durumu güncellendi",
          body: `Sipariş #${order.order_number} → ${data.status}`,
          link: `/order-success/${order.id}`,
          related_id: order.id,
        });
      } catch { /* ignore */ }
    }
    return { ok: true };
  });

export const adminUpdateOrderTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string; tracking_number?: string; tracking_carrier?: string };
    if (!d?.id) throw new Error("id required");
    return {
      id: d.id,
      tracking_number: d.tracking_number?.trim().slice(0, 80) || null,
      tracking_carrier: d.tracking_carrier?.trim().slice(0, 40) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    // Seller or admin allowed by RLS-equivalent check:
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: mine } = await sb.from("order_items")
        .select("order_id").eq("order_id", data.id).eq("seller_id", context.userId).limit(1);
      if (!mine || mine.length === 0) throw new Error("Forbidden");
    }
    const { error } = await sb.from("orders").update({
      tracking_number: data.tracking_number,
      tracking_carrier: data.tracking_carrier,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Customer: list own orders
export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data, error } = await sb.from("orders").select("*")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Seller: list orders containing seller's items
export const listMySales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: items } = await sb.from("order_items").select("order_id").eq("seller_id", context.userId);
    const ids = Array.from(new Set((items ?? []).map((i) => i.order_id)));
    if (ids.length === 0) return [];
    const { data, error } = await sb.from("orders").select("*").in("id", ids)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOrderPublic = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string };
    if (!d?.id) throw new Error("id required");
    return { id: d.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await sb.from("orders")
      .select("id, order_number, full_name, company, phone, email, city, note, subtotal, tax, shipping, total, item_count, has_quote_items, status, created_at, shipping_method, is_urgent, billing_type, billing_company, tax_office, tax_number, tracking_number, tracking_carrier")
      .eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: items, error: iErr } = await sb.from("order_items")
      .select("id, title, oem_code, product_code, seller_name, photo, quantity, unit_price, line_total, is_quote")
      .eq("order_id", data.id);
    if (iErr) throw new Error(iErr.message);
    return { order, items: items ?? [] };
  });

export const adminArchiveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string };
    if (!d?.id) throw new Error("id required");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isAdmin && !isSuper) throw new Error("Forbidden");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await sb.from("orders")
      .update({ status: "arsivlendi" }).eq("id", data.id)
      .select("id, order_number").maybeSingle();
    if (error) throw new Error(error.message);
    try {
      await sb.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "order_archived",
        metadata: { order_id: data.id, order_number: order?.order_number ?? null },
      });
    } catch { /* ignore */ }
    return { ok: true };
  });

export const adminDeleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string; confirm?: boolean };
    if (!d?.id) throw new Error("id required");
    if (!d.confirm) throw new Error("Silme onayı gerekli");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Bu işlem için Super Admin yetkisi gerekiyor");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    // Load snapshot for audit log
    const { data: order } = await sb.from("orders").select("*").eq("id", data.id).maybeSingle();
    if (!order) throw new Error("Sipariş bulunamadı");
    const { data: itemsSnap } = await sb.from("order_items").select("*").eq("order_id", data.id);

    // Delete notifications referencing this order
    try { await sb.from("admin_notifications").delete().eq("related_id", data.id); } catch { /* ignore */ }
    try { await sb.from("user_notifications").delete().eq("related_id", data.id); } catch { /* ignore */ }

    // Delete order (order_items cascade)
    const { error: delErr } = await sb.from("orders").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);

    // Audit log
    try {
      await sb.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "order_deleted",
        old_value: { order, items: itemsSnap ?? [] },
        metadata: { order_id: data.id, order_number: order.order_number, deleted_at: new Date().toISOString() },
      });
    } catch { /* ignore */ }

    return { ok: true };
  });

export const currentUserIsSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    return { is_super_admin: !!data };
  });

export const adminGetOrderStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const isoStart = todayStart.toISOString();
    const PENDING = ["bekliyor", "odeme_bekliyor"];
    const PAID = ["odeme_alindi", "hazirlaniyor", "kargoda", "teslim_edildi", "tamamlandi"];
    const EXCLUDE_URGENT = ["iptal", "teslim_edildi", "arsivlendi"];
    const TO_SHIP = ["odeme_alindi", "hazirlaniyor"];

    const [pending, urgent, todayRows, quotePending, toShip] = await Promise.all([
      sb.from("orders").select("id", { count: "exact", head: true }).in("status", PENDING as never[]),
      sb.from("orders").select("id", { count: "exact", head: true }).eq("is_urgent", true).not("status", "in", `(${EXCLUDE_URGENT.join(",")})`),
      sb.from("orders").select("total,status").gte("created_at", isoStart),
      sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "teklif_bekliyor" as never),
      sb.from("orders").select("id", { count: "exact", head: true }).in("status", TO_SHIP as never[]).is("tracking_number", null),
    ]);
    const rows = (todayRows.data ?? []) as Array<{ total: number | null; status: string | null }>;
    const todayRevenue = rows
      .filter((r) => r.status && PAID.includes(r.status))
      .reduce((a, r) => a + Number(r.total ?? 0), 0);
    return {
      pending: pending.count ?? 0,
      urgent: urgent.count ?? 0,
      todayCount: rows.length,
      todayRevenue,
      quotePending: quotePending.count ?? 0,
      toShip: toShip.count ?? 0,
    };
  });


