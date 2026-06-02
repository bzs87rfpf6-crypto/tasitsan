import { supabase } from "@/integrations/supabase/client";

const ANON_KEY = "tasitsan_anon_id";
const VIEWED_PREFIX = "tasitsan_viewed_";
const DEDUP_HOURS = 6;

function getAnonId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function isLikelyBot(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent.toLowerCase();
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless/i.test(ua);
}

export async function recordPartView(partId: string, userId: string | null): Promise<number | null> {
  if (isLikelyBot()) return null;

  // Client-side dedup gate to avoid hammering the RPC on refresh
  const k = `${VIEWED_PREFIX}${partId}`;
  try {
    const last = localStorage.getItem(k);
    if (last) {
      const t = parseInt(last, 10);
      if (Number.isFinite(t) && Date.now() - t < DEDUP_HOURS * 3600 * 1000) {
        const { count } = await supabase
          .from("part_views")
          .select("*", { count: "exact", head: true })
          .eq("part_id", partId);
        return count ?? null;
      }
    }
  } catch {}

  const viewerKey = userId ?? getAnonId();
  const { data, error } = await supabase.rpc("record_part_view", {
    _part_id: partId,
    _viewer_key: viewerKey,
  });
  if (error) {
    console.warn("[views] record failed:", error.message);
    return null;
  }
  try { localStorage.setItem(k, String(Date.now())); } catch {}
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function getPartViewCount(partId: string): Promise<number> {
  const { count } = await supabase
    .from("part_views")
    .select("*", { count: "exact", head: true })
    .eq("part_id", partId);
  return count ?? 0;
}
