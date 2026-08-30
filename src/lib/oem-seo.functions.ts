import { createServerFn } from "@tanstack/react-start";
import { serverReadClient as supabaseAdmin } from "@/lib/supabase-admin.server";
import { z } from "zod";

const OEM_SITEMAP_PAGE = 5000;

export interface OemListingResult {
  normalized: string;
  parts: Array<{
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    year: number | null;
    price: number | null;
    city: string | null;
    photos: string[] | null;
    condition: string;
    part_type: string | null;
    stock_quantity: number | null;
    oem_code: string | null;
    oem_codes: string[] | null;
    updated_at: string;
  }>;
  equivalents: string[];
  vehicles: string[];
}

export const getOemListing = createServerFn({ method: "GET" })
  .inputValidator((d: { oem: string }) => z.object({ oem: z.string().min(2).max(60) }).parse(d))
  .handler(async ({ data }): Promise<OemListingResult & { extras: OemLandingExtras }> => {
    const [{ data: row, error }, { data: extrasRow, error: e2 }] = await Promise.all([
      supabaseAdmin.rpc("oem_listing_page", { _oem: data.oem }),
      supabaseAdmin.rpc("oem_landing_extras", { _oem: data.oem }),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    const j = (row ?? {}) as Partial<OemListingResult>;
    const ex = (extrasRow ?? {}) as Partial<OemLandingExtras>;
    return {
      normalized: j.normalized ?? "",
      parts: j.parts ?? [],
      equivalents: j.equivalents ?? [],
      vehicles: j.vehicles ?? [],
      extras: {
        vehicles: ex.vehicles ?? [],
        engine_codes: ex.engine_codes ?? [],
        supplier_brands: ex.supplier_brands ?? [],
        categories: ex.categories ?? [],
        total: ex.total ?? 0,
      },
    };
  });

export interface OemLandingExtras {
  vehicles: Array<{ brand: string | null; model: string | null; year: number | null }>;
  engine_codes: string[];
  supplier_brands: string[];
  categories: string[];
  total: number;
}

export const getOemSitemapCount = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin.rpc("count_distinct_oems");
  if (error) throw new Error(error.message);
  const total = Number(data ?? 0);
  return { total, pageSize: OEM_SITEMAP_PAGE, pageCount: Math.max(0, Math.ceil(total / OEM_SITEMAP_PAGE)) };
});

export const getOemSitemapPage = createServerFn({ method: "GET" })
  .inputValidator((d: { page: number }) => z.object({ page: z.number().int().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    // PostgREST 1000 satırda kesiyor; sayfayı 1000'lik parçalarla topla.
    const CHUNK = 1000;
    const base = (data.page - 1) * OEM_SITEMAP_PAGE;
    const rows: Array<{ oem: string; listing_count: number; last_updated: string | null }> = [];
    for (let off = 0; off < OEM_SITEMAP_PAGE; off += CHUNK) {
      const { data: chunk, error } = await supabaseAdmin.rpc("list_distinct_oems", {
        _offset: base + off,
        _limit: CHUNK,
      });
      if (error) throw new Error(error.message);
      const list = (chunk ?? []) as typeof rows;
      rows.push(...list);
      if (list.length < CHUNK) break;
    }
    return rows;
  });

export const runOemSeoAudit = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin.rpc("oem_seo_audit");
  if (error) throw new Error(error.message);
  return (data ?? {}) as {
    total_approved: number;
    with_oem: number;
    missing_oem: number;
    missing_photo: number;
    thin_description: number;
    distinct_oems: number;
  };
});

export const OEM_SITEMAP_PAGE_SIZE = OEM_SITEMAP_PAGE;
