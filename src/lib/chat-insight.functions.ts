import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChatAnalysis, ChatMsg } from "@/lib/chat-insight.server";

export type ChatRange = "today" | "7d" | "30d";
export type ChatSourceFilter = "all" | "facebook" | "google" | "organic";
export type ChatOutcomeFilter = "all" | "ai" | "converted" | "abandoned";

export type ChatSessionRow = {
  chat_id: string;
  session_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string;
  message_count: number;
  last_user_message: string | null;
  city: string | null;
  country: string | null;
  device: string | null;
  browser: string;
  os: string;
  source: string;
  is_spam: boolean;
  ai_rating: number | null;
  satisfaction: number | null;
  live_requested: boolean;
  converted: boolean;
  engaged: boolean;
};

export type ChatBehaviorEvent = {
  created_at: string;
  event_type: string;
  path: string | null;
  label: string | null;
};

export type ChatDetail = {
  chat_id: string;
  session_id: string;
  user_id: string | null;
  messages: ChatMsg[];
  started_at: string;
  ended_at: string;
  duration_sec: number;
  message_count: number;
  city: string | null;
  country: string | null;
  ip_masked: string | null;
  device: string | null;
  browser: string;
  os: string;
  source: string;
  is_spam: boolean;
  ai_rating: number | null;
  satisfaction: number | null;
  before: ChatBehaviorEvent[];
  after: ChatBehaviorEvent[];
  after_flags: {
    viewed_part: boolean;
    added_to_cart: boolean;
    checkout: boolean;
    ordered: boolean;
    left: boolean;
  };
  analysis: ChatAnalysis;
};

export const listChatSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { range?: ChatRange; source?: ChatSourceFilter; outcome?: ChatOutcomeFilter } | undefined) => ({
    range: (input?.range ?? "7d") as ChatRange,
    source: (input?.source ?? "all") as ChatSourceFilter,
    outcome: (input?.outcome ?? "all") as ChatOutcomeFilter,
  }))
  .handler(async ({ data, context }): Promise<ChatSessionRow[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseUa, sourceOf } = await import("@/lib/chat-insight.server");

    const days = data.range === "today" ? 1 : data.range === "7d" ? 7 : 30;
    const since = data.range === "today"
      ? new Date(new Date().toDateString()).toISOString()
      : new Date(Date.now() - days * 86400000).toISOString();

    const { data: chats, error } = await supabaseAdmin
      .from("support_chats")
      .select("id,session_id,user_id,message_count,last_user_message,live_requested,satisfaction,is_spam,ai_rating,created_at,updated_at")
      .gte("created_at", since)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = chats ?? [];
    if (rows.length === 0) return [];

    const sessionIds = Array.from(new Set(rows.map((r) => r.session_id).filter(Boolean))) as string[];
    const { data: events } = await supabaseAdmin
      .from("analytics_events")
      .select("session_id,event_type,path,referrer,city,country,device,user_agent,created_at")
      .in("session_id", sessionIds)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(6000);

    const bySession = new Map<string, typeof events extends null ? never : NonNullable<typeof events>>();
    (events ?? []).forEach((e) => {
      const key = e.session_id ?? "";
      const arr = bySession.get(key) ?? [];
      arr.push(e);
      bySession.set(key, arr as never);
    });

    const out: ChatSessionRow[] = rows.map((r) => {
      const evs = bySession.get(r.session_id ?? "") ?? [];
      const first = evs[0];
      const chatStart = new Date(r.created_at ?? new Date().toISOString()).getTime();
      const post = evs.filter((e) => new Date(e.created_at ?? "").getTime() >= chatStart);
      const types = new Set(post.map((e) => e.event_type));
      const ua = parseUa(first?.user_agent ?? null);
      return {
        chat_id: r.id,
        session_id: r.session_id ?? "",
        user_id: r.user_id ?? null,
        started_at: r.created_at ?? "",
        ended_at: r.updated_at ?? r.created_at ?? "",
        message_count: r.message_count ?? 0,
        last_user_message: r.last_user_message ?? null,
        city: first?.city ?? null,
        country: first?.country ?? null,
        device: first?.device ?? ua.device,
        browser: ua.browser,
        os: ua.os,
        source: sourceOf(first?.referrer ?? null, first?.path ?? null),
        is_spam: Boolean((r as { is_spam?: boolean }).is_spam),
        ai_rating: (r as { ai_rating?: number | null }).ai_rating ?? null,
        satisfaction: r.satisfaction ?? null,
        live_requested: Boolean(r.live_requested),
        converted: types.has("order_created"),
        engaged: types.has("part_view") || types.has("click_whatsapp") || types.has("click_call") || types.has("buy_button_clicked"),
      };
    });

    return out.filter((r) => {
      if (data.source === "facebook" && r.source !== "Facebook") return false;
      if (data.source === "google" && r.source !== "Google") return false;
      if (data.source === "organic" && r.source !== "Organik") return false;
      if (data.outcome === "ai" && r.message_count < 2) return false;
      if (data.outcome === "converted" && !r.converted) return false;
      if (data.outcome === "abandoned" && r.converted) return false;
      return true;
    });
  });

export const getChatDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chat_id?: string; session_id?: string }) => ({
    chat_id: input?.chat_id ?? null,
    session_id: input?.session_id ?? null,
  }))
  .handler(async ({ data, context }): Promise<ChatDetail | null> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseUa, maskIp, sourceOf, normalizeMessages, extractOems, buildAnalysis } = await import("@/lib/chat-insight.server");

    let q = supabaseAdmin
      .from("support_chats")
      .select("id,session_id,user_id,messages,message_count,satisfaction,is_spam,ai_rating,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    q = data.chat_id ? q.eq("id", data.chat_id) : q.eq("session_id", data.session_id ?? "");
    const { data: chatRows, error } = await q;
    if (error) throw new Error(error.message);
    const chat = chatRows?.[0];
    if (!chat) return null;

    const messages = normalizeMessages(chat.messages);
    const startedAt = chat.created_at ?? new Date().toISOString();
    const endedAt = chat.updated_at ?? startedAt;
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(endedAt).getTime();

    const { data: events } = await supabaseAdmin
      .from("analytics_events")
      .select("created_at,event_type,path,referrer,city,country,device,user_agent,metadata")
      .eq("session_id", chat.session_id ?? "")
      .order("created_at", { ascending: true })
      .limit(500);
    const evs = events ?? [];
    const first = evs[0];
    const ua = parseUa(first?.user_agent ?? null);

    const label = (e: { event_type: string; metadata: unknown; path: string | null }): string | null => {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const cand = ["query", "oem", "title", "term", "q"].map((k) => m[k]).find((v) => typeof v === "string");
      return (cand as string) ?? null;
    };
    const toBehavior = (e: (typeof evs)[number]): ChatBehaviorEvent => ({
      created_at: e.created_at ?? "",
      event_type: e.event_type,
      path: e.path ?? null,
      label: label({ event_type: e.event_type, metadata: e.metadata, path: e.path ?? null }),
    });

    const before = evs.filter((e) => new Date(e.created_at ?? "").getTime() < startMs).map(toBehavior).slice(-40);
    const after = evs.filter((e) => new Date(e.created_at ?? "").getTime() > endMs).map(toBehavior).slice(0, 40);
    const afterTypes = new Set(after.map((e) => e.event_type));

    const oems = extractOems(messages.filter((m) => m.role === "user").map((m) => m.content).join(" "));
    let demandHits = 0;
    if (oems.length) {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count } = await supabaseAdmin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["search", "oem_search", "no_results_view", "ai_assistant_search"])
        .gte("created_at", since30)
        .ilike("metadata->>query", `%${oems[0]}%`);
      demandHits = count ?? 0;
    }

    const analysis = buildAnalysis({
      messages,
      postEvents: after,
      durationMin: Math.max(0, (Date.now() - endMs) / 60000),
      demandHits,
      oems,
      productsShown: after.filter((e) => e.event_type === "part_view").length,
      // Sohbet öncesi/sırasında görüntülenen ürünler de dikkate alınır; aksi halde
      // analiz yanlışlıkla "ürün görüntülenmedi" der.
      productsShownBefore: before.filter((e) => e.event_type === "part_view").length,
      sessionEventCount: evs.length,
    });


    const ipRaw = ((first?.metadata ?? {}) as Record<string, unknown>)["ip"];

    return {
      chat_id: chat.id,
      session_id: chat.session_id ?? "",
      user_id: chat.user_id ?? null,
      messages,
      started_at: startedAt,
      ended_at: endedAt,
      duration_sec: Math.max(0, Math.round((endMs - startMs) / 1000)),
      message_count: chat.message_count ?? messages.length,
      city: first?.city ?? null,
      country: first?.country ?? null,
      ip_masked: maskIp(typeof ipRaw === "string" ? ipRaw : null),
      device: first?.device ?? ua.device,
      browser: ua.browser,
      os: ua.os,
      source: sourceOf(first?.referrer ?? null, first?.path ?? null),
      is_spam: Boolean((chat as { is_spam?: boolean }).is_spam),
      ai_rating: (chat as { ai_rating?: number | null }).ai_rating ?? null,
      satisfaction: chat.satisfaction ?? null,
      before,
      after,
      after_flags: {
        viewed_part: afterTypes.has("part_view"),
        added_to_cart: afterTypes.has("add_to_cart"),
        checkout: afterTypes.has("buy_button_clicked") || afterTypes.has("checkout"),
        ordered: afterTypes.has("order_created"),
        left: after.length === 0,
      },
      analysis,
    };
  });

export const updateChatFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chat_id: string; is_spam?: boolean; ai_rating?: number }) => ({
    chat_id: String(input.chat_id),
    is_spam: typeof input.is_spam === "boolean" ? input.is_spam : undefined,
    ai_rating: typeof input.ai_rating === "number" ? Math.max(1, Math.min(5, Math.round(input.ai_rating))) : undefined,
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.is_spam !== undefined) patch["is_spam"] = data.is_spam;
    if (data.ai_rating !== undefined) patch["ai_rating"] = data.ai_rating;
    const { error } = await supabaseAdmin.from("support_chats").update(patch as never).eq("id", data.chat_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
