// Client-side helpers for the admin-curated "🔥 Bugünün En Uygun Fiyatları" list.
// All write access is gated at the DB level via RLS (public.has_role admin).
import { supabase } from "@/integrations/supabase/client";
import type { Part } from "@/components/PartCard";

const TABLE = "featured_deals" as never;

export interface FeaturedDealRow {
  id: string;
  part_id: string;
  sort_order: number;
  is_active: boolean;
  featured_date: string;
  created_at: string;
}

export interface FeaturedDealWithPart extends FeaturedDealRow {
  part: Part | null;
}

const PART_COLS =
  "id,seo_slug,title,brand,model,year,price,city,photos,condition,part_type,stock_quantity,oem_code,oem_codes,seller_id,created_at,delivery_options,urgent_delivery,status";

export async function fetchFeaturedDealsAdmin(): Promise<FeaturedDealWithPart[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`id,part_id,sort_order,is_active,featured_date,created_at, part:parts(${PART_COLS})`)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FeaturedDealWithPart[];
}

export async function fetchActiveFeaturedDealsPublic(): Promise<FeaturedDealWithPart[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`id,part_id,sort_order,is_active,featured_date,created_at, part:parts(${PART_COLS})`)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeaturedDealWithPart[];
  // Hide deals whose product is missing or not currently approved.
  return rows.filter((r) => r.part && (r.part as unknown as { status?: string }).status === "approved");
}

const MAX_DEALS = 20;

export async function addFeaturedDeal(partId: string): Promise<void> {
  const { count } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_DEALS) {
    throw new Error(`En fazla ${MAX_DEALS} ürün seçilebilir. Önce birini kaldırın.`);
  }
  const { data: maxRow } = await supabase
    .from(TABLE)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
  const { error } = await supabase
    .from(TABLE)
    .insert({ part_id: partId, sort_order: nextOrder, is_active: true } as never);
  if (error) {
    if (error.code === "23505" || /duplicate/i.test(error.message)) {
      throw new Error("Bu ürün zaten fırsat listesinde.");
    }
    throw new Error(error.message);
  }
}

export async function removeFeaturedDeal(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeFeaturedDealByPart(partId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("part_id", partId);
  if (error) throw new Error(error.message);
}

export async function toggleFeaturedDealActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ is_active: isActive } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderFeaturedDeals(orderedIds: string[]): Promise<void> {
  // Sequential updates; small list (<=20) so no batching needed.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from(TABLE)
      .update({ sort_order: i } as never)
      .eq("id", orderedIds[i]);
    if (error) throw new Error(error.message);
  }
}

export async function fetchFeaturedPartIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from(TABLE).select("part_id");
  if (error) return new Set();
  return new Set(((data ?? []) as { part_id: string }[]).map((r) => r.part_id));
}

export const MAX_FEATURED_DEALS = MAX_DEALS;
