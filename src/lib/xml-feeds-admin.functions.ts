import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

type DiagnosticValue = null | string | number | boolean | DiagnosticValue[] | { [key: string]: DiagnosticValue };

type DiagnosticCheck = {
  name: string;
  ok: boolean;
  http_status: number | null;
  data?: DiagnosticValue;
  error?: DiagnosticValue;
  duration_ms?: number;
};

function toDiagnosticValue(value: unknown): DiagnosticValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toDiagnosticValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toDiagnosticValue(v)]));
  }
  return String(value);
}

function formatSupabaseError(scope: string, error: unknown) {
  const e = error as { message?: string; code?: string; details?: string; hint?: string; status?: number; statusCode?: number } | null;
  const parts = [
    `${scope} failed`,
    `message=${e?.message ?? String(error)}`,
    e?.status || e?.statusCode ? `http_status=${e.status ?? e.statusCode}` : null,
    e?.code ? `code=${e.code}` : null,
    e?.details ? `details=${e.details}` : null,
    e?.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

async function rawRestCall(path: string, init: RequestInit = {}): Promise<{ ok: boolean; http_status: number | null; status_text: string; duration_ms: number; body: DiagnosticValue }> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const bearer = getRequestHeader("authorization");
  if (!baseUrl || !key) throw new Error("Backend ortam değişkenleri eksik: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: bearer ?? `Bearer ${key}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
    return { ok: res.ok, http_status: res.status, status_text: res.statusText, duration_ms: Date.now() - started, body: toDiagnosticValue(body) };
  } catch (error) {
    const e = error as Error;
    return { ok: false, http_status: null, status_text: "fetch_exception", duration_ms: Date.now() - started, body: toDiagnosticValue({ message: e.message, name: e.name, stack: e.stack ?? null }) };
  }
}

export const adminListXmlFeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum(["pending_approval", "active", "paused", "disabled", "rejected", "all"])
          .default("all"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("xml_feeds")
      .select(
        "id, name, url, seller_id, status, sync_interval, missing_item_action, template, last_sync_at, next_sync_at, last_status, last_error, total_products, consecutive_failures, created_at, approved_at, rejection_reason, profiles:seller_id(display_name, whatsapp, is_verified)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(formatSupabaseError("xml_feeds sorgusu", error));
    return { feeds: rows ?? [] };
  });

export const adminApproveXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("xml_feeds")
      .update({
        status: "active",
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
        rejection_reason: null,
        next_sync_at: new Date().toISOString(), // schedule immediately
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "xml_feed_approve",
      metadata: { feed_id: data.id },
    });
    return { ok: true };
  });

export const adminRejectXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("xml_feeds")
      .update({ status: "rejected", rejection_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "xml_feed_reject",
      metadata: { feed_id: data.id, reason: data.reason },
    });
    return { ok: true };
  });

export const adminToggleXmlFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "paused", "disabled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("xml_feeds")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "xml_feed_status_change",
      metadata: { feed_id: data.id, status: data.status },
    });
    return { ok: true };
  });

export const adminXmlOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("xml_admin_overview");
    if (error) throw new Error(formatSupabaseError("xml_admin_overview RPC", error));
    return { overview: data };
  });

export const adminRecentXmlRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("xml_sync_runs")
      .select(
        "id, feed_id, status, triggered_by, items_total, items_added, items_updated, items_deactivated, items_failed, duration_ms, error, started_at, xml_feeds:feed_id(name, seller_id)",
      )
      .order("started_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(formatSupabaseError("xml_sync_runs sorgusu", error));
    return { runs: data ?? [] };
  });

export const adminXmlDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const checks: DiagnosticCheck[] = [];
    const push = (name: string, result: { ok: boolean; http_status?: number | null; body?: DiagnosticValue; duration_ms?: number }) => {
      checks.push({
        name,
        ok: result.ok,
        http_status: result.http_status ?? (result.ok ? 200 : null),
        duration_ms: result.duration_ms,
        ...(result.ok ? { data: result.body ?? null } : { error: result.body ?? null }),
      });
    };

    const roleRpc = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    checks.push({
      name: "kullanıcı rolü kontrolü / has_role RPC",
      ok: !roleRpc.error && roleRpc.data === true,
      http_status: roleRpc.error ? null : 200,
      data: toDiagnosticValue({ auth_uid: context.userId, has_admin_role: roleRpc.data }),
      error: roleRpc.error ? { message: roleRpc.error.message, code: roleRpc.error.code, details: roleRpc.error.details, hint: roleRpc.error.hint } : undefined,
    });

    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
      context.supabase.from("profiles").select("id, display_name, is_active, is_approved, is_verified").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("id, user_id, role, created_at").eq("user_id", context.userId).order("created_at", { ascending: true }),
    ]);

    checks.push({
      name: "admin hesabı / auth.uid + profile + is_admin",
      ok: !profileError,
      http_status: profileError ? null : 200,
      data: toDiagnosticValue(profile ? { auth_uid: context.userId, role: roles?.map((r) => r.role) ?? [], is_admin: roles?.some((r) => r.role === "admin") ?? false, profile } : { auth_uid: context.userId, profile: null }),
      error: profileError ? { message: profileError.message, code: profileError.code, details: profileError.details, hint: profileError.hint } : undefined,
    });
    checks.push({
      name: "admin hesabı / user_roles kayıtları",
      ok: !rolesError,
      http_status: rolesError ? null : 200,
      data: toDiagnosticValue(roles ?? []),
      error: rolesError ? { message: rolesError.message, code: rolesError.code, details: rolesError.details, hint: rolesError.hint } : undefined,
    });

    push("xml_admin_overview RPC", await rawRestCall("rpc/xml_admin_overview", { method: "POST", body: "{}" }));
    push("xml_feeds sorgusu", await rawRestCall("xml_feeds?select=id,name,url,seller_id,status,sync_interval,missing_item_action,template,last_sync_at,next_sync_at,last_status,last_error,total_products,consecutive_failures,created_at,approved_at,rejection_reason,profiles:seller_id(display_name,whatsapp,is_verified)&order=created_at.desc&limit=100"));
    push("xml_sync_runs sorgusu", await rawRestCall("xml_sync_runs?select=id,feed_id,status,triggered_by,items_total,items_added,items_updated,items_deactivated,items_failed,duration_ms,error,started_at,xml_feeds:feed_id(name,seller_id)&order=started_at.desc&limit=25"));
    push("admin_notifications sorgusu", await rawRestCall("admin_notifications?select=id,kind,priority,title,body,link,related_id,actor_user_id,read_at,created_at&order=created_at.desc&limit=50"));

    return { auth_uid: context.userId, checks };
  });
