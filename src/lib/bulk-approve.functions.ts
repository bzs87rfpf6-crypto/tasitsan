import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type PendingReport = {
  total: number;
  missingPrice: number;
  missingOem: number;
  duplicateOemGroups: { oem: string; count: number }[];
  eligible: number;
  ineligible: number;
};

export type ProductStats = {
  total: number;
  active: number;
  pending: number;
  rejected: number;
  duplicates: number;
  duplicateGroups: number;
  deliverySameDay: number;
  deliveryBus: number;
  urgentDelivery: number;
  fetchedAt: string;
};

export const getProductStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductStats> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const countOf = async (status?: "pending" | "approved" | "rejected") => {
      let q = supabaseAdmin.from("parts").select("id", { count: "exact", head: true });
      if (status) q = q.eq("status", status);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const countWhere = async (build: (q: any) => any) => {
      const { count, error } = await build(
        supabaseAdmin.from("parts").select("id", { count: "exact", head: true }),
      );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [total, active, pending, rejected, deliverySameDay, deliveryBus, urgentDelivery, dupRows] = await Promise.all([
      countOf(),
      countOf("approved"),
      countOf("pending"),
      countOf("rejected"),
      countWhere((q) => q.eq("status", "approved").contains("delivery_options", ["same_day"])),
      countWhere((q) => q.eq("status", "approved").contains("delivery_options", ["bus"])),
      countWhere((q) => q.eq("status", "approved").eq("urgent_delivery", true)),
      supabaseAdmin
        .from("parts")
        .select("oem_code, oem_codes, status")
        .neq("status", "rejected"),
    ]);

    if (dupRows.error) throw new Error(dupRows.error.message);
    const counts = new Map<string, number>();
    for (const r of (dupRows.data ?? []) as Array<{ oem_code: string | null; oem_codes: string[] | null }>) {
      const codes = new Set<string>();
      if (r.oem_code) codes.add(r.oem_code.toUpperCase().trim());
      for (const c of r.oem_codes ?? []) {
        const k = (c ?? "").toUpperCase().trim();
        if (k) codes.add(k);
      }
      for (const k of codes) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let duplicates = 0;
    let duplicateGroups = 0;
    for (const n of counts.values()) {
      if (n > 1) {
        duplicateGroups++;
        duplicates += n - 1;
      }
    }

    return {
      total,
      active,
      pending,
      rejected,
      duplicates,
      duplicateGroups,
      deliverySameDay,
      deliveryBus,
      urgentDelivery,
      fetchedAt: new Date().toISOString(),
    };
  });

export const getPendingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingReport> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("parts")
      .select("id, price, oem_code, oem_codes")
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      id: string;
      price: number | null;
      oem_code: string | null;
      oem_codes: string[] | null;
    }>;

    let missingPrice = 0;
    let missingOem = 0;
    let eligible = 0;
    const oemCount = new Map<string, number>();

    for (const r of rows) {
      const noPrice = r.price == null || Number(r.price) <= 0;
      const codes = (r.oem_codes ?? []).filter((c) => c && c.trim());
      const noOem = codes.length === 0 && !r.oem_code;
      if (noPrice) missingPrice++;
      if (noOem) missingOem++;
      if (!noPrice && !noOem) eligible++;
      for (const c of codes) {
        const k = c.toUpperCase().trim();
        if (!k) continue;
        oemCount.set(k, (oemCount.get(k) ?? 0) + 1);
      }
    }

    const duplicateOemGroups = [...oemCount.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([oem, count]) => ({ oem, count }));

    return {
      total: rows.length,
      missingPrice,
      missingOem,
      duplicateOemGroups,
      eligible,
      ineligible: rows.length - eligible,
    };
  });

export type BulkApproveResult = {
  approved: number;
  skipped: number;
  errors: number;
  sitemapResubmitted: boolean;
  sitemapError: string | null;
  startedAt: string;
  finishedAt: string;
};

export const bulkApprovePending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }): Promise<BulkApproveResult> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startedAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("parts")
      .select("id, price, oem_code, oem_codes")
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      id: string;
      price: number | null;
      oem_code: string | null;
      oem_codes: string[] | null;
    }>;

    const eligibleIds: string[] = [];
    let skipped = 0;
    for (const r of rows) {
      const noPrice = r.price == null || Number(r.price) <= 0;
      const codes = (r.oem_codes ?? []).filter((c) => c && c.trim());
      const noOem = codes.length === 0 && !r.oem_code;
      if (noPrice || noOem) skipped++;
      else eligibleIds.push(r.id);
    }

    let approved = 0;
    let errors = 0;
    const CHUNK = 200;
    for (let i = 0; i < eligibleIds.length; i += CHUNK) {
      const slice = eligibleIds.slice(i, i + CHUNK);
      const { data: upd, error: upErr } = await supabaseAdmin
        .from("parts")
        .update({ status: "approved" })
        .in("id", slice)
        .select("id");
      if (upErr) {
        errors += slice.length;
        // eslint-disable-next-line no-console
        console.error("[bulk-approve] chunk failed", upErr.message);
      } else {
        approved += (upd ?? []).length;
        errors += slice.length - (upd ?? []).length;
      }
    }

    // Resubmit sitemap to Google Search Console (best-effort)
    let sitemapResubmitted = false;
    let sitemapError: string | null = null;
    try {
      const lk = process.env.LOVABLE_API_KEY;
      const gk = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
      if (lk && gk) {
        const site = encodeURIComponent("https://www.tasitsan.com.tr/");
        const sm = encodeURIComponent("https://www.tasitsan.com.tr/sitemap.xml");
        const res = await fetch(
          `https://connector-gateway.lovable.dev/google_search_console/webmasters/v3/sites/${site}/sitemaps/${sm}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk },
          },
        );
        if (res.ok || res.status === 204) sitemapResubmitted = true;
        else sitemapError = `GSC ${res.status}`;
      } else {
        sitemapError = "GSC bağlantısı yok";
      }
    } catch (e) {
      sitemapError = e instanceof Error ? e.message : String(e);
    }

    const finishedAt = new Date().toISOString();

    // Audit log
    try {
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "bulk_approve_pending",
        new_value: { approved, skipped, errors, totalConsidered: rows.length },
        metadata: { startedAt, finishedAt, sitemapResubmitted, sitemapError },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[bulk-approve] audit log failed", e);
    }

    return { approved, skipped, errors, sitemapResubmitted, sitemapError, startedAt, finishedAt };
  });
