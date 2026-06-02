import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PatternSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x20-\x7E]+$/, "Yalnızca ASCII karakterler kullanın");

export type BotRule = {
  id: string;
  pattern: string;
  label: string | null;
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

async function assertAdmin(supabase: ReturnType<typeof Object>, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Yetkisiz");
}

export const listBotRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("bot_filter_rules")
      .select("*")
      .order("is_default", { ascending: false })
      .order("pattern", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BotRule[];
  });

export const createBotRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pattern: string; label?: string | null }) =>
    z.object({
      pattern: PatternSchema,
      label: z.string().max(120).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("bot_filter_rules")
      .insert({
        pattern: data.pattern.trim(),
        label: data.label ?? null,
        enabled: true,
        is_default: false,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as BotRule;
  });

export const updateBotRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pattern?: string; label?: string | null; enabled?: boolean }) =>
    z.object({
      id: z.string().uuid(),
      pattern: PatternSchema.optional(),
      label: z.string().max(120).nullable().optional(),
      enabled: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: { pattern?: string; label?: string | null; enabled?: boolean } = {};
    if (data.pattern !== undefined) patch.pattern = data.pattern.trim();
    if (data.label !== undefined) patch.label = data.label;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { data: row, error } = await supabase
      .from("bot_filter_rules")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as BotRule;
  });

export const deleteBotRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("bot_filter_rules")
      .delete()
      .eq("id", data.id)
      .eq("is_default", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
