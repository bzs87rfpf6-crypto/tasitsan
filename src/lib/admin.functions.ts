import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Yetkisiz");
}

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Kendini silemezsin");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), makeAdmin: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && !data.makeAdmin)
      throw new Error("Kendi admin yetkini kaldıramazsın");
    if (data.makeAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "admin" });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), isActive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    // Also ban/unban the auth user
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.isActive ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      displayName: z.string().trim().min(1, "Ad boş olamaz").max(100),
      whatsapp: z.string().trim().max(32).nullable().optional(),
      isApproved: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: prev, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("display_name,whatsapp,is_approved")
      .eq("id", data.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const patch = {
      display_name: data.displayName,
      whatsapp: data.whatsapp?.trim() || null,
      is_approved: data.isApproved,
    };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      target_user_id: data.userId,
      action: "update_profile",
      old_value: prev ?? null,
      new_value: patch,
    });

    return { ok: true, profile: patch };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      newPassword: z.string().min(6, "Şifre en az 6 karakter olmalı").max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      target_user_id: data.userId,
      action: "reset_password",
      old_value: null,
      new_value: { reset: true },
    });
    return { ok: true };
  });

export const adminConfirmAllPendingEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    let page = 1;
    let confirmed = 0;
    // paginate auth users
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const users = data?.users ?? [];
      if (!users.length) break;
      for (const u of users) {
        if (!u.email_confirmed_at) {
          const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(u.id, { email_confirm: true });
          if (!uErr) confirmed++;
        }
      }
      if (users.length < 200) break;
      page++;
      if (page > 50) break; // safety
    }
    return { ok: true, confirmed };
  });

export const userChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, "Yeni şifre en az 6 karakter olmalı").max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Look up auth email for current user
    const { data: userRes, error: gErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (gErr || !userRes?.user?.email) throw new Error("Kullanıcı bulunamadı");
    const email = userRes.user.email;

    // Verify current password using a fresh client (does not affect caller's session)
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sErr } = await tmp.auth.signInWithPassword({ email, password: data.currentPassword });
    if (sErr) throw new Error("Mevcut şifre hatalı");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
