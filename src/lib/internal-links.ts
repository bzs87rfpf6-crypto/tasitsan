// SEO Growth 2.0 — İç link RPC istemcileri.
// Tüm fonksiyonlar yalnızca status='approved' + stock_quantity>0 ürünleri döner.
import { supabase } from "@/integrations/supabase/client";

export interface RelatedPartLite {
  id: string;
  title: string;
  seo_slug: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  price: number | null;
  city: string | null;
  has_photos: boolean | null;
  view_count?: number | null;
}

async function callRpc(name: string, id: string, limit = 10): Promise<RelatedPartLite[]> {
  const { data, error } = await supabase.rpc(name as never, { _id: id, _limit: limit } as never);
  if (error) {
    console.warn(`[internal-links] ${name} failed`, error.message);
    return [];
  }
  return (data ?? []) as RelatedPartLite[];
}

export const fetchSameOem        = (id: string, limit = 10) => callRpc("parts_same_oem", id, limit);
export const fetchSameOemFamily  = (id: string, limit = 10) => callRpc("parts_same_oem_family", id, limit);
export const fetchSameVehicle    = (id: string, limit = 10) => callRpc("parts_same_vehicle", id, limit);
export const fetchSameCategory   = (id: string, limit = 10) => callRpc("parts_same_category", id, limit);
export const fetchSameBrand      = (id: string, limit = 10) => callRpc("parts_same_brand", id, limit);
export const fetchPopularRelated = (id: string, limit = 10) => callRpc("parts_popular_related", id, limit);
