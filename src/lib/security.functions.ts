import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

const eventSchema = z.object({
  event_type: z.string().min(1).max(64),
  severity: z.enum(["info", "warn", "critical"]).default("info"),
  route: z.string().max(255).optional(),
  details: z.record(z.string(), z.any()).optional(),
});

function getCallerMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? null;
    ua = getRequestHeader("user-agent") ?? null;
  } catch {
    /* not in request context */
  }
  return { ip, ua };
}

/** Log a security event from any server function. */
export const logSecurityEvent = createServerFn({ method: "POST" })
  .inputValidator((input) => eventSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ip, ua } = getCallerMeta();
    let userId: string | null = null;
    try {
      const token = getRequestHeader("authorization")?.replace(/^Bearer\s+/i, "");
      if (token) {
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        userId = u.user?.id ?? null;
      }
    } catch {
      /* anon */
    }
    await supabaseAdmin.from("security_events").insert({
      event_type: data.event_type,
      severity: data.severity,
      user_id: userId,
      ip,
      user_agent: ua?.slice(0, 500) ?? null,
      route: data.route ?? null,
      details: data.details ?? {},
    });
    return { ok: true };
  });

/** Rate-limit a client-callable action by IP + optional user id. */
export const checkRateLimit = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        action: z.string().min(1).max(64),
        max: z.number().int().min(1).max(10000).default(20),
        windowSeconds: z.number().int().min(1).max(86400).default(60),
        scope: z.enum(["ip", "user", "ip+user"]).default("ip"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ip } = getCallerMeta();
    let userId: string | null = null;
    try {
      const token = getRequestHeader("authorization")?.replace(/^Bearer\s+/i, "");
      if (token) {
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        userId = u.user?.id ?? null;
      }
    } catch {
      /* anon */
    }
    const parts: string[] = [data.action];
    if (data.scope === "ip" || data.scope === "ip+user") parts.push(`ip:${ip ?? "unknown"}`);
    if (data.scope === "user" || data.scope === "ip+user") parts.push(`u:${userId ?? "anon"}`);
    const key = parts.join("|");
    const { data: res, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: key,
      _max: data.max,
      _window_seconds: data.windowSeconds,
    });
    if (error) {
      // fail open — don't block the user because rate limiter is down
      return { allowed: true, count: 0, limit: data.max, retry_after_seconds: 0 };
    }
    const r = res as any;
    if (!r.allowed) {
      await supabaseAdmin.from("security_events").insert({
        event_type: "rate_limited",
        severity: "warn",
        user_id: userId,
        ip,
        details: { action: data.action, count: r.count, limit: r.limit },
      });
    }
    return r as {
      allowed: boolean;
      count: number;
      limit: number;
      retry_after_seconds: number;
    };
  });

/** Auth lockout helpers — called by /auth route. */
export const checkAuthLockout = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ identifier: z.string().min(1).max(255) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res } = await supabaseAdmin.rpc("check_auth_lockout", {
      _identifier: data.identifier,
    });
    return res as { locked: boolean; fail_count: number };
  });

export const recordAuthFailure = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        identifier: z.string().min(1).max(255),
        kind: z.enum(["email", "phone"]).default("email"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ip, ua } = getCallerMeta();
    await supabaseAdmin.rpc("record_auth_failure", {
      _identifier: data.identifier,
      _kind: data.kind,
    });
    await supabaseAdmin.from("security_events").insert({
      event_type: "login_failed",
      severity: "warn",
      ip,
      user_agent: ua?.slice(0, 500) ?? null,
      details: { identifier_hash: hashIdent(data.identifier) },
    });
    return { ok: true };
  });

export const clearAuthFailures = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ identifier: z.string().min(1).max(255) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("clear_auth_failures", { _identifier: data.identifier });
    return { ok: true };
  });

// Hash identifier so we don't store raw emails/phones in security_events.
function hashIdent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

/** Admin-only: list latest security events. */
export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        eventType: z.string().max(64).optional(),
        severity: z.enum(["info", "warn", "critical"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Yetkisiz");
    let q = supabaseAdmin
      .from("security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    if (data.severity) q = q.eq("severity", data.severity);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
