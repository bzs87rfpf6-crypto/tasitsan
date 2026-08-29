import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

function pickIp(): string | null {
  try { return getRequestIP({ xForwardedFor: true }) ?? null; } catch { return null; }
}


async function assertAdmin(ctx: { userId: string; supabase: any }) {
  await assertOwnerAdmin(ctx.supabase, ctx.userId);
}

// ---------- PUBLIC: log a signup failure ----------
const logSchema = z.object({
  displayName: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  errorCode: z.string().trim().max(100).optional().nullable(),
  errorMessage: z.string().trim().max(2000).optional().nullable(),
  formData: z.record(z.string(), z.unknown()).optional(),
});

export const logSignupFailure = createServerFn({ method: "POST" })
  .inputValidator((d) => logSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ua = (() => {
      try { return getRequestHeader("user-agent") ?? null; } catch { return null; }
    })();
    const ip = pickIp();
    // Strip sensitive keys client-side as well
    const safe: Record<string, unknown> = { ...(data.formData ?? {}) };
    for (const k of ["password", "newPassword", "currentPassword", "pwd", "pass"]) delete safe[k];

    const { data: id, error } = await supabaseAdmin.rpc("log_signup_failure", {
      _display_name: data.displayName ?? null,
      _email: data.email ?? null,
      _phone: data.phone ?? null,
      _company_name: data.companyName ?? null,
      _error_code: data.errorCode ?? null,
      _error_message: data.errorMessage ?? null,
      _user_agent: ua,
      _form_data: safe as never,
      _ip: ip,
    } as never);

    if (error) {
      // Don't throw to the visitor — they already saw a friendly message.
      console.error("[logSignupFailure]", error);
      return { ok: false };
    }

    // Fire-and-forget IP → location enrichment (free, no key, fail-silent).
    if (id && ip && !/^(10\.|192\.168\.|127\.|::1)/.test(ip)) {
      (async () => {
        try {
          const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
            headers: { "User-Agent": "tasitsan-signup-geo/1.0" },
            signal: AbortSignal.timeout(3500),
          });
          if (!r.ok) return;
          const j: any = await r.json();
          if (j?.error) return;
          await supabaseAdmin
            .from("signup_failures")
            .update({
              country: j.country_name ?? j.country ?? null,
              region: j.region ?? null,
              city: j.city ?? null,
            })
            .eq("id", id as string);
        } catch (e) {
          console.warn("[signup geo]", (e as Error).message);
        }
      })();
    }

    return { ok: true, id };
  });


// ---------- ADMIN: list / stats / mutations ----------
export const listSignupFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      status: z.enum(["all", "pending", "resolved", "converted", "dismissed"]).default("all"),
      search: z.string().trim().max(200).optional().nullable(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("signup_failures")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.toLowerCase();
      q = q.or(
        `email.ilike.%${s}%,phone.ilike.%${s}%,display_name.ilike.%${s}%,error_code.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getSignupFailuresStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Use the user-context client so auth.uid() inside the SECURITY DEFINER
    // RPCs (which gate with has_role(auth.uid(), 'admin')) resolves correctly.
    // supabaseAdmin would run as service_role with auth.uid() = NULL → "admin only".
    const [{ data: stats, error: e1 }, { data: alerts, error: e2 }, { data: report, error: e3 }] =
      await Promise.all([
        context.supabase.rpc("signup_failures_stats"),
        context.supabase.rpc("signup_failures_critical_alerts"),
        context.supabase.rpc("signup_conversion_report", { _days: 30 }),
      ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);
    return { stats, alerts: alerts ?? [], report };
  });

export const updateSignupFailureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "resolved", "dismissed"]),
      notes: z.string().trim().max(1000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = {
      status: data.status,
      resolved_at: data.status === "pending" ? null : new Date().toISOString(),
      resolved_by: data.status === "pending" ? null : context.userId,
      ...(data.notes !== undefined ? { admin_notes: data.notes } : {}),
    };
    const { error } = await supabaseAdmin.from("signup_failures").update(patch).eq("id", data.id);


    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSignupFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("signup_failures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: convert failure → real user ----------
export const adminCreateUserFromFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      email: z.string().trim().email().optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      displayName: z.string().trim().min(1).max(200),
      sendResetEmail: z.boolean().default(true),
      approve: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Synthesize phone-domain email if no real email (matches auth.tsx convention)
    const PHONE_DOMAIN = "phone.tasitsan.local";
    const digits = (data.phone ?? "").replace(/\D/g, "");
    const realEmail = data.email?.toLowerCase().trim() || null;
    const authEmail = realEmail || (digits.length >= 10 ? `${digits.slice(-10)}@${PHONE_DOMAIN}` : null);
    if (!authEmail) throw new Error("E-posta veya geçerli telefon gerekli");

    // Random throwaway password — user will receive recovery email
    const tempPwd = crypto.randomUUID() + "Aa1!";

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: tempPwd,
      email_confirm: true,
      user_metadata: {
        display_name: data.displayName,
        whatsapp: digits || null,
        contact_email: realEmail,
      },
    });
    if (cErr) throw new Error(cErr.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Kullanıcı oluşturulamadı");

    // Profile already created via handle_new_user trigger; patch approval/contact email.
    await supabaseAdmin
      .from("profiles")
      .update({ is_approved: data.approve, email: realEmail })
      .eq("id", newId);

    // Send password-recovery email if a real address exists
    let emailSent = false;
    if (data.sendResetEmail && realEmail) {
      const { error: rErr } = await supabaseAdmin.auth.resetPasswordForEmail(realEmail, {
        redirectTo: `${process.env.SITE_URL ?? "https://www.tasitsan.com.tr"}/reset-password`,
      });
      if (!rErr) emailSent = true;
      else console.error("[recovery email]", rErr);
    }

    await supabaseAdmin
      .from("signup_failures")
      .update({
        status: "converted",
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
        created_user_id: newId,
      })
      .eq("id", data.id);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      target_user_id: newId,
      action: "create_user_from_signup_failure",
      new_value: { failure_id: data.id, email: realEmail, phone: digits || null },
    });

    return { ok: true, userId: newId, emailSent };
  });
