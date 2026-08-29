/**
 * OnlineParça (harici tedarikçi) canlı OEM entegrasyonu — sunucu tarafı.
 *
 * ÖNEMLİ: Mevcut çalışan OnlineParça login/session/search zinciri (supplier-scan.server.ts)
 * OLDUĞU GİBİ kullanılır. Burada yeni bir scraper yazılmaz; yalnızca sonuç normalize edilip
 * Taşıtsan "Harici Tedarikçi" katmanına (parts + part_supplier_costs) yazılır.
 */
import { calcSupplierSalePrice } from "@/lib/external-supplier";

export type OemMatchType = "EXACT" | "NORMALIZED" | "NONE";
export type DetailStatus = "OK" | "FAILED" | "INVALID" | "SKIPPED";
export type ExternalStockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "ASK" | "UNVERIFIED";

export interface ExternalOemPublicResult {
  /** Harici sonuç Taşıtsan ürünü DEĞİLDİR; bu yüzden part_id yoktur. */
  title: string;
  brand: string | null;
  /** Yalnızca üreticinin gerçek OEM numarası (tedarikçi stok kodu ASLA buraya yazılmaz). */
  oem: string;
  /** Tedarikçi stok kodu — yalnızca backend/admin içindir. */
  supplier_stock_code: string | null;
  matched_oem: string | null;
  match_type: Exclude<OemMatchType, "NONE">;
  supplier_name: string;
  source_type: "external_supplier";
  /** Taşıtsan satış fiyatı (KDV hariç). Doğrulanamazsa null. */
  price: number | null;
  price_status: "OK" | "UNAVAILABLE";
  in_stock: boolean;
  stock_status: ExternalStockStatus;
  stock_quantity: number | null;
  photo: string | null;
  checked_at: string;
}

export interface ExternalOemLog {
  searched_oem: string;
  normalized_oem: string;
  json_http_status: number | null;
  json_result_count: number;
  matched_oem: string | null;
  match_type: OemMatchType;
  detail_url: string | null;
  detail_http_status: number | null;
  detail_status: DetailStatus;
  product_name: string | null;
  brand: string | null;
  stock_status: ExternalStockStatus;
  stock_quantity: number | null;
  price: number | null;
  price_status: "OK" | "UNAVAILABLE";
  source_type: "external_supplier";
  supplier: string;
  frontend_result_count: number;
  final_status: "SUCCESS" | "REJECTED" | "NOT_FOUND" | "ERROR";
  failure_reason: string | null;
}

type Sb = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Tedarikçi hata kaydı — yalnızca yönetici (service-role) erişimi varsa yazılır. */
async function logSupplierError(sb: Sb | null, supplierId: string, oem: string, message: string) {
  if (!sb || !supplierId || supplierId.startsWith("env:")) return;
  const now = new Date().toISOString();
  try {
    await sb.from("suppliers").update({ last_error: message.slice(0, 500), last_error_at: now }).eq("id", supplierId);
    await sb.from("supplier_scan_errors").insert({
      supplier_id: supplierId,
      oem,
      error_type: "live_oem_lookup",
      error_message: message.slice(0, 1000),
      attempts: 1,
    });
  } catch {
    /* log hatası akışı bozmaz */
  }
}


/** Pipeline eşleşme türünü müşteriye açık OEM doğrulama seviyesine indirger. */
function toMatchType(raw: string | null | undefined): OemMatchType {
  if (raw === "exact_oem") return "EXACT";
  if (raw === "normalized_oem" || raw === "product_code") return "NORMALIZED";
  return "NONE";
}

function validPrice(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Bir OEM için OnlineParça sonucunu CANLI doğrular.
 *
 * Garantiler:
 *  - Taşıtsan ürün/stok tablosuna hiçbir kayıt yazılmaz (otomatik ürün oluşturma yok).
 *  - OEM doğrulanamazsa (EXACT/NORMALIZED değilse) sonuç gösterilmez.
 *  - Detay bağlantısı yoksa doğrulanmış arama satırı kullanılır; ürün gizlenmez.
 *  - Stok yalnızca gerçekten okunduğunda gösterilir; belirsizse UNVERIFIED (asla "Stokta").
 *  - Fiyat yalnızca OnlineParça'dan okunan geçerli değerden türetilir; yoksa UNAVAILABLE.
 */
export async function lookupExternalOemServer(
  rawOem: string,
  _force = false,
): Promise<{ result: ExternalOemPublicResult | null; error: string | null; log: ExternalOemLog | null }> {
  const { getServiceRoleClient } = await import("@/lib/supabase-admin.server");
  const sb = getServiceRoleClient() as Sb | null;
  const { normalizeOem, VerificationRequiredError } = await import("./supplier-scan.server");

  const oem = rawOem.trim();
  if (oem.length < 3) return { result: null, error: null, log: null };
  const oemNorm = normalizeOem(oem);

  // Tedarikçi yapılandırması: DB (Lovable Cloud) → yoksa ENV (self-host).
  const { loadOnlineParcaSupplier } = await import("./onlineparca-pipeline.server");
  const supplier = await loadOnlineParcaSupplier();
  if (!supplier) return { result: null, error: null, log: null };

  const supplierName = supplier.name ?? "OnlineParca";
  const margin = Number(supplier.default_margin ?? 0);


  const base: ExternalOemLog = {
    searched_oem: oem,
    normalized_oem: oemNorm,
    json_http_status: null,
    json_result_count: 0,
    matched_oem: null,
    match_type: "NONE",
    detail_url: null,
    detail_http_status: null,
    detail_status: "SKIPPED",
    product_name: null,
    brand: null,
    stock_status: "UNVERIFIED",
    stock_quantity: null,
    price: null,
    price_status: "UNAVAILABLE",
    source_type: "external_supplier",
    supplier: supplierName,
    frontend_result_count: 0,
    final_status: "NOT_FOUND",
    failure_reason: null,
  };

  const emit = (log: ExternalOemLog) => {
    console.info("[onlineparca][oem-verify]", JSON.stringify(log));
    return log;
  };

  try {
    const { searchOnlineParcaByOem } = await import("./onlineparca-search.server");
    // save:false → OnlineParça ürünü Taşıtsan envanterine ASLA eklenmez.
    const { run, diagnostics } = await searchOnlineParcaByOem(oem, {
      save: false,
      supplierId: supplier.id as string,
    });
    const now = new Date().toISOString();

    base.json_http_status = diagnostics.searchHttpStatus;
    base.json_result_count = diagnostics.resultCount;
    base.detail_url = diagnostics.detailUrl;
    base.detail_http_status = diagnostics.detailHttpStatus;
    base.product_name = diagnostics.productName;
    base.brand = diagnostics.brand;

    // Tedarikçi durum güncellemesi yalnızca yönetici erişimi varsa; müşteri akışını bloklamaz.
    if (sb && !supplier.id.startsWith("env:")) {
      try {
        await sb
          .from("suppliers")
          .update({ last_success_at: now, last_sync_at: now, last_error: null })
          .eq("id", supplier.id);
      } catch {
        /* durum güncellemesi hatası aramayı bozmaz */
      }
    }


    const product = run.product;
    if (!product) {
      base.final_status = run.errorCode ? "ERROR" : "NOT_FOUND";
      base.failure_reason = run.errorCode ? `${run.errorCode}: ${run.message}` : "NO_RESULT";
      return { result: null, error: null, log: emit(base) };
    }

    // 1) OEM EŞLEŞME KONTROLÜ
    const matchType = toMatchType(product.match_type);
    base.matched_oem = product.product_code ?? product.oem ?? null;
    base.match_type = matchType;
    if (matchType === "NONE") {
      base.final_status = "REJECTED";
      base.failure_reason = "OEM_NOT_VERIFIED";
      return { result: null, error: null, log: emit(base) };
    }

    // 2) ÜRÜN DETAY DOĞRULAMASI — link yoksa arama satırı geçerli kaynaktır.
    const detailStep = run.steps.find((s) => s.step === "4_DETAIL_REQUEST");
    const detailOk = detailStep?.status === "PASS" && detailStep.httpStatus === 200;
    const detailSkipped = detailStep?.status === "SKIP";
    base.detail_status = detailOk ? "OK" : detailSkipped ? "SKIPPED" : "FAILED";
    const hasCoreData = !!product.product_name;
    if (!hasCoreData) {
      base.detail_status = "INVALID";
      base.final_status = "REJECTED";
      base.failure_reason = "DETAIL_INVALID";
      return { result: null, error: null, log: emit(base) };
    }
    if (!detailOk && !detailSkipped) base.failure_reason = "DETAIL_FAILED_USING_SEARCH_ROW";

    // 3) STOK — tahmin yok; okunamazsa UNVERIFIED.
    const stockStatus: ExternalStockStatus =
      product.stock_status === "in_stock"
        ? "IN_STOCK"
        : product.stock_status === "out_of_stock"
          ? "OUT_OF_STOCK"
          : product.stock_status === "ask"
            ? "ASK"
            : "UNVERIFIED";
    base.stock_status = stockStatus;
    base.stock_quantity = product.stock_quantity ?? null;

    // 4) FİYAT — yalnızca OnlineParça'dan okunan geçerli değer.
    const cost = validPrice(product.list_price);
    const sale = cost != null ? validPrice(calcSupplierSalePrice(cost, margin)) : null;
    base.price = sale;
    base.price_status = sale != null ? "OK" : "UNAVAILABLE";

    const result: ExternalOemPublicResult = {
      title: product.product_name as string,
      brand: product.brand,
      // Müşteriye yalnızca aranan gerçek üretici OEM'i gösterilir; tedarikçi stok kodu değil.
      oem: oem,
      supplier_stock_code: product.product_code ?? null,
      matched_oem: base.matched_oem,
      match_type: matchType,
      supplier_name: supplierName,
      source_type: "external_supplier",
      price: sale,
      price_status: sale != null ? "OK" : "UNAVAILABLE",
      in_stock: stockStatus === "IN_STOCK",
      stock_status: stockStatus,
      stock_quantity: product.stock_quantity ?? null,
      photo: product.image_url,
      checked_at: now,
    };

    base.frontend_result_count = 1;
    base.final_status = "SUCCESS";
    return { result, error: null, log: emit(base) };
  } catch (err) {
    const verification = err instanceof VerificationRequiredError;
    const message = verification
      ? "OnlineParça doğrulaması gerekiyor."
      : err instanceof Error
        ? err.message
        : "Tedarikçi sorgusu başarısız";
    await logSupplierError(sb, supplier.id as string, oem, message);
    base.final_status = "ERROR";
    base.failure_reason = message;
    return { result: null, error: message, log: emit(base) };
  }
}

/** Kâr oranı değiştiğinde harici ürünlerin satış fiyatlarını yeniden hesaplar. */
export async function recalcSupplierPricesServer(supplierId: string) {
  const { requireServiceRoleClient } = await import("@/lib/supabase-admin.server");
  const sb = requireServiceRoleClient("Tedarikçi fiyat güncelleme") as unknown as Sb;

  const { data: supplier } = await sb
    .from("suppliers")
    .select("id, name, default_margin")
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplier) throw new Error("Tedarikçi bulunamadı");
  const margin = Number(supplier.default_margin ?? 0);

  const { data: costs } = await sb
    .from("part_supplier_costs")
    .select("part_id, supplier_cost_price")
    .eq("supplier_id", supplierId)
    .limit(20000);

  let updated = 0;
  for (const c of costs ?? []) {
    const cost = Number(c.supplier_cost_price ?? 0);
    if (!cost) continue;
    const sale = calcSupplierSalePrice(cost, margin);
    await sb.from("part_supplier_costs").update({ margin_percent: margin, sale_price: sale }).eq("part_id", c.part_id);
    await sb.from("parts").update({ price: sale }).eq("id", c.part_id);
    updated++;
  }
  return { updated, margin };
}

/**
 * Sepete eklenirken harici tedarikçi ürününü Taşıtsan `parts` tablosuna kalıcı hale getirir.
 * Kaynak bilgisi (source_type=external_supplier, supplier_*) backend'de korunur;
 * müşteri arayüzünde gösterilmez. Aynı ürün için tekrar çağrıldığında mevcut kayıt güncellenir.
 */
export async function materializeExternalPartServer(
  rawOem: string,
  actor?: { userId?: string | null; source?: string | null },
): Promise<{ part_id: string | null; price: number | null; title: string | null; error: string | null }> {
  // Sepete ekleme kalıcı kayıt oluşturur → service-role zorunlu.
  const { requireServiceRoleClient } = await import("@/lib/supabase-admin.server");
  const sb = requireServiceRoleClient("Harici ürünü sepete ekleme") as unknown as Sb;
  const oem = rawOem.trim();
  if (oem.length < 3) return { part_id: null, price: null, title: null, error: "Geçersiz OEM" };

  const { loadOnlineParcaSupplier: loadCfg } = await import("./onlineparca-pipeline.server");
  const supplier = await loadCfg();
  if (!supplier) return { part_id: null, price: null, title: null, error: "Tedarikçi bulunamadı" };


  try {
    const { searchOnlineParcaByOem } = await import("./onlineparca-search.server");
    // Önce KAYITSIZ sorgula: stokta olmayan ürün Taşıtsan envanterine yazılmaz.
    const { run } = await searchOnlineParcaByOem(oem, { save: false, supplierId: supplier.id as string });
    const product = run.product;
    if (!product) {
      console.info("[onlineparca][cart-materialize]", JSON.stringify({ oem, ok: false, reason: "NOT_FOUND" }));
      return { part_id: null, price: null, title: null, error: "Ürün bulunamadı" };
    }
    const qty = Number(product.stock_quantity ?? 0);
    if (product.stock_status !== "in_stock" || (product.stock_quantity != null && qty < 1)) {
      console.info(
        "[onlineparca][cart-materialize]",
        JSON.stringify({ oem, ok: false, reason: "OUT_OF_STOCK", stock: product.stock_status, qty: product.stock_quantity ?? null }),
      );
      return { part_id: null, price: null, title: null, error: "Ürün şu anda stokta değil" };
    }

    // Yalnızca satılabilir ürün için kalıcı kayıt oluştur.
    const { loadOnlineParcaSupplier, saveExternalProduct } = await import("./onlineparca-pipeline.server");
    const cfg = await loadOnlineParcaSupplier(supplier.id as string);
    if (!cfg) return { part_id: null, price: null, title: null, error: "Tedarikçi bulunamadı" };
    const saved = await saveExternalProduct(cfg, product);
    const partId = saved.part_id;

    // Tetikleyen kullanıcı/işlem izi (seller_id sistem tedarikçi hesabı olarak kalır).
    if (partId) {
      const materializedAt = new Date().toISOString();
      await sb
        .from("parts")
        .update({
          materialized_by_user_id: actor?.userId ?? null,
          materialized_at: materializedAt,
          materialized_source: actor?.source ?? "cart_add",
        })
        .eq("id", partId);
      if (actor?.userId) {
        await sb.from("admin_audit_log").insert({
          actor_id: actor.userId,
          action: "external_part_materialized",
          metadata: {
            part_id: partId,
            oem,
            supplier: "onlineparca",
            action_type: saved.action,
            source: actor.source ?? "cart_add",
          },
        });
      }
    }

    const result = {
      part_id: partId,
      price: saved.sale_price ?? null,
      title: product.product_name ?? null,
      error: partId ? null : "Ürün kaydedilemedi",
    };
    console.info(
      "[onlineparca][cart-materialize]",
      JSON.stringify({
        oem,
        part_id: result.part_id,
        action: saved.action,
        source: actor?.source ?? "cart_add",
        user_id: actor?.userId ?? null,
        ok: !!partId,
      }),
    );
    return result;

  } catch (err) {
    const message = err instanceof Error ? err.message : "Tedarikçi sorgusu başarısız";
    console.info("[onlineparca][cart-materialize]", JSON.stringify({ oem, ok: false, error: message }));
    return { part_id: null, price: null, title: null, error: message };
  }
}

