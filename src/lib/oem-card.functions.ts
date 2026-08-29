// Faz 4/2 — OEM Bilgi Kartı
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

export interface OemCard {
  oem: string;
  oem_normalized: string;
  part_name: string | null;
  category: string | null;
  notes: string | null;
  verified: boolean;
  confidence: number | null;
  compatible_vehicles: Array<{ brand: string | null; model: string | null; year_from: number | null; year_to: number | null; engine: string | null; fuel: string | null }>;
  alternative_oems: string[];
  equivalent_brands: string[];
  category_hints: string[];
  available_products: number;
}

export const getOemCard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ oem: z.string().trim().min(3).max(60) }).parse(d))
  .handler(async ({ data }): Promise<OemCard | null> => {
    const { data: json, error } = await sb().rpc("oem_knowledge_card" as never, { _oem: data.oem } as never);
    if (error) { console.warn("[oem-card]", error.message); return null; }
    if (!json) return null;
    return json as unknown as OemCard;
  });
