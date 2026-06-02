import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EventRow = {
  id: string;
  event_type: string;
  session_id: string | null;
  user_id: string | null;
  path: string | null;
  city: string | null;
  country: string | null;
  device: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = { id: string; created_at: string; city: string | null };
type PartRow = { id: string; title: string; seller_id: string; created_at: string };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

const FALLBACK_BOT_UA_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|phantom|puppeteer|selenium/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compileBotRe(patterns: string[]): RegExp {
  const cleaned = patterns.map((p) => p.trim()).filter(Boolean).map(escapeRegex);
  if (!cleaned.length) return FALLBACK_BOT_UA_RE;
  return new RegExp(cleaned.join("|"), "i");
}
function makeIsBotUA(re: RegExp) {
  return (ua: string | null) => (!ua ? false : re.test(ua));
}

// Turkey detection: ipapi.co returns "Turkey" (sometimes "Türkiye"); be liberal.
const TR_COUNTRY_RE = /^(turkey|türkiye|turkiye|tr)$/i;
function isTurkey(country: string | null): boolean {
  if (!country) return false;
  return TR_COUNTRY_RE.test(country.trim());
}

// Normalize Turkish city names (strip accents, title case-ish)
function normalizeTrCity(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Capitalize first letter of each word
  return trimmed
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1))
    .join(" ");
}

export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Admin check (RLS for analytics_events requires admin role for SELECT;
    // queries below will simply return [] if user is not admin).
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [evRes, profilesRes, partsRes] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("id,event_type,session_id,user_id,path,city,country,device,user_agent,metadata,created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase.from("profiles").select("id,created_at,city").limit(5000),
      supabase.from("parts").select("id,title,seller_id,created_at").limit(5000),
    ]);

    // Filter out bot/crawler traffic before any aggregation
    const allEvents = (evRes.data ?? []) as EventRow[];
    const events = allEvents.filter((e) => !isBotUA(e.user_agent));
    const profiles = (profilesRes.data ?? []) as ProfileRow[];
    const parts = (partsRes.data ?? []) as PartRow[];

    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(dayStart); monthStart.setDate(monthStart.getDate() - 29);

    // Sessions = unique session_ids
    const uniqSessions = (rows: EventRow[]) => new Set(rows.map((r) => r.session_id).filter(Boolean)).size;

    const pv = events.filter((e) => e.event_type === "page_view");

    const visitorsTotal = uniqSessions(pv);
    const visitorsDaily = uniqSessions(pv.filter((e) => new Date(e.created_at) >= dayStart));
    const visitorsWeekly = uniqSessions(pv.filter((e) => new Date(e.created_at) >= weekStart));
    const visitorsMonthly = uniqSessions(pv.filter((e) => new Date(e.created_at) >= monthStart));

    // City distribution (sessions per city) — TR cities reported separately,
    // every non-TR visitor bucketed as "Yurtdışı".
    const sessionGeo = new Map<string, { city: string | null; country: string | null }>();
    for (const e of pv) {
      if (e.session_id && !sessionGeo.has(e.session_id)) {
        sessionGeo.set(e.session_id, { city: e.city, country: e.country });
      }
    }
    const cityCounts = new Map<string, number>();
    let abroadCount = 0;
    let trDistinct = 0;
    const trSeen = new Set<string>();
    for (const { city, country } of sessionGeo.values()) {
      if (isTurkey(country)) {
        if (!city) continue; // unknown TR city → skip
        const norm = normalizeTrCity(city);
        if (!norm) continue;
        cityCounts.set(norm, (cityCounts.get(norm) ?? 0) + 1);
        if (!trSeen.has(norm)) { trSeen.add(norm); trDistinct++; }
      } else if (country) {
        abroadCount++;
      } else if (city) {
        // No country info — fall back to city if present (legacy rows)
        const norm = normalizeTrCity(city);
        cityCounts.set(norm, (cityCounts.get(norm) ?? 0) + 1);
        if (!trSeen.has(norm)) { trSeen.add(norm); trDistinct++; }
      }
    }
    const cities: { city: string; count: number }[] = Array.from(cityCounts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
    if (abroadCount > 0) cities.push({ city: "Yurtdışı", count: abroadCount });
    const distinctCities = trDistinct;

    // Most viewed parts (by part_view events)
    const partViewCounts = new Map<string, { count: number; title: string }>();
    for (const e of events.filter((x) => x.event_type === "part_view")) {
      const pid = String((e.metadata as { part_id?: string } | null)?.part_id ?? "");
      if (!pid) continue;
      const title = String((e.metadata as { title?: string } | null)?.title ?? "");
      const prev = partViewCounts.get(pid);
      partViewCounts.set(pid, { count: (prev?.count ?? 0) + 1, title: prev?.title || title });
    }
    const topParts = Array.from(partViewCounts.entries())
      .map(([part_id, v]) => ({ part_id, title: v.title, views: v.count }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Top searches (text)
    const queryCounts = new Map<string, number>();
    for (const e of events.filter((x) => x.event_type === "search")) {
      const q = String((e.metadata as { query?: string } | null)?.query ?? "").trim().toLowerCase();
      if (!q) continue;
      queryCounts.set(q, (queryCounts.get(q) ?? 0) + 1);
    }
    const topSearches = Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top OEM searches
    const oemCounts = new Map<string, number>();
    for (const e of events.filter((x) => x.event_type === "oem_search")) {
      const o = String((e.metadata as { oem?: string } | null)?.oem ?? "").trim().toUpperCase();
      if (!o) continue;
      oemCounts.set(o, (oemCounts.get(o) ?? 0) + 1);
    }
    const topOem = Array.from(oemCounts.entries())
      .map(([oem, count]) => ({ oem, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Device breakdown
    const deviceCounts = new Map<string, Set<string>>();
    for (const e of pv) {
      const d = e.device || "unknown";
      if (!deviceCounts.has(d)) deviceCounts.set(d, new Set());
      if (e.session_id) deviceCounts.get(d)!.add(e.session_id);
    }
    const devices = Array.from(deviceCounts.entries())
      .map(([device, set]) => ({ device, sessions: set.size }));

    // Click counts
    const whatsappClicks = events.filter((e) => e.event_type === "click_whatsapp").length;
    const callClicks = events.filter((e) => e.event_type === "click_call").length;

    // Users + parts stats
    const totalMembers = profiles.length;
    const newMembersToday = profiles.filter((p) => new Date(p.created_at) >= dayStart).length;
    const totalParts = parts.length;
    const newPartsToday = parts.filter((p) => new Date(p.created_at) >= dayStart).length;

    // Sellers ranking
    const sellerCounts = new Map<string, number>();
    for (const p of parts) sellerCounts.set(p.seller_id, (sellerCounts.get(p.seller_id) ?? 0) + 1);
    const sellerIds = Array.from(sellerCounts.keys());
    let sellerNames: Record<string, string> = {};
    if (sellerIds.length) {
      const { data: sp } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", sellerIds);
      sellerNames = Object.fromEntries(((sp ?? []) as { id: string; display_name: string | null }[])
        .map((p) => [p.id, p.display_name ?? "—"]));
    }
    const topSellers = Array.from(sellerCounts.entries())
      .map(([seller_id, count]) => ({ seller_id, name: sellerNames[seller_id] ?? "—", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Daily visitor timeseries (last 30 days)
    const dailySeries: { date: string; visitors: number; newMembers: number; newParts: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(dayStart); day.setDate(day.getDate() - i);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const dayPv = pv.filter((e) => {
        const t = new Date(e.created_at);
        return t >= day && t < next;
      });
      const visitors = new Set(dayPv.map((e) => e.session_id).filter(Boolean)).size;
      const newMembers = profiles.filter((p) => {
        const t = new Date(p.created_at);
        return t >= day && t < next;
      }).length;
      const newParts = parts.filter((p) => {
        const t = new Date(p.created_at);
        return t >= day && t < next;
      }).length;
      dailySeries.push({
        date: day.toISOString().slice(0, 10),
        visitors,
        newMembers,
        newParts,
      });
    }

    return {
      visitorsTotal,
      visitorsDaily,
      visitorsWeekly,
      visitorsMonthly,
      distinctCities,
      cities: cities.slice(0, 15),
      topParts,
      topSearches,
      topOem,
      devices,
      whatsappClicks,
      callClicks,
      totalMembers,
      newMembersToday,
      totalParts,
      newPartsToday,
      topSellers,
      dailySeries,
    };
  });
