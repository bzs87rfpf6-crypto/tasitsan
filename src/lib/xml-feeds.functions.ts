import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYNC_INTERVALS = ["manual", "15min", "30min", "1h", "hourly", "6h", "12h", "daily", "weekly"] as const;

const createInput = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().max(2000).regex(/^https?:\/\//i, "URL http(s):// ile başlamalı"),
  sync_interval: z.enum(SYNC_INTERVALS).default("daily"),
  missing_item_action: z.enum(["set_zero", "deactivate", "ignore"]).default("set_zero"),
  template: z.enum(["generic", "logo", "basbug", "dinamik", "motor_asin"]).default("generic"),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createFileInput = z.object({
  name: z.string().trim().min(2).max(120),
  uploaded_path: z.string().trim().min(3).max(500),
  missing_item_action: z.enum(["set_zero", "deactivate", "ignore"]).default("set_zero"),
  template: z.enum(["generic", "logo", "basbug", "dinamik", "motor_asin"]).default("generic"),
  notes: z.string().trim().max(500).optional().nullable(),
});

const idInput = z.object({ id: z.string().uuid() });

const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  sync_interval: z.enum(SYNC_INTERVALS).optional(),
  missing_item_action: z.enum(["set_zero", "deactivate", "ignore"]).optional(),
  status: z.enum(["active", "paused"]).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const previewInput = z.object({
  url: z.string().trim().url().max(2000).regex(/^https?:\/\//i).optional(),
  uploaded_path: z.string().trim().min(3).max(500).optional(),
}).refine((d) => Boolean(d.url) !== Boolean(d.uploaded_path), {
  message: "url veya uploaded_path birinden biri zorunlu",
});

export const createXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(data.url, { method: "HEAD", signal: ctl.signal, redirect: "follow" });
      clearTimeout(t);
      if (!r.ok && r.status !== 405) {
        const g = await fetch(data.url, { headers: { Range: "bytes=0-1024" }, redirect: "follow" });
        if (!g.ok) throw new Error(`URL yanıt vermedi (HTTP ${g.status}).`);
      }
    } catch (e) {
      throw new Error(`URL erişilemedi: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
    }

    const { data: row, error } = await supabase
      .from("xml_feeds")
      .insert({
        seller_id: userId,
        name: data.name,
        url: data.url,
        source_type: "url",
        sync_interval: data.sync_interval,
        missing_item_action: data.missing_item_action,
        template: data.template,
        notes: data.notes ?? null,
      })
      .select("id, name, url, status, sync_interval, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { feed: row };
  });

/**
 * Create a file-backed feed. Client uploads to `xml-uploads/{userId}/...` first,
 * then calls this to register the feed (one-shot import — no auto sync schedule).
 */
export const createXmlFeedFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createFileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Enforce path prefix
    if (!data.uploaded_path.startsWith(`${userId}/`)) {
      throw new Error("Yetkisiz dosya yolu.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: head } = await supabaseAdmin.storage
      .from("xml-uploads")
      .list(data.uploaded_path.split("/").slice(0, -1).join("/"), {
        search: data.uploaded_path.split("/").pop(),
        limit: 1,
      });
    if (!head || head.length === 0) throw new Error("Yüklenen dosya bulunamadı.");

    const { data: row, error } = await supabase
      .from("xml_feeds")
      .insert({
        seller_id: userId,
        name: data.name,
        url: null,
        source_type: "file",
        uploaded_path: data.uploaded_path,
        sync_interval: "weekly", // file feeds = one-shot, schedule effectively unused
        missing_item_action: data.missing_item_action,
        template: data.template,
        notes: data.notes ?? null,
      })
      .select("id, name, url, status, source_type, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { feed: row };
  });

export const listMyXmlFeeds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("xml_feeds")
      .select(
        "id, name, url, status, sync_interval, missing_item_action, template, notes, last_sync_at, next_sync_at, last_status, last_error, total_products, consecutive_failures, created_at, approved_at, rejection_reason, source_type, uploaded_path",
      )
      .eq("seller_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { feeds: data ?? [] };
  });

export const updateXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("xml_feeds").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    // Best-effort cleanup of uploaded file
    const { data: feed } = await context.supabase
      .from("xml_feeds")
      .select("uploaded_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("xml_feeds").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (feed?.uploaded_path) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("xml-uploads").remove([feed.uploaded_path]);
      } catch { /* ignore */ }
    }
    return { ok: true };
  });

export const listMyXmlRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ feed_id: z.string().uuid(), limit: z.number().min(1).max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("xml_sync_runs")
      .select(
        "id, status, triggered_by, items_total, items_added, items_updated, items_deactivated, items_failed, duration_ms, error, errors, started_at, finished_at",
      )
      .eq("feed_id", data.feed_id)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

/**
 * Manual sync — only seller of the feed OR admin. Loads admin client inside.
 */
export const runXmlFeedNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: feed, error } = await supabase
      .from("xml_feeds")
      .select("id, seller_id, url, name, status, missing_item_action, sync_interval, source_type, uploaded_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !feed) throw new Error("XML kaydı bulunamadı.");

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isOwner = feed.seller_id === userId;
    if (!isOwner && !isAdmin) throw new Error("Yetkiniz yok.");
    if (feed.status !== "active" && !isAdmin) {
      throw new Error("XML aktif değil. Önce yönetici onayı gerekir.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runFeedSync } = await import("@/lib/xml-sync.server");
    const { result, runId } = await runFeedSync(
      supabaseAdmin,
      feed as Parameters<typeof runFeedSync>[1],
      isAdmin ? "admin" : "manual",
    );

    await supabase.from("admin_audit_log").insert({
      actor_id: userId,
      action: "xml_feed_run",
      metadata: { feed_id: feed.id, run_id: runId, ...result, errors: undefined },
    });

    return { runId, result };
  });

/**
 * Generate a short-lived signed upload URL so the browser can PUT the XML file directly.
 * Path is enforced under {userId}/.
 */
export const createXmlUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filename: z.string().trim().min(1).max(200).regex(/^[\w.\- ]+\.(xml|xml\.gz|gz|zip)$/i, "Yalnızca .xml, .xml.gz veya .zip dosyaları"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const safe = data.filename.replace(/[^\w.\-]/g, "_");
    const path = `${userId}/${Date.now()}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("xml-uploads")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Yükleme URL'i oluşturulamadı.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/**
 * Return a CSV of errors for a single sync run.
 */
export const exportXmlRunErrorsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run, error } = await supabase
      .from("xml_sync_runs")
      .select("id, feed_id, seller_id, errors, started_at")
      .eq("id", data.run_id)
      .maybeSingle();
    if (error || !run) throw new Error("Sync kaydı bulunamadı.");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (run.seller_id !== userId && !isAdmin) throw new Error("Yetkiniz yok.");

    const errs = (run.errors as Array<{ index: number; reason: string }> | null) ?? [];
    const lines = ["index,reason"];
    for (const e of errs) {
      const reason = (e.reason ?? "").replace(/"/g, '""');
      lines.push(`${e.index},"${reason}"`);
    }
    return { csv: lines.join("\n"), filename: `xml-run-${run.id}.csv` };
  });

/**
 * Önizleme: URL veya yüklenmiş dosyadan XML'i indirir, ayrıştırır ve
 * kaydetmeden istatistik + ilk 20 örnek döndürür. "XML Test Et" butonu
 * bunu çağırır.
 */
export const previewXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { extractXmlString, parseXmlFeed } = await import("@/lib/xml-parser.server");

    let buf: Buffer;
    let source: string;
    try {
      if (data.url) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(data.url, { redirect: "follow", signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        buf = Buffer.from(await r.arrayBuffer());
        source = data.url;
      } else {
        const path = data.uploaded_path!;
        if (!path.startsWith(`${userId}/`)) throw new Error("Yetkisiz dosya yolu");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file, error } = await supabaseAdmin.storage
          .from("xml-uploads").download(path);
        if (error || !file) throw new Error(error?.message ?? "Dosya bulunamadı");
        buf = Buffer.from(await file.arrayBuffer());
        source = path;
      }
    } catch (e) {
      throw new Error(`XML alınamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
    }

    let xml: string;
    let archiveEntry: string | undefined;
    try {
      const r = await extractXmlString(buf);
      xml = r.xml;
      archiveEntry = r.source_name;
    } catch (e) {
      throw new Error(`Açma hatası: ${e instanceof Error ? e.message : String(e)}`);
    }

    const parsed = parseXmlFeed(xml);
    const withPrice = parsed.items.filter((i) => i.price != null && i.price > 0).length;
    const withImage = parsed.items.filter((i) => i.photos.length > 0).length;
    const missing   = parsed.items.filter((i) => !i.brand || !i.price || i.photos.length === 0).length;

    const sample = parsed.items.slice(0, 20).map((i) => ({
      title: i.title,
      brand: i.brand,
      oem: i.oem_codes[0] ?? null,
      oem_count: i.oem_codes.length,
      price: i.price,
      stock: i.stock,
      image: i.photos[0] ?? null,
    }));

    return {
      ok: true as const,
      source,
      archive_entry: archiveEntry ?? null,
      size_bytes: buf.length,
      stats: {
        total: parsed.items.length,
        brands: parsed.brand_count,
        oems: parsed.oem_count,
        images: parsed.image_count,
        with_price: withPrice,
        with_image: withImage,
        missing_data: missing,
        errors: parsed.errors.length,
      },
      sample,
      first_errors: parsed.errors.slice(0, 10),
    };
  });
