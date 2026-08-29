// Faz 4/1 — Kullanıcı Araç Profilleri
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface UserVehicle {
  id: string;
  label: string | null;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  fuel: string | null;
  transmission: string | null;
  variant: string | null;
  is_default: boolean;
  created_at: string;
}

export const listMyVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserVehicle[]> => {
    const { data, error } = await context.supabase
      .from("user_vehicles")
      .select("id, label, brand, model, year, engine, fuel, transmission, variant, is_default, created_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as UserVehicle[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().max(60).optional().nullable(),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  engine: z.string().max(40).optional().nullable(),
  fuel: z.string().max(20).optional().nullable(),
  transmission: z.string().max(20).optional().nullable(),
  variant: z.string().max(60).optional().nullable(),
  is_default: z.boolean().optional(),
});

export const upsertMyVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data, user_id: context.userId } as never;
    const q = data.id
      ? context.supabase.from("user_vehicles").update(row).eq("id", data.id).eq("user_id", context.userId).select("id").single()
      : context.supabase.from("user_vehicles").insert(row).select("id").single();
    const { data: out, error } = await q;
    if (error) throw new Error(error.message);
    return { id: (out as { id: string }).id };
  });

export const deleteMyVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_vehicles").delete()
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_vehicles")
      .update({ is_default: true } as never).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
