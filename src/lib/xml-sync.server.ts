/**
 * XML sync engine — fetch URL, parse, upsert parts, mark missing.
 * Server-only. Uses supabaseAdmin to bypass RLS (caller authorizes upstream).
 */

import { decodeXmlBytes, extractXmlString, parseXmlFeed, type FeedItem, type ParsedFeed } from "./xml-parser.server";
void decodeXmlBytes; // retained export for back-compat

export interface FeedRow {
  id: string;
  seller_id: string;
  url: string | null;
  name: string;
  missing_item_action: "set_zero" | "deactivate" | "ignore";
  sync_interval: "hourly" | "6h" | "12h" | "daily" | "weekly";
  source_type?: "url" | "file";
  uploaded_path?: string | null;
}


export interface SyncResult {
  items_total: number;
  items_added: number;
  items_updated: number;
  items_deactivated: number;
  items_failed: number;
  errors: { index: number; reason: string }[];
  duration_ms: number;
  status: "success" | "partial" | "failed";
  error?: string;
}

const INTERVAL_MS: Record<FeedRow["sync_interval"], number> = {
  hourly: 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ITEMS_PER_SYNC = 5000;

export async function downloadFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TasitsanXmlBot/1.0" },
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cl = Number(r.headers.get("content-length") ?? 0);
    if (cl > MAX_DOWNLOAD_BYTES) throw new Error(`Dosya çok büyük: ${cl} bayt`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error("Dosya çok büyük");
    const { extractXmlString } = await import("./xml-parser.server");
    const { xml } = await extractXmlString(buf);
    return xml;
  } finally {
    clearTimeout(timer);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function upsertItem(
  admin: Admin,
  feed: FeedRow,
  item: FeedItem,
  syncedAt: string,
): Promise<"added" | "updated"> {
  const photos = item.photos;
  const stock = item.stock;
  const partRow = {
    seller_id: feed.seller_id,
    title: item.title,
    description: item.description,
    brand: item.brand,
    model: item.model,
    year: item.year,
    category: item.category,
    oem_code: item.oem_codes[0] ?? null,
    oem_codes: item.oem_codes,
    price: item.price,
    stock_quantity: stock,
    photos,
    condition: item.condition,
    status: "approved" as const,
    whatsapp: "", // not used; XML imports rely on seller profile WhatsApp
    source_feed_id: feed.id,
    external_sku: item.external_sku,
    last_synced_at: syncedAt,
  };

  // Dedupe rules (in order of preference) — SCOPED to this feed to avoid
  // stomping on parts owned by another feed or by manual listings:
  //   1. (source_feed_id = feed.id, external_sku) — most reliable
  //   2. (source_feed_id = feed.id, primary OEM in oem_codes)
  //   3. (seller_id, primary OEM) WHERE source_feed_id IS NULL — one-time
  //      adoption of pre-existing manual listings on first sync.
  //
  // Step 3 prevents the previous bug where rule 2 used to match across all of
  // a seller's listings and could overwrite parts from a different feed.
  const primaryOem = item.oem_codes[0]!;
  let existingId: string | null = null;

  if (item.external_sku) {
    const { data } = await admin
      .from("parts")
      .select("id")
      .eq("source_feed_id", feed.id)
      .eq("external_sku", item.external_sku)
      .maybeSingle();
    if (data?.id) existingId = data.id as string;
  }
  if (!existingId) {
    const { data } = await admin
      .from("parts")
      .select("id")
      .eq("source_feed_id", feed.id)
      .contains("oem_codes", [primaryOem])
      .limit(1)
      .maybeSingle();
    if (data?.id) existingId = data.id as string;
  }
  if (!existingId) {
    // Adopt pre-existing manual listing (no feed owner yet)
    const { data } = await admin
      .from("parts")
      .select("id")
      .eq("seller_id", feed.seller_id)
      .is("source_feed_id", null)
      .contains("oem_codes", [primaryOem])
      .limit(1)
      .maybeSingle();
    if (data?.id) existingId = data.id as string;
  }

  if (existingId) {
    // Update mutable fields only — don't touch admin moderation state.
    const { error } = await admin
      .from("parts")
      .update({
        title: partRow.title,
        description: partRow.description,
        brand: partRow.brand,
        model: partRow.model,
        year: partRow.year,
        category: partRow.category,
        price: partRow.price,
        stock_quantity: partRow.stock_quantity,
        photos: partRow.photos,
        oem_codes: partRow.oem_codes,
        source_feed_id: feed.id,
        external_sku: partRow.external_sku,
        last_synced_at: syncedAt,
      })
      .eq("id", existingId);
    if (error) throw error;
    return "updated";
  }

  const { error } = await admin.from("parts").insert(partRow);
  if (error) throw error;
  return "added";
}

async function handleMissing(
  admin: Admin,
  feed: FeedRow,
  syncedAt: string,
): Promise<number> {
  if (feed.missing_item_action === "ignore") return 0;
  if (feed.missing_item_action === "set_zero") {
    const { count } = await admin
      .from("parts")
      .update({ stock_quantity: 0 })
      .eq("source_feed_id", feed.id)
      .lt("last_synced_at", syncedAt)
      .gt("stock_quantity", 0)
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  }
  // deactivate
  const { count } = await admin
    .from("parts")
    .update({ status: "inactive", stock_quantity: 0 })
    .eq("source_feed_id", feed.id)
    .lt("last_synced_at", syncedAt)
    .neq("status", "inactive")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

export function computeNextSync(interval: FeedRow["sync_interval"]): string {
  return new Date(Date.now() + INTERVAL_MS[interval]).toISOString();
}

export async function runFeedSync(
  admin: Admin,
  feed: FeedRow,
  trigger: "cron" | "manual" | "admin",
): Promise<{ runId: string; result: SyncResult }> {
  const startedAt = new Date();
  const syncedAt = startedAt.toISOString();

  // Open run row
  const { data: runInsert, error: runErr } = await admin
    .from("xml_sync_runs")
    .insert({
      feed_id: feed.id,
      seller_id: feed.seller_id,
      triggered_by: trigger,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runInsert) throw runErr ?? new Error("run row insert failed");
  const runId = runInsert.id as string;

  // Mark feed as running
  await admin
    .from("xml_feeds")
    .update({ last_status: "running" })
    .eq("id", feed.id);

  const result: SyncResult = {
    items_total: 0,
    items_added: 0,
    items_updated: 0,
    items_deactivated: 0,
    items_failed: 0,
    errors: [],
    duration_ms: 0,
    status: "success",
  };

  try {
    let xml: string;
    if (feed.source_type === "file") {
      if (!feed.uploaded_path) throw new Error("Yüklenen dosya yolu bulunamadı.");
      const { data: blob, error: dlErr } = await admin.storage
        .from("xml-uploads")
        .download(feed.uploaded_path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "Dosya indirilemedi.");
      const buf = Buffer.from(await blob.arrayBuffer());
      const ex = await extractXmlString(buf);
      xml = ex.xml;
    } else {
      if (!feed.url) throw new Error("Feed URL tanımlı değil.");
      xml = await downloadFeed(feed.url);
    }
    const parsed: ParsedFeed = parseXmlFeed(xml);
    result.items_total = parsed.items.length;
    result.errors = parsed.errors.slice(0, 50);
    result.items_failed = parsed.errors.length;


    if (parsed.items.length === 0) {
      throw new Error("XML'de tanınan ürün bulunamadı.");
    }
    if (parsed.items.length > MAX_ITEMS_PER_SYNC) {
      throw new Error(`Çok fazla ürün (${parsed.items.length}). Maksimum ${MAX_ITEMS_PER_SYNC}.`);
    }

    // Parallel-chunked upsert. The dedupe lookups inside upsertItem are 1-3
    // round-trips per item — fully sequential 5k items would blow the
    // 12-min Worker invocation budget. A small concurrency (10) keeps the
    // DB pool happy while ~5-10x'ing throughput.
    const UPSERT_CONCURRENCY = 10;
    for (let i = 0; i < parsed.items.length; i += UPSERT_CONCURRENCY) {
      const chunk = parsed.items.slice(i, i + UPSERT_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((item) => upsertItem(admin, feed, item, syncedAt)),
      );
      settled.forEach((s, j) => {
        if (s.status === "fulfilled") {
          if (s.value === "added") result.items_added += 1;
          else result.items_updated += 1;
        } else {
          result.items_failed += 1;
          if (result.errors.length < 50) {
            result.errors.push({
              index: chunk[j].raw_index,
              reason: s.reason instanceof Error ? s.reason.message : "upsert error",
            });
          }
        }
      });
    }

    result.items_deactivated = await handleMissing(admin, feed, syncedAt);

    if (result.items_failed > 0 && result.items_added + result.items_updated > 0) {
      result.status = "partial";
    }
  } catch (e) {
    result.status = "failed";
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    result.duration_ms = Date.now() - startedAt.getTime();

    // Close run row
    await admin
      .from("xml_sync_runs")
      .update({
        status: result.status,
        items_total: result.items_total,
        items_added: result.items_added,
        items_updated: result.items_updated,
        items_deactivated: result.items_deactivated,
        items_failed: result.items_failed,
        duration_ms: result.duration_ms,
        error: result.error ?? null,
        errors: result.errors,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // Update feed state
    const nextSync = computeNextSync(feed.sync_interval);
    const isFailure = result.status === "failed";
    await admin
      .from("xml_feeds")
      .update({
        last_sync_at: syncedAt,
        next_sync_at: nextSync,
        last_status: result.status,
        last_error: result.error ?? null,
        total_products: result.items_total,
        // On success reset the failure streak; on failure leave it for the
        // atomic RPC below so we don't race with concurrent runs.
        consecutive_failures: isFailure ? undefined : 0,
      })
      .eq("id", feed.id);

    if (isFailure) {
      // Atomic increment via SECURITY DEFINER SQL function — no read-then-write race.
      await admin.rpc("xml_feed_increment_failures", { _feed_id: feed.id });
    }
  }

  // (Sitemap ping removed: Google deprecated /ping in June 2023 and Bing
  // shut it down in 2022. SEO discovery now happens via Search Console
  // sitemap submission + organic crawl.)

  return { runId, result };
}

