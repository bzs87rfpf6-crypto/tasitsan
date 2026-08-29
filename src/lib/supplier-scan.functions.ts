import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

/* ---------------- şemalar ---------------- */

const settingsSchema = z.object({
  supplierId: z.string().uuid(),
  login_url: z.string().url().nullable().optional(),
  search_url_template: z.string().min(4).nullable().optional(),
  username: z.string().max(200).nullable().optional(),
  password: z.string().max(500).optional(),
  active: z.boolean().optional(),
  default_margin: z.number().min(0).max(500).optional(),
  min_stock: z.number().int().min(0).max(10000).optional(),
});

const startSchema = z.object({
  supplierId: z.string().uuid(),
  oems: z.array(z.string().min(2).max(60)).min(1).max(10000),
  margin: z.number().min(0).max(500),
  minStock: z.number().int().min(0).max(10000),
});

export interface ScanResultRow {
  job_id: string;
  supplier_id: string;
  oem: string;
  oem_norm: string;
  scanned_at: string;
  status: string;
  product_name?: string | null;
  brand?: string | null;
  supplier_product_code?: string | null;
  stock_quantity?: number | null;
  supplier_price?: number | null;
  sale_price?: number | null;
  product_url?: string | null;
  gtin?: string | null;
  image_url?: string | null;
  error_message?: string | null;
}

interface ScanErrorRow {
  job_id: string;
  supplier_id: string;
  oem: string;
  error_type: string;
  error_message: string;
  attempts: number;
}

const chunkSchema = z.object({
  jobId: z.string().uuid(),
  oems: z.array(z.string().min(2).max(60)).min(1).max(10),
});

/* ---------------- yardımcılar ---------------- */

type AuthedSupabase = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  await assertOwnerAdmin(context.supabase as AuthedSupabase, context.userId);
}

function secretKeyFor(supplierId: string) {
  return `supplier_pw_${supplierId}`;
}

/* ---------------- tedarikçiler ---------------- */

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("suppliers")
      .select(
        "id, name, supplier_type, product_type, active, login_url, search_url_template, username, password_secret_key, default_margin, min_stock, last_connected_at, last_scan_at, created_at, updated_at",
      )
      .order("name");
    if (error) throw new Error(error.message);
    // Şifre asla dönmez; yalnızca "kayıtlı mı" bilgisi döner.
    return (data ?? []).map(({ password_secret_key, ...rest }) => ({
      ...rest,
      has_password: !!password_secret_key,
    }));
  });

export const saveSupplierSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    type SupplierPatch = {
      login_url?: string | null;
      search_url_template?: string | null;
      username?: string | null;
      active?: boolean;
      default_margin?: number;
      min_stock?: number;
      password_secret_key?: string;
    };
    const patch: SupplierPatch = {};
    if (data.login_url !== undefined) patch.login_url = data.login_url ?? null;
    if (data.search_url_template !== undefined) patch.search_url_template = data.search_url_template ?? null;
    if (data.username !== undefined) patch.username = data.username ?? null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.default_margin !== undefined) patch.default_margin = data.default_margin;
    if (data.min_stock !== undefined) patch.min_stock = data.min_stock;

    if (data.password) {
      const key = secretKeyFor(data.supplierId);
      const { error: sErr } = await supabaseAdmin
        .from("app_secrets")
        .upsert({ key, value: data.password, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (sErr) throw new Error("Şifre kaydedilemedi");
      patch.password_secret_key = key;
    }

    const { error } = await context.supabase.from("suppliers").update(patch).eq("id", data.supplierId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadCredentials(supplierId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: supplier, error } = await supabaseAdmin
    .from("suppliers")
    .select("id, name, active, login_url, search_url_template, username, password_secret_key, default_margin, min_stock")
    .eq("id", supplierId)
    .maybeSingle();
  if (error || !supplier) throw new Error("Tedarikçi bulunamadı");
  if (!supplier.login_url) {
    throw new Error("Tedarikçi ayarları eksik: giriş URL'si gerekli.");
  }

  if (!supplier.username || !supplier.password_secret_key) {
    throw new Error("Tedarikçi hesap bilgileri eksik.");
  }
  const { data: secret } = await supabaseAdmin
    .from("app_secrets")
    .select("value")
    .eq("key", supplier.password_secret_key)
    .maybeSingle();
  if (!secret?.value) throw new Error("Tedarikçi şifresi bulunamadı.");
  return { supplier, password: secret.value as string };
}

export const testSupplierConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ supplierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { loginSupplier, VerificationRequiredError } = await import("./supplier-scan.server");
    try {
      const { supplier, password } = await loadCredentials(data.supplierId);
      await loginSupplier({ loginUrl: supplier.login_url!, username: supplier.username!, password });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("suppliers")
        .update({ last_connected_at: new Date().toISOString() })
        .eq("id", data.supplierId);
      return { ok: true as const, message: "Bağlantı başarılı." };
    } catch (err) {
      const verification = err instanceof VerificationRequiredError;
      return {
        ok: false as const,
        verification,
        message: verification
          ? "OnlineParça doğrulaması gerekiyor."
          : err instanceof Error
            ? err.message
            : "Bağlantı hatası",
      };
    }
  });

/* ---------------- tarama ---------------- */

export const startSupplierScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { normalizeOem } = await import("./supplier-scan.server");
    const unique = [...new Set(data.oems.map((o) => o.trim()).filter(Boolean))];
    const { data: job, error } = await context.supabase
      .from("supplier_scan_jobs")
      .insert({
        supplier_id: data.supplierId,
        total_oems: unique.length,
        margin: data.margin,
        min_stock: data.minStock,
        status: "running",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message ?? "Tarama başlatılamadı");
    return { jobId: job.id as string, oems: unique, normalized: unique.map(normalizeOem) };
  });

export const scanSupplierChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => chunkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { loginSupplier, searchOem, withRetry, normalizeOem, calcSalePrice, VerificationRequiredError } =
      await import("./supplier-scan.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("supplier_scan_jobs")
      .select("id, supplier_id, margin, min_stock, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobErr || !job) throw new Error("Tarama işi bulunamadı");

    const { supplier, password } = await loadCredentials(job.supplier_id as string);

    let session;
    try {
      session = await loginSupplier({
        loginUrl: supplier.login_url!,
        username: supplier.username!,
        password,
      });
    } catch (err) {
      const verification = err instanceof VerificationRequiredError;
      await supabaseAdmin
        .from("supplier_scan_jobs")
        .update({
          status: verification ? "verification_required" : "failed",
          completed_at: new Date().toISOString(),
          note: verification ? "OnlineParça doğrulaması gerekiyor." : "Giriş başarısız",
        })
        .eq("id", data.jobId);
      return {
        halted: true,
        verification,
        message: verification
          ? "OnlineParça doğrulaması gerekiyor. Tarama durduruldu."
          : "Tedarikçiye giriş yapılamadı.",
        results: [] as ScanResultRow[],
      };
    }

    const margin = Number(job.margin ?? 25);
    const minStock = Number(job.min_stock ?? 1);
    const rows: ScanResultRow[] = [];
    const errors: ScanErrorRow[] = [];
    let halted = false;
    let verification = false;

    for (const oem of data.oems) {
      if (halted) break;
      const base = {
        job_id: data.jobId,
        supplier_id: job.supplier_id as string,
        oem,
        oem_norm: normalizeOem(oem),
        scanned_at: new Date().toISOString(),
      };
      try {
        const hit = await withRetry(() => searchOem(session!, supplier.search_url_template ?? "", oem), 2, 700);
        const enoughStock = hit.stock_quantity == null || hit.stock_quantity >= minStock;
        const status = hit.status === "IN_STOCK" && !enoughStock ? "OUT_OF_STOCK" : hit.status;
        rows.push({
          ...base,
          status,
          product_name: hit.product_name,
          brand: hit.brand,
          supplier_product_code: hit.supplier_product_code,
          stock_quantity: hit.stock_quantity,
          supplier_price: hit.supplier_price,
          sale_price: hit.supplier_price != null ? calcSalePrice(hit.supplier_price, margin) : null,
          product_url: hit.product_url,
          gtin: hit.gtin,
          image_url: hit.image_url,
        });
      } catch (err) {
        if (err instanceof VerificationRequiredError) {
          halted = true;
          verification = true;
          break;
        }
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        rows.push({ ...base, status: "ERROR", error_message: message });
        errors.push({
          job_id: data.jobId,
          supplier_id: job.supplier_id as string,
          oem,
          error_type: "scan",
          error_message: message,
          attempts: 2,
        });
      }
      // Tedarikçi sunucusuna nazik davran
      await new Promise((r) => setTimeout(r, 350));
    }

    if (rows.length) await supabaseAdmin.from("supplier_scan_results").insert(rows);
    if (errors.length) await supabaseAdmin.from("supplier_scan_errors").insert(errors);

    const counts = {
      processed: rows.length,
      inStock: rows.filter((r) => r.status === "IN_STOCK").length,
      outOfStock: rows.filter((r) => r.status === "OUT_OF_STOCK").length,
      notFound: rows.filter((r) => r.status === "NOT_FOUND").length,
      errors: rows.filter((r) => r.status === "ERROR").length,
    };

    const { data: current } = await supabaseAdmin
      .from("supplier_scan_jobs")
      .select("processed_count, in_stock_count, out_of_stock_count, not_found_count, error_count, found_count")
      .eq("id", data.jobId)
      .maybeSingle();

    await supabaseAdmin
      .from("supplier_scan_jobs")
      .update({
        processed_count: (current?.processed_count ?? 0) + counts.processed,
        in_stock_count: (current?.in_stock_count ?? 0) + counts.inStock,
        out_of_stock_count: (current?.out_of_stock_count ?? 0) + counts.outOfStock,
        not_found_count: (current?.not_found_count ?? 0) + counts.notFound,
        error_count: (current?.error_count ?? 0) + counts.errors,
        found_count: (current?.found_count ?? 0) + counts.inStock + counts.outOfStock,
        ...(halted
          ? { status: "verification_required", completed_at: new Date().toISOString(), note: "OnlineParça doğrulaması gerekiyor." }
          : {}),
      })
      .eq("id", data.jobId);

    return {
      halted,
      verification,
      message: halted ? "OnlineParça doğrulaması gerekiyor. Tarama durduruldu." : "",
      results: rows,
    };
  });

export const finishSupplierScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), status: z.enum(["completed", "cancelled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: job } = await context.supabase
      .from("supplier_scan_jobs")
      .update({ status: data.status, completed_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .select("*")
      .maybeSingle();
    if (job?.supplier_id) {
      await context.supabase
        .from("suppliers")
        .update({ last_scan_at: new Date().toISOString() })
        .eq("id", job.supplier_id);
    }
    return job;
  });

export const listSupplierScanJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ supplierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: jobs, error } = await context.supabase
      .from("supplier_scan_jobs")
      .select("*")
      .eq("supplier_id", data.supplierId)
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return jobs ?? [];
  });

export const getSupplierScanResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("supplier_scan_results")
      .select("*")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Taşıtsan'daki mevcut OEM listesinden örnek çeker (test taraması için). */
export const sampleTasitsanOems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("parts")
      .select("oem_code")
      .not("oem_code", "is", null)
      .neq("oem_code", "")
      .order("created_at", { ascending: false })
      .limit(data.limit * 3);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const code = (r.oem_code ?? "").trim();
      if (code) set.add(code);
      if (set.size >= data.limit) break;
    }
    return [...set];
  });

/**
 * OEM Arama Teknik Testi — tek OEM için giriş + gerçek arama isteğini
 * adım adım raporlar. Şifre/çerez/oturum bilgisi ASLA döndürülmez.
 */
export const probeSupplierOem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ supplierId: z.string().uuid(), oem: z.string().min(2).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    try {
      // Teknik test ve müşteri araması aynı ortak endpoint/parser/pipeline'ı kullanır.
      const { searchOnlineParcaByOem } = await import("./onlineparca-search.server");
      const { run, diagnostics } = await searchOnlineParcaByOem(data.oem, {
        save: false,
        supplierId: data.supplierId,
      });
      const product = run.product;
      const login = run.steps.find((step) => step.step === "0_LOGIN");
      const search = run.steps.find((step) => step.step === "1_SEARCH" && step.status === "PASS") ??
        run.steps.find((step) => step.step === "1_SEARCH");
      const detail = run.steps.find((step) => step.step === "4_DETAIL_REQUEST");
      const price = run.steps.find((step) => step.step === "6_PRICE");
      const stock = run.steps.find((step) => step.step === "7_STOCK");
      const found = product != null;
      const hit = product
        ? {
            status: product.stock_status === "out_of_stock" ? "OUT_OF_STOCK" as const : "IN_STOCK" as const,
            product_name: product.product_name,
            brand: product.brand,
            supplier_product_code: product.product_code,
            stock_quantity: product.stock_quantity,
            supplier_price: product.list_price,
            product_url: product.external_source_url,
            gtin: null,
            image_url: product.image_url,
          }
        : null;
      const finalCode = found
        ? product.list_price == null
          ? "PRICE_PARSE_FAILED" as const
          : product.stock_status === "unknown"
            ? "STOCK_PARSE_FAILED" as const
            : "SUCCESS" as const
        : run.errorCode === "SEARCH_PARSE_ERROR" || run.errorCode === "PRODUCT_MATCH_ERROR"
          ? "PRODUCT_PARSE_FAILED" as const
          : "NOT_FOUND" as const;
      const parseCandidates = run.candidates.map((candidate, index) => ({
        index: index + 1,
        url: candidate.url,
        title: candidate.name,
        isProduct: true,
        oemMatch: candidate.matchType !== "none",
        priceFound: candidate.price != null,
        stockFound: candidate.stock !== "unknown",
        sku: candidate.sku,
        brand: null,
        imageFound: false,
        signals: [candidate.matchType],
        result: candidate.matchType === "none" ? "REJECTED" : "ACCEPTED",
      }));
      const debug = {
        inputOem: data.oem,
        normalizedOem: run.normalizedOem,
        requestUrl: diagnostics.searchUrl ?? "",
        method: "GET",
        status: diagnostics.searchHttpStatus ?? 0,
        redirected: false,
        finalUrl: diagnostics.searchUrl ?? "",
        contentType: "text/html",
        bodyPreview: "",
        responseLength: 0,
        productFound: found,
        detailVerified: detail?.status === "PASS",
        priceFound: price?.status === "PASS",
        stockFound: stock?.status === "PASS",
        finalCode,
        userMessage: found ? run.message : run.message || "Ürün bulunamadı.",
        searchSource: "product-search" as const,
        serverHtmlProductFound: run.candidates.length > 0,
        ajax: {
          tried: false, endpoint: null, method: "GET", status: null, contentType: null,
          itemCount: 0, productCount: 0, firstProductUrl: null, firstProductLabel: null,
          rawPreview: null, detailStatus: null, detailUrl: null, detailName: null,
          detailBrand: null, detailSku: null, detailStock: null, detailPrice: null,
          oemMatch: null, continuedToSearch: true,
          note: "Autocomplete yardımcıdır; ortak HTML pipeline sonucu esas alındı.",
        },
        productSearch: {
          tried: true,
          method: "GET",
          url: diagnostics.searchUrl,
          status: diagnostics.searchHttpStatus,
          contentType: "text/html",
          resultCount: diagnostics.resultCount,
          firstProductUrl: run.candidates[0]?.url ?? null,
          firstProductName: run.candidates[0]?.name ?? null,
          firstBrand: product?.brand ?? null,
          firstSku: run.candidates[0]?.sku ?? null,
          firstPrice: run.candidates[0]?.price ?? null,
          firstStock: product?.stock_quantity ?? null,
          detailTried: detail?.status !== "SKIP" && detail != null,
          detailStatus: diagnostics.detailHttpStatus,
          detailContentType: detail?.status === "PASS" ? "text/html" : null,
          oemMatch: product ? product.match_type !== "none" : null,
          failureStep: run.errorCode,
        },
        parse: {
          cardFound: run.candidates.length > 0,
          cardSelector: "shared: parseOnlineParcaSearch",
          cardCount: run.candidates.length,
          productUrl: product?.external_source_url ?? null,
          productName: product?.product_name ?? null,
          priceSelector: ".actual-price / .old-price",
          stockSelector: ".mobim-stock-indicator / .stock",
          brandSelector: ".product-picture img[alt]",
          skuSelector: ".mobim-product-sku / .sku",
          detailFetched: detail?.status === "PASS",
          rejectReason: found ? null : run.errorCode,
          candidates: parseCandidates,
          notes: detail?.status === "SKIP" ? ["Detay URL yok; arama satırı kullanıldı."] : [],
        },
      };
      return {
        ok: true as const,
        loginOk: login?.status === "PASS",
        steps: run.steps.map((step) => `${step.step}: ${step.status}${step.info ? ` — ${step.info}` : ""}`),
        debug,
        discovered: null,
        found,
        hit,
        error: found ? null : run.message,
      };
    } catch (err) {
      return {
        ok: false as const,
        loginOk: false,
        steps: [],
        debug: null,
        discovered: null,
        found: false,
        hit: null,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      };
    }
  });

/** Referans OEM'ler ve son NOT_FOUND kayıtları için tek oturumlu regresyon testi. */
export const runSupplierOemRegression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ supplierId: z.string().uuid(), limit: z.number().int().min(10).max(20).default(12) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { loginSupplier, searchOemDebug, normalizeOem } = await import("./supplier-scan.server");
    const { supplier, password } = await loadCredentials(data.supplierId);
    const session = await loginSupplier({
      loginUrl: supplier.login_url!,
      username: supplier.username!,
      password,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recent } = await supabaseAdmin
      .from("supplier_scan_results")
      .select("oem, scanned_at")
      .eq("supplier_id", data.supplierId)
      .eq("status", "NOT_FOUND")
      .order("scanned_at", { ascending: false })
      .limit(100);
    const inputs = ["5193124050", "3946003000"];
    const seen = new Set(inputs.map(normalizeOem));
    for (const row of recent ?? []) {
      const raw = String(row.oem ?? "").trim();
      const normalized = normalizeOem(raw);
      if (!raw || seen.has(normalized)) continue;
      inputs.push(raw);
      seen.add(normalized);
      if (inputs.length >= data.limit) break;
    }

    const results = [];
    for (const oem of inputs) {
      const { hit, debug, error } = await searchOemDebug(session, oem, supplier.search_url_template);
      const code = debug.finalCode;
      const classification = code === "NOT_FOUND"
        ? "A"
        : code === "PRODUCT_PARSE_FAILED"
          ? "B"
          : code === "DETAIL_FETCH_FAILED"
            ? "C"
            : code === "PRICE_PARSE_FAILED"
              ? "D"
              : code === "STOCK_PARSE_FAILED"
                ? "E"
                : code === "SEARCH_FAILED" || code === "ONLINEPARCA_TIMEOUT"
                  ? "F"
                  : code === "LOGIN_REQUIRED" || code === "SESSION_EXPIRED"
                    ? "G"
                    : "OK";
      results.push({
        oem,
        normalizedOem: debug.normalizedOem,
        search: debug.status === 200 ? "200" : debug.finalCode,
        product: debug.productFound ? hit?.product_name ?? "FOUND" : "—",
        detail: debug.detailVerified ? "OK" : debug.productFound ? "FAILED" : "—",
        stock: debug.stockFound ? hit?.status ?? "OK" : "—",
        price: debug.priceFound ? hit?.supplier_price ?? null : null,
        finalResult: code,
        classification,
        message: error ?? debug.userMessage,
      });
    }
    return { testedAt: new Date().toISOString(), results };
  });

/** Keşfedilen arama formunu tedarikçi kaydına şablon olarak yazar. */
export const saveDiscoveredSearchTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ supplierId: z.string().uuid(), template: z.string().min(4).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("suppliers")
      .update({ search_url_template: data.template })
      .eq("id", data.supplierId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** OnlineParça uçtan uca boru hattı testi (SEARCH → … → EXTERNAL SAVE). */
export const runOnlineParcaPipelineTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        supplierId: z.string().uuid().optional(),
        oem: z.string().min(2).max(60),
        save: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { searchOnlineParcaByOem } = await import("./onlineparca-search.server");
    const { run, diagnostics } = await searchOnlineParcaByOem(data.oem, {
      save: data.save ?? false,
      ...(data.supplierId ? { supplierId: data.supplierId } : {}),
    });
    return { ...run, diagnostics };
  });

/**
 * Admin: teknik test + GERÇEK müşteri araması aynı OEM için karşılaştırılır.
 * `frontendResultCount`, müşteri ekranının kullandığı fonksiyonun sonucudur.
 */
export const runOnlineParcaOemReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ oems: z.array(z.string().min(2).max(60)).min(1).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { searchOnlineParcaByOem } = await import("./onlineparca-search.server");
    const { lookupExternalOemServer } = await import("./external-oem.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeOem } = await import("./supplier-scan.server");

    const rows = [];
    for (const oem of data.oems) {
      // Teknik test: kayıt YAPILMAZ (otomatik ürün oluşturma yasak).
      const { diagnostics } = await searchOnlineParcaByOem(oem, { save: false });
      const customer = await lookupExternalOemServer(oem, false);

      // Taşıtsan kendi stoğu (harici kayıtlar hariç) — iki kaynak ayrı raporlanır.
      const norm = normalizeOem(oem);
      const { count: internalCount } = await supabaseAdmin
        .from("parts")
        .select("id", { count: "exact", head: true })
        .neq("source_type", "external_supplier")
        .eq("status", "active")
        .ilike("oem_code", `%${norm}%`);

      const log = customer.log;
      rows.push({
        oem,
        tasitsanCount: internalCount ?? 0,
        onlineparcaProduct: diagnostics.productName,
        oemMatch: log?.match_type ?? "NONE",
        detail: log?.detail_status ?? "SKIPPED",
        stock: log?.stock_status ?? "UNVERIFIED",
        stockQuantity: log?.stock_quantity ?? null,
        price: log?.price ?? null,
        priceStatus: log?.price_status ?? "UNAVAILABLE",
        frontendResultCount: customer.result ? 1 : 0,
        finalStatus: log?.final_status ?? (customer.error ? "ERROR" : "NOT_FOUND"),
        failureReason: log?.failure_reason ?? customer.error,
        jsonHttpStatus: diagnostics.searchHttpStatus,
        jsonResultCount: diagnostics.resultCount,
        detailHttpStatus: diagnostics.detailHttpStatus,
        brand: diagnostics.brand,
      });
    }
    return { rows };
  });
