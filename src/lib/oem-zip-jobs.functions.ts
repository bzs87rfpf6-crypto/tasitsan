import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import { Unzip, UnzipInflate } from "fflate";
import { extractOemFromFilename, sanitizeStoragePath } from "@/lib/oem-normalize";


// ============================================================================
// Streaming / batched ZIP processor for the OEM image library.
//
// Why this exists:
//   The old processOemImageZipFromStorage downloaded the whole ZIP into RAM and
//   called fflate's unzipSync, which exceeds the Worker memory budget for ZIPs
//   above ~80MB ("Memory limit would be exceeded before EOF").
//
// Approach:
//   - The client uploads the ZIP to `_uploads/...zip` in storage (XHR with
//     progress) and then calls `startOemImageZipJob` which only creates a job
//     row and returns immediately.
//   - The client polls `tickOemImageZipJob({ job_id })` every few seconds.
//     Each tick:
//       1. Creates a short-lived signed URL for the ZIP
//       2. Streams the response body chunk-by-chunk through fflate's `Unzip`
//          streaming class
//       3. Skips entries with index < cursor_index (no decompression)
//       4. Decompresses and processes the next BATCH_SIZE entries
//       5. Aborts the read once the batch is full
//       6. Persists progress (cursor_index, added, skipped, failed, errors)
//   - Memory is bounded to ~current-file size (≤5MB) + small fflate state.
//   - If the page is closed the job row stays put; reopening and polling the
//     same job_id resumes from cursor_index. Stale jobs are simply not ticked.
// ============================================================================

const BUCKET = "oem-image-library";
const BATCH_SIZE = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ERRORS_KEPT = 50;
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const CT_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function assertAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

// ---------- START ----------

const startSchema = z.object({
  storage_path: z.string().trim().min(1).max(300).regex(/^_uploads\/[A-Za-z0-9_\-./]+\.zip$/i, "Geçersiz storage path"),
  default_brand: z.string().trim().max(60).optional().nullable(),
  source_type: z.enum(["manufacturer_catalog", "supplier_catalog", "manual"]).default("manufacturer_catalog"),
  source_name: z.string().trim().max(120).optional().nullable(),
  zip_size_bytes: z.number().int().min(0).max(600 * 1024 * 1024).optional(),
});

export const startOemImageZipJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the file is reachable so we fail fast.
    const { data: list, error: lsErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .list("_uploads", { search: data.storage_path.replace(/^_uploads\//, "") });
    if (lsErr) throw new Error(`Storage erişim hatası: ${lsErr.message}`);
    if (!list || list.length === 0) throw new Error("Yüklenmiş ZIP bulunamadı.");

    const { data: job, error } = await supabaseAdmin
      .from("oem_zip_jobs")
      .insert({
        user_id: context.userId,
        storage_path: data.storage_path,
        status: "pending",
        default_brand: data.default_brand ?? null,
        source_type: data.source_type,
        source_name: data.source_name ?? null,
        zip_size_bytes: data.zip_size_bytes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { job_id: job.id as string };
  });

// ---------- TICK (process next batch) ----------

const tickSchema = z.object({ job_id: z.string().uuid() });

interface ProcessedEntry {
  index: number;
  outcome: "added" | "skipped" | "failed";
  error?: string;
}

function brandAndOem(path: string, defaultBrand: string | null): { brand: string | null; oem: string; filename: string } | null {
  const parts = path.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] ?? "";
  if (!IMG_EXT.test(filename)) return null;
  const folderBrand = parts.length > 1 ? parts[parts.length - 2] : null;
  const brand = (folderBrand ?? defaultBrand ?? null)?.trim() || null;
  const oem = extractOemFromFilename(filename);
  if (!oem || oem.length < 2) return null;
  return { brand, oem, filename };
}


export const tickOemImageZipJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tickSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load job
    const { data: job, error: jErr } = await supabaseAdmin
      .from("oem_zip_jobs")
      .select("*")
      .eq("id", data.job_id)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("İş bulunamadı.");
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return jobSnapshot(job);
    }

    // Mark processing
    await supabaseAdmin.from("oem_zip_jobs").update({ status: "processing" }).eq("id", job.id);

    // Create a short-lived signed URL for streaming download
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(job.storage_path, 600);
    if (sErr || !signed?.signedUrl) {
      await markFailed(supabaseAdmin, job.id, `ZIP erişilemedi: ${sErr?.message ?? "signed url yok"}`);
      return jobSnapshot({ ...job, status: "failed", error_message: sErr?.message ?? "signed url yok" });
    }

    const resp = await fetch(signed.signedUrl);
    if (!resp.ok || !resp.body) {
      await markFailed(supabaseAdmin, job.id, `ZIP indirilemedi (${resp.status})`);
      return jobSnapshot({ ...job, status: "failed", error_message: `HTTP ${resp.status}` });
    }

    const skipUntil = job.cursor_index as number;
    const stopAt = skipUntil + BATCH_SIZE;
    const defaultBrand = (job.default_brand as string | null) ?? null;
    const sourceType = job.source_type as string;
    const sourceName = (job.source_name as string | null) ?? null;

    let entryIndex = -1;
    let reachedStop = false;
    let streamDone = false;

    // Per-batch counters (added to the persisted totals at the end).
    let bAdded = 0;
    let bSkipped = 0;
    let bFailed = 0;
    let bFilesSeen = 0;
    let bFilesParsed = 0;
    let bStorageUploaded = 0;
    let bDbInserted = 0;
    let bStorageFailed = 0;
    let bDbFailed = 0;
    const newErrors: string[] = [];

    const inflightTasks: Promise<void>[] = [];

    const handleFile = async (
      idx: number,
      path: string,
      bytes: Uint8Array,
    ): Promise<void> => {
      try {
        bFilesSeen++;
        if (bytes.length === 0) {
          bSkipped++;
          newErrors.push(`${path}: boş dosya (0 bayt)`);
          return;
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
          bSkipped++;
          newErrors.push(`${path}: 5MB üstü atlandı (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
          return;
        }
        const meta = brandAndOem(path, defaultBrand);
        if (!meta) {
          bSkipped++;
          newErrors.push(`${path}: OEM ayıklanamadı (uzantı veya isim uygun değil)`);
          return;
        }
        bFilesParsed++;

        const ext = (meta.filename.match(IMG_EXT)?.[0] ?? ".jpg").toLowerCase();
        const contentType = CT_MAP[ext] ?? "image/jpeg";
        const safeBrand = sanitizeStoragePath(meta.brand ?? "_") || "_";
        const safeFile = sanitizeStoragePath(meta.filename).replace(/\//g, "_") || `oem${ext}`;
        // Deterministic path so re-processing the same ZIP is idempotent.
        const storagePath = sanitizeStoragePath(`${safeBrand}/${safeFile}`);

        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType, upsert: true });
        if (upErr && !/already exists|Duplicate/i.test(upErr.message)) {
          bFailed++;
          bStorageFailed++;
          newErrors.push(`${path}: STORAGE ${upErr.message}`);
          return;
        }
        bStorageUploaded++;

        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
        const { error: insErr, count } = await supabaseAdmin.from("oem_image_library").upsert(
          {
            oem: meta.oem,
            brand: meta.brand,
            image_url: pub.publicUrl,
            source_type: sourceType,
            source_name: sourceName,
            confidence: 90,
            verified: true,
            verified_by: context.userId,
            verified_at: new Date().toISOString(),
            uploaded_by: context.userId,
          },
          { onConflict: "oem_normalized,image_url", ignoreDuplicates: true, count: "exact" },
        );
        if (insErr) {
          bFailed++;
          bDbFailed++;
          newErrors.push(`${path}: DB ${insErr.message}`);
          return;
        }
        // count===0 means upsert ignored as duplicate
        if (count === 0) {
          bSkipped++;
          newErrors.push(`${path}: duplicate (aynı OEM+URL zaten var)`);
          return;
        }
        bDbInserted++;
        bAdded++;
      } catch (e) {
        bFailed++;
        newErrors.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    const unzipper = new Unzip();
    unzipper.register(UnzipInflate);

    unzipper.onfile = (file) => {
      entryIndex++;
      const myIdx = entryIndex;
      if (myIdx < skipUntil) return; // skip already-processed
      if (myIdx >= stopAt) {
        // We've reached the next file beyond our batch — signal stop.
        reachedStop = true;
        return;
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      file.ondata = (err, chunk, final) => {
        if (err) {
          bFailed++;
          newErrors.push(`${file.name}: unzip ${err.message}`);
          return;
        }
        if (chunk && chunk.length) {
          total += chunk.length;
          if (total <= MAX_IMAGE_BYTES + 1024) chunks.push(chunk);
        }
        if (final) {
          if (total > MAX_IMAGE_BYTES) {
            bSkipped++;
            newErrors.push(`${file.name}: 5MB üstü atlandı`);
            return;
          }
          const buf = concatBuffers(chunks, total);
          inflightTasks.push(handleFile(myIdx, file.name, buf));
        }
      };
      file.start();
    };

    const reader = resp.body.getReader();
    try {
      while (!reachedStop) {
        const { done, value } = await reader.read();
        if (done) {
          unzipper.push(new Uint8Array(0), true);
          streamDone = true;
          break;
        }
        if (value && value.length) unzipper.push(value, false);
      }
    } catch (e) {
      await markFailed(supabaseAdmin, job.id, `Akış hatası: ${e instanceof Error ? e.message : String(e)}`);
      try { await reader.cancel(); } catch { /* ignore */ }
      return jobSnapshot({ ...job, status: "failed", error_message: e instanceof Error ? e.message : String(e) });
    }
    try { await reader.cancel(); } catch { /* ignore */ }

    await Promise.all(inflightTasks);

    const newCursor = Math.min(entryIndex + 1, stopAt);
    const totalEntries = streamDone ? entryIndex + 1 : (job.total_entries as number | null);
    const done = streamDone;
    const newStatus = done ? "completed" : "processing";

    const mergedErrors = [
      ...((job.errors as string[] | null) ?? []),
      ...newErrors,
    ].slice(-MAX_ERRORS_KEPT);

    console.log(`[oem-zip-job ${job.id}] tick: range=${skipUntil}-${entryIndex} seen=${bFilesSeen} parsed=${bFilesParsed} storage=${bStorageUploaded}/${bStorageFailed} db=${bDbInserted}/${bDbFailed} added=${bAdded} skipped=${bSkipped} failed=${bFailed} done=${done}`);

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("oem_zip_jobs")
      .update({
        cursor_index: newCursor,
        added: (job.added as number) + bAdded,
        skipped: (job.skipped as number) + bSkipped,
        failed: (job.failed as number) + bFailed,
        files_seen: ((job.files_seen as number) ?? 0) + bFilesSeen,
        files_parsed: ((job.files_parsed as number) ?? 0) + bFilesParsed,
        storage_uploaded: ((job.storage_uploaded as number) ?? 0) + bStorageUploaded,
        storage_failed: ((job.storage_failed as number) ?? 0) + bStorageFailed,
        db_inserted: ((job.db_inserted as number) ?? 0) + bDbInserted,
        db_failed: ((job.db_failed as number) ?? 0) + bDbFailed,
        errors: mergedErrors,
        total_entries: totalEntries,
        status: newStatus,
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", job.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);

    if (done) {
      await supabaseAdmin.storage.from(BUCKET).remove([job.storage_path]).catch(() => {});
    }

    return jobSnapshot(updated);
  });

// ---------- CANCEL ----------

export const cancelOemImageZipJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tickSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("oem_zip_jobs")
      .select("storage_path")
      .eq("id", data.job_id)
      .maybeSingle();
    await supabaseAdmin
      .from("oem_zip_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.job_id);
    if (job?.storage_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([job.storage_path as string]).catch(() => {});
    }
    return { ok: true };
  });

// ---------- GET ----------

export const getOemImageZipJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tickSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin
      .from("oem_zip_jobs")
      .select("*")
      .eq("id", data.job_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("İş bulunamadı.");
    return jobSnapshot(job);
  });

// ---------- LIST PENDING UPLOADS (reprocess without re-uploading) ----------

export const listOemImageZipUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list("_uploads", { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((f) => /\.zip$/i.test(f.name))
      .map((f) => ({
        storage_path: `_uploads/${f.name}`,
        size_bytes: (f.metadata as { size?: number } | null)?.size ?? null,
        created_at: f.created_at ?? null,
      }));
  });

// ---------- helpers ----------

function concatBuffers(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function markFailed(
  sb: import("@supabase/supabase-js").SupabaseClient,
  jobId: string,
  message: string,
) {
  await sb
    .from("oem_zip_jobs")
    .update({ status: "failed", error_message: message.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

interface JobRow {
  id: string;
  status: string;
  total_entries: number | null;
  cursor_index: number;
  added: number;
  skipped: number;
  failed: number;
  files_seen: number | null;
  files_parsed: number | null;
  storage_uploaded: number | null;
  storage_failed: number | null;
  db_inserted: number | null;
  db_failed: number | null;
  errors: string[] | null;
  error_message: string | null;
  storage_path: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface OemImageZipJobSnapshot {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  total: number | null;
  processed: number;
  added: number;
  skipped: number;
  failed: number;
  files_seen: number;
  files_parsed: number;
  storage_uploaded: number;
  storage_failed: number;
  db_inserted: number;
  db_failed: number;
  remaining: number | null;
  errors: string[];
  error_message: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
}

function jobSnapshot(job: JobRow | Record<string, unknown>): OemImageZipJobSnapshot {
  const j = job as unknown as JobRow;
  const processed = (j.added ?? 0) + (j.skipped ?? 0) + (j.failed ?? 0);
  const remaining = j.total_entries != null ? Math.max(j.total_entries - processed, 0) : null;
  return {
    id: j.id,
    status: j.status as OemImageZipJobSnapshot["status"],
    total: j.total_entries,
    processed,
    added: j.added ?? 0,
    skipped: j.skipped ?? 0,
    failed: j.failed ?? 0,
    files_seen: j.files_seen ?? 0,
    files_parsed: j.files_parsed ?? 0,
    storage_uploaded: j.storage_uploaded ?? 0,
    storage_failed: j.storage_failed ?? 0,
    db_inserted: j.db_inserted ?? 0,
    db_failed: j.db_failed ?? 0,
    remaining,
    errors: j.errors ?? [],
    error_message: j.error_message,
    done: j.status === "completed" || j.status === "failed" || j.status === "cancelled",
    created_at: j.created_at,
    updated_at: j.updated_at,
  };
}
