import { supabase } from "@/integrations/supabase/client";
import { normalizeOem } from "@/lib/oem";

export async function findSellerDuplicateByOem(
  sellerId: string,
  oemCodes: string[],
): Promise<{ id: string; title: string } | null> {
  const normalized = Array.from(
    new Set(oemCodes.map(normalizeOem).filter((c) => c.length >= 3)),
  );
  if (normalized.length === 0) return null;

  const { data } = await supabase
    .from("parts")
    .select("id, title, oem_codes")
    .eq("seller_id", sellerId)
    .overlaps("oem_codes", normalized)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, title: data.title };
}
