// Faz 4/3 — Akıllı Cross-Sell (aynı araç · farklı parça)
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

function sb() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    }},
  });
}

export interface CrossSellItem {
  id: string;
  seo_slug: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  stock_quantity: number | null;
  seller_id: string | null;
  score: number;
  reason: string;
}

export const crossSellForPart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    part_id: z.string().uuid(),
    limit: z.number().int().min(1).max(20).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<CrossSellItem[]> => {
    const { data: rows, error } = await sb().rpc("cross_sell_for_part" as never, {
      _part_id: data.part_id, _limit: data.limit ?? 6,
    } as never);
    if (error) { console.warn("[cross-sell]", error.message); return []; }
    return (rows ?? []) as CrossSellItem[];
  });
