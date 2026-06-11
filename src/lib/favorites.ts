import { supabase } from "@/integrations/supabase/client";

export async function getMyFavoriteIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("favorites")
    .select("part_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("[favorites] fetch failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.part_id as string));
}

export async function addFavorite(userId: string, partId: string) {
  const { error } = await supabase.from("favorites").insert({ user_id: userId, part_id: partId });
  if (error && error.code !== "23505") throw error;
}

export async function removeFavorite(userId: string, partId: string) {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("part_id", partId);
  if (error) throw error;
}
