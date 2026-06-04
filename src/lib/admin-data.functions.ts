import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Yetkisiz");
}

export const adminGetPartRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("part_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const adminGetUrgentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("part_requests")
      .select("id,oem_code,part_name,brand,model,year,city,category,notes,status,admin_notes,full_name,phone,email,created_at")
      .eq("is_urgent", true)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const adminGetUsersFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,whatsapp,city,email,created_at,is_active,is_approved,avatar_url")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const adminGetSellerContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name,whatsapp")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; display_name: string | null; whatsapp: string | null }[];
  });

export const adminGetPartsWithWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("parts")
      .select("id,title,brand,model,whatsapp,city,seller_id")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const adminGetSiteSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as any;
  });

const SiteSettingsPatch = z.object({
  commission_rate: z.number().min(0).max(100).optional(),
  contact_email: z.string().trim().max(255).nullable().optional(),
  contact_phone: z.string().trim().max(32).nullable().optional(),
  contact_address: z.string().trim().max(500).nullable().optional(),
  email_from_name: z.string().trim().max(120).nullable().optional(),
  email_from_address: z.string().trim().max(255).nullable().optional(),
  email_smtp_host: z.string().trim().max(255).nullable().optional(),
  email_smtp_port: z.number().int().min(1).max(65535).nullable().optional(),
  ga4_measurement_id: z.string().trim().max(64).nullable().optional(),
  gsc_verification_code: z.string().trim().max(255).nullable().optional(),
}).partial();

export const adminSaveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), patch: SiteSettingsPatch }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("site_settings")
      .update({ ...data.patch, updated_by: context.userId })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as any;
  });
