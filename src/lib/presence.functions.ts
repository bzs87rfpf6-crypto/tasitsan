import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type PresenceVisitor = {
  visitor: string;
  session_id: string | null;
  online: boolean;
  open_tabs: number;
  path: string | null;
  city: string | null;
  country: string | null;
  device: string | null;
  is_bot: boolean;
  is_internal: boolean;
  first_seen: string;
  last_seen: string;
  seconds_since: number;
};

export type PresenceSnapshot = {
  online_visitors: number;
  online_admins: number;
  online_bots: number;
  unique_today: number;
  visitors: PresenceVisitor[];
};

export type HeartbeatInput = {
  tabId: string;
  fallbackId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  city?: string | null;
  country?: string | null;
  device?: string | null;
  isBot?: boolean;
  isInternal?: boolean;
  leaving?: boolean;
};

const s = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Aktif sekmeden gelen "hâlâ buradayım" sinyali.
 * Kimlik doğrulaması gerektirmez (misafir ziyaretçiler de sayılır); IP sunucuda
 * okunur ve yalnızca anonim özet olarak saklanır.
 */
export const presenceHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((input: HeartbeatInput) => ({
    tabId: s(input?.tabId, 80) ?? "",
    fallbackId: s(input?.fallbackId, 120),
    sessionId: s(input?.sessionId, 120),
    path: s(input?.path, 500),
    city: s(input?.city, 120),
    country: s(input?.country, 120),
    device: s(input?.device, 40),
    isBot: Boolean(input?.isBot),
    isInternal: Boolean(input?.isInternal),
    leaving: Boolean(input?.leaving),
  }))
  .handler(async ({ data }) => {
    if (!data.tabId) return { ok: false as const, visitorKey: null };

    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
    const { resolveClientIp, visitorKeyFrom } = await import("@/lib/presence.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip = resolveClientIp({
        cfConnectingIp: getRequestHeader("cf-connecting-ip") ?? null,
        xForwardedFor: getRequestHeader("x-forwarded-for") ?? null,
        xRealIp: getRequestHeader("x-real-ip") ?? null,
        fallback: getRequestIP() ?? null,
      });
      ua = getRequestHeader("user-agent") ?? null;
    } catch {
      /* başlıklar okunamazsa yedek kimliğe düşülür */
    }

    const visitorKey = visitorKeyFrom(ip, data.fallbackId);

    if (data.leaving) {
      await supabaseAdmin.rpc("end_visitor_presence" as never, { _tab_id: data.tabId } as never);
      return { ok: true as const, visitorKey };
    }

    // Oturum açmış kullanıcıyı sunucuda doğrula: yönetici/geliştirici oturumları
    // veritabanı tarafında "iç kullanım" sayılır ve ziyaretçi istatistiklerine girmez.
    let userId: string | null = null;
    try {
      const authHeader = getRequestHeader("authorization") ?? "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;
      if (token) {
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        userId = u?.user?.id ?? null;
      }
    } catch {
      /* kimlik çözülemezse anonim ziyaretçi olarak devam edilir */
    }

    const { error } = await supabaseAdmin.rpc("record_visitor_presence" as never, {
      _tab_id: data.tabId,
      _visitor_key: visitorKey,
      _session_id: data.sessionId,
      _user_id: userId,
      _path: data.path,
      _city: data.city,
      _country: data.country,
      _device: data.device,
      _user_agent: ua,
      _is_bot: data.isBot,
      _is_internal: data.isInternal,
    } as never);
    if (error) return { ok: false as const, visitorKey };
    return { ok: true as const, visitorKey };
  });


/** Admin: kimin şu anda sitede olduğu + günün benzersiz ziyaretçi sayısı. */
export const getPresenceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { timeoutSeconds?: number } | undefined) => ({
    timeoutSeconds: Math.min(300, Math.max(15, Number(input?.timeoutSeconds ?? 45))),
  }))
  .handler(async ({ data, context }): Promise<PresenceSnapshot> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { data: rpc, error } = await context.supabase.rpc("admin_presence_snapshot" as never, {
      _timeout_seconds: data.timeoutSeconds,
    } as never);
    if (error) throw new Error(error.message);
    return (rpc ?? {
      online_visitors: 0,
      online_admins: 0,
      online_bots: 0,
      unique_today: 0,
      visitors: [],
    }) as unknown as PresenceSnapshot;
  });
