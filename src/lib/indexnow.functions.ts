import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const getIndexNowStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleOk } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!roleOk) throw new Error("Forbidden");
    const { data, error } = await supabaseAdmin.rpc("indexnow_stats");
    if (error) throw new Error(error.message);
    return (data ?? {}) as { pending: number; sent_today: number; failed: number; sent_total: number };
  });

export const getIndexNowRecent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleOk } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!roleOk) throw new Error("Forbidden");
    const { data: rows, error } = await supabaseAdmin
      .from("indexnow_queue")
      .select("id,url,status,attempts,last_error,enqueued_at,sent_at")
      .order("enqueued_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const triggerIndexNowFlush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleOk } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!roleOk) throw new Error("Forbidden");
    const base = process.env.PUBLIC_SITE_URL ?? "https://www.tasitsan.com.tr";
    const res = await fetch(`${base}/api/public/hooks/indexnow-flush`, { method: "POST" });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 500) };
  });
