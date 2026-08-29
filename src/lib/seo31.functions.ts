import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSeoProgressReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("seo_progress_report");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });

export const getSeoPendingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("seo_pending_index_pages", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getSeoDuplicateTitles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(500).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("seo_duplicate_titles", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getSeoThinContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("seo_thin_content", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getSeoUrlConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("seo_url_conflicts", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
