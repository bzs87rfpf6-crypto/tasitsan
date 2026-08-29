import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type SessionKind = "human" | "bot" | "admin";

export type LiveSession = {
  session: string;
  path: string;
  landing_path: string;
  last_path: string;
  city: string;
  country: string;
  device: string;
  browser: string;
  os: string;
  source: string;
  referrer: string | null;
  joined_at: string;
  last_at: string;
  duration_sec: number;
  intent_score: number;
  kind: SessionKind;
};
export type LiveBot = {
  bot_name: string;
  sessions: number;
  hits: number;
  last_at: string;
  last_path: string | null;
};
export type LiveSource = { source: string; count: number };
export type LiveCity = { city: string; country?: string; count: number };
export type LivePage = { path: string; count: number };
export type LiveOem = { oem: string; count: number; last_at: string; last_results?: number | null };
export type LiveFailedOem = { oem: string; count: number; last_at: string };
export type LiveFunnel = {
  visited: number;
  searched: number;
  viewed_part: number;
  contacted: number;
  favorited: number;
};
export type LiveHotPart = {
  part_id: string;
  seo_slug?: string | null;
  title: string;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  views: number;
  whatsapp: number;
  calls: number;
  favorites: number;
};
export type LiveStreamEvent = {
  event_type: string;
  path: string | null;
  city: string | null;
  country: string | null;
  session: string;
  title: string | null;
  query: string | null;
  oem: string | null;
  part_id: string | null;
  results: number | null;
  duration_ms?: number | null;
  engagement?: string | null;
  created_at: string;
  kind: SessionKind;
  bot_name: string | null;
};
export type LiveCounts = {
  real_users: number;
  bots: number;
  admins: number;
  /** Sunucu tarafında istatistiklerden çıkarılan bot isabeti (30 dk pencere) */
  filtered_bot_hits: number;
  mobile: number;
  desktop: number;
  tablet: number;
  countries: number;
  avg_session_sec: number;
};

export type LiveTraffic = {
  online_count: number;
  counts: LiveCounts;
  sessions: LiveSession[];
  bots: LiveBot[];
  sources: LiveSource[];
  cities: LiveCity[];
  pages: LivePage[];
  top_oems: LiveOem[];
  failed_oems: LiveFailedOem[];
  funnel: LiveFunnel;
  hot_parts: LiveHotPart[];
  stream: LiveStreamEvent[];
  debug?: {
    snapshotAt: string;
    onlineSince: string;
    windowSince: string;
    excludeAdmins: boolean;
    analyticsRowsWindow: number;
    distinctSessions5m: number;
  };
};

const EMPTY: LiveTraffic = {
  online_count: 0,
  counts: {
    real_users: 0,
    bots: 0,
    admins: 0,
    filtered_bot_hits: 0,
    mobile: 0,
    desktop: 0,
    tablet: 0,
    countries: 0,
    avg_session_sec: 0,
  },
  sessions: [],
  bots: [],
  sources: [],
  cities: [],
  pages: [],
  top_oems: [],
  failed_oems: [],
  funnel: { visited: 0, searched: 0, viewed_part: 0, contacted: 0, favorited: 0 },
  hot_parts: [],
  stream: [],
};

export const getLiveTraffic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { excludeAdmins?: boolean } | undefined) => ({
    excludeAdmins: input?.excludeAdmins ?? true,
  }))
  .handler(async ({ data, context }) => {
    const { data: rpc, error } = await context.supabase.rpc("admin_live_traffic", {
      _exclude_admins: data.excludeAdmins,
    });
    if (error) throw new Error(error.message);
    const result = (rpc ?? EMPTY) as LiveTraffic;
    const hotPartIds = (result.hot_parts ?? [])
      .map((p) => p.part_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (hotPartIds.length > 0) {
      const { data: parts } = await context.supabase
        .from("parts")
        .select("id,seo_slug,title,oem_code,oem_codes")
        .in("id", hotPartIds);
      const byId = new Map((parts ?? []).map((p) => [p.id, p]));
      result.hot_parts = result.hot_parts.map((p) => {
        const meta = byId.get(p.part_id);
        return meta
          ? { ...p, seo_slug: meta.seo_slug, title: meta.title ?? p.title, oem_code: meta.oem_code, oem_codes: meta.oem_codes }
          : p;
      });
    }
    return result;
  });

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type SessionTimelineEvent = {
  created_at: string;
  event_type: string;
  path: string | null;
  metadata: Json | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  await assertOwnerAdmin(supabase, userId);
}

/** Bir oturum için tüm event kayıtlarını, son 2 saatle sınırlayarak döner. */
export const getSessionTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => {
    if (!input?.sessionId || typeof input.sessionId !== "string")
      throw new Error("sessionId zorunlu");
    return { sessionId: input.sessionId.slice(0, 200) };
  })
  .handler(async ({ data, context }): Promise<SessionTimelineEvent[]> => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // The panel receives a masked session id (last 6 chars), so match by suffix.
    const { data: rows, error } = await context.supabase
      .from("analytics_events")
      .select("created_at,event_type,path,metadata")
      .like("session_id", `%${data.sessionId}`)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as SessionTimelineEvent[];
  });

export type PartMetaLite = {
  id: string;
  seo_slug: string | null;
  title: string | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  brand: string | null;
};

/** Verilen part id'leri için minimum bilgi — admin drill-down için. */
export const getPartsMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({
    ids: Array.isArray(input?.ids)
      ? input.ids.filter((x) => typeof x === "string").slice(0, 100)
      : [],
  }))
  .handler(async ({ data, context }): Promise<PartMetaLite[]> => {
    if (!data.ids.length) return [];
    const { data: rows, error } = await context.supabase
      .from("parts")
      .select("id,seo_slug,title,oem_code,oem_codes,brand")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as PartMetaLite[];
  });
