// Taşıtsan Parça Asistanı — ürün takibi ve fiyat alarmı.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PrefsSchema = z.object({
  part_id: z.string().uuid(),
  notify_price_drop: z.boolean().default(true),
  notify_cheaper_alternative: z.boolean().default(true),
  notify_new_seller: z.boolean().default(false),
  notify_photo_added: z.boolean().default(false),
  notify_back_in_stock: z.boolean().default(true),
  notify_original_found: z.boolean().default(false),
  notify_special_price: z.boolean().default(false),
  target_price: z.number().positive().max(100000000).nullable().optional(),
  base_price: z.number().nonnegative().nullable().optional(),
});

export const upsertPartWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PrefsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("part_watches").upsert(
      {
        user_id: context.userId,
        part_id: data.part_id,
        notify_price_drop: data.notify_price_drop,
        notify_cheaper_alternative: data.notify_cheaper_alternative,
        notify_new_seller: data.notify_new_seller,
        notify_photo_added: data.notify_photo_added,
        notify_back_in_stock: data.notify_back_in_stock,
        notify_original_found: data.notify_original_found,
        notify_special_price: data.notify_special_price,
        target_price: data.target_price ?? null,
        base_price: data.base_price ?? null,
        is_active: true,
      } as never,
      { onConflict: "user_id,part_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyPartWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ part_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("part_watches")
      .select(
        "id, notify_price_drop, notify_cheaper_alternative, notify_new_seller, notify_photo_added, notify_back_in_stock, notify_original_found, notify_special_price, target_price, is_active",
      )
      .eq("user_id", context.userId)
      .eq("part_id", data.part_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const deleteMyPartWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ part_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("part_watches")
      .delete()
      .eq("user_id", context.userId)
      .eq("part_id", data.part_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
