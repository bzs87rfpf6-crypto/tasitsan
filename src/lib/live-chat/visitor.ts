// Visitor-side live-chat helpers.
//
// Signed-in visitors talk to the tables directly (RLS scopes rows to their
// user_id). Guests have no anonymous table/storage access at all: they go
// through the public server functions in guest.functions.ts, which verify the
// visitor token before touching anything.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  guestEnsureConversation,
  guestGetChat,
  guestSendMessage,
  guestMarkSeen,
  guestCreateUpload,
  visitorPing,

} from "@/lib/live-chat/guest.functions";

export type LiveConv = Database["public"]["Tables"]["live_chat_conversations"]["Row"];

export interface LiveMsg {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  message: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  seen_at: string | null;
  created_at: string;
}

const LS_VISITOR_ID = "ts_lc_visitor_v1";
const LS_CONV_ID = "ts_lc_conv_v1";
const BUCKET = "live-chat-attachments";
const POLL_MS = 2500;

function rand(len = 32) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let v = localStorage.getItem(LS_VISITOR_ID);
  if (!v || !/^[a-zA-Z0-9_-]{16,64}$/.test(v)) {
    v = rand(32);
    localStorage.setItem(LS_VISITOR_ID, v);
  }
  return v;
}

export function getStoredConvId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_CONV_ID);
}
export function setStoredConvId(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_CONV_ID, id);
    else localStorage.removeItem(LS_CONV_ID);
  } catch { /* noop */ }
}

const LS_GUEST_MODE = "ts_lc_guest_v1";

/**
 * Conversations started by an admin from the Live Traffic panel are always
 * guest-owned rows (visitor token, no user_id) even when the visitor happens
 * to be signed in — so every operation must go through the guest endpoints.
 */
export function setGuestMode(v: boolean) {
  try {
    if (v) localStorage.setItem(LS_GUEST_MODE, "1");
    else localStorage.removeItem(LS_GUEST_MODE);
  } catch { /* noop */ }
}
export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(LS_GUEST_MODE) === "1"; } catch { return false; }
}

async function currentUserId(): Promise<string | null> {
  if (isGuestMode()) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Heartbeat: keeps the session ↔ visitor map fresh and discovers conversations
 * an admin started for this visitor.
 */
export async function pingVisitor(sessionId: string): Promise<{
  conversation_id: string | null;
  unread: number;
  initiated_by: string | null;
}> {
  const { data } = await supabase.auth.getUser();
  const payload = {
    visitor_id: getVisitorId(),
    session_id: sessionId,
    path: typeof location !== "undefined" ? location.pathname.slice(0, 300) : null,
    user_id: data.user?.id ?? null,
  };
  const res = await visitorPing({ data: payload });
  if (typeof window !== "undefined") {
    console.debug("[live-chat][visitor] ping", {
      visitor_key: payload.visitor_id,
      session_id: payload.session_id,
      conversation_id: res.conversation_id,
      initiated_by: res.initiated_by,
      unread: res.unread,
    });
  }
  return res;
}


function device() {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent;
  let os = "Unknown";
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  return {
    os, browser,
    device: /Mobi/i.test(ua) ? "mobile" : "desktop",
    page: typeof location !== "undefined" ? location.pathname : "",
    lang: navigator.language,
  };
}

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

/**
 * Turns a stored attachment reference into something the browser can open.
 * New rows store a storage path (private bucket) → sign it. Guest payloads and
 * legacy rows already carry an absolute URL → pass through.
 */
export async function resolveAttachmentUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(value, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function ensureConversation(input: {
  name?: string; contact?: string; message?: string; subject?: string;
}): Promise<{ id: string } | { error: string }> {
  const userId = await currentUserId();
  const existing = getStoredConvId();

  if (existing) {
    if (userId) {
      const { data } = await supabase
        .from("live_chat_conversations")
        .select("id")
        .eq("id", existing)
        .maybeSingle();
      if (data) return { id: data.id };
    } else {
      try {
        await guestGetChat({ data: { visitor_id: getVisitorId(), conversation_id: existing } });
        return { id: existing };
      } catch { /* stale id — fall through and create a new one */ }
    }
  }

  if (!userId) {
    try {
      const res = await guestEnsureConversation({ data: {
        visitor_id: getVisitorId(),
        name: input.name ?? null,
        contact: input.contact ?? null,
        subject: input.subject ?? null,
        message: input.message?.trim() || null,
        device_meta: device(),
      }});
      setStoredConvId(res.id);
      return { id: res.id };
    } catch (e) {
      return { error: errMsg(e, "Sohbet oluşturulamadı") };
    }
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  const payload = {
    visitor_id: null,
    user_id: userId,
    status: "waiting" as const,
    subject: input.subject ?? null,
    user_meta: {
      name: input.name ?? user?.user_metadata?.full_name ?? null,
      contact: input.contact ?? user?.email ?? null,
      email: user?.email ?? null,
    },
    device_meta: device(),
  };
  const { data, error } = await supabase
    .from("live_chat_conversations")
    .insert(payload as never)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Sohbet oluşturulamadı" };
  setStoredConvId(data.id);
  if (input.message?.trim()) await sendMessage(data.id, input.message.trim());
  return { id: data.id };
}

export async function sendMessage(
  convId: string,
  message: string,
  attachment?: { path: string; type: string },
): Promise<{ error?: { message: string } }> {
  const userId = await currentUserId();
  if (!userId) {
    try {
      await guestSendMessage({ data: {
        visitor_id: getVisitorId(),
        conversation_id: convId,
        message: message || undefined,
        attachment_path: attachment?.path ?? null,
        attachment_type: attachment?.type ?? null,
      }});
      return {};
    } catch (e) {
      return { error: { message: errMsg(e, "Gönderilemedi") } };
    }
  }
  const { error } = await supabase.from("live_chat_messages").insert({
    conversation_id: convId,
    sender_type: "visitor",
    sender_id: userId,
    message: message || null,
    attachment_url: attachment?.path ?? null,
    attachment_type: attachment?.type ?? null,
  } as never);
  return { error: error ? { message: error.message } : undefined };
}

export async function loadMessages(convId: string): Promise<LiveMsg[]> {
  const userId = await currentUserId();
  if (!userId) {
    try {
      const res = await guestGetChat({ data: { visitor_id: getVisitorId(), conversation_id: convId } });
      return res.messages as LiveMsg[];
    } catch (e) {
      console.warn("[live-chat][visitor] read failed (RLS/endpoint)", e);
      return [];
    }
  }
  const { data } = await supabase
    .from("live_chat_messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as unknown as LiveMsg[];
}

export async function markVisitorSeen(convId: string) {
  const userId = await currentUserId();
  if (!userId) {
    try {
      await guestMarkSeen({ data: { visitor_id: getVisitorId(), conversation_id: convId } });
    } catch { /* noop */ }
    return;
  }
  await supabase
    .from("live_chat_messages")
    .update({ seen_at: new Date().toISOString() } as never)
    .eq("conversation_id", convId)
    .eq("sender_type", "admin")
    .is("seen_at", null);
  await supabase
    .from("live_chat_conversations")
    .update({ unread_visitor: 0 } as never)
    .eq("id", convId);
}

/** Uploads into the conversation's own folder in the private attachments bucket. */
export async function uploadAttachment(
  convId: string,
  file: File,
): Promise<{ path: string; type: string } | { error: string }> {
  const type = file.type || "application/octet-stream";
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const userId = await currentUserId();

  if (!userId) {
    try {
      const { path, token } = await guestCreateUpload({ data: {
        visitor_id: getVisitorId(),
        conversation_id: convId,
        ext,
      }});
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file, { contentType: type });
      if (error) return { error: error.message };
      return { path, type };
    } catch (e) {
      return { error: errMsg(e, "Dosya yüklenemedi") };
    }
  }

  const path = `${convId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
  if (error) return { error: error.message };
  return { path, type };
}

export function subscribeConversation(convId: string, cbs: {
  onMessage?: (m: LiveMsg) => void;
  onConv?: (c: LiveConv) => void;
  onTyping?: (who: "admin" | "visitor") => void;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Broadcast (typing) works for everyone and carries no row data.
  const ch = supabase
    .channel(`lc:${convId}`)
    .on("broadcast", { event: "typing" }, (p) => cbs.onTyping?.((p.payload as { who: "admin" | "visitor" }).who));

  void (async () => {
    const userId = await currentUserId();
    if (stopped) return;
    if (userId) {
      // Signed-in: realtime row changes are RLS-scoped to this user.
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `conversation_id=eq.${convId}` },
        (p) => cbs.onMessage?.(p.new as LiveMsg))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_messages", filter: `conversation_id=eq.${convId}` },
          (p) => cbs.onMessage?.(p.new as LiveMsg))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_conversations", filter: `id=eq.${convId}` },
          (p) => cbs.onConv?.(p.new as LiveConv));
      ch.subscribe((status) => console.debug("[live-chat][visitor] realtime status", convId, status));
      return;
    }

    // Guests: no row-level realtime access — poll through the verified endpoint.
    ch.subscribe((status) => console.debug("[live-chat][visitor] channel status", convId, status));
    const seen = new Map<string, string>();
    const tick = async () => {
      if (stopped) return;
      const rows = await loadMessages(convId);
      if (stopped) return;
      for (const m of rows) {
        const sig = `${m.seen_at ?? ""}|${m.message ?? ""}|${m.attachment_url ?? ""}`;
        if (seen.get(m.id) !== sig) {
          seen.set(m.id, sig);
          console.debug("[live-chat][visitor] new message", { conversation_id: convId, id: m.id, sender: m.sender_type });
          cbs.onMessage?.(m);
        }
      }
    };
    // Seed without firing callbacks for history already rendered by the caller.
    const initial = await loadMessages(convId);
    for (const m of initial) seen.set(m.id, `${m.seen_at ?? ""}|${m.message ?? ""}|${m.attachment_url ?? ""}`);
    timer = setInterval(() => void tick(), POLL_MS);
  })();

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    void supabase.removeChannel(ch);
  };
}

export function sendTyping(convId: string, who: "admin" | "visitor") {
  const ch = supabase.channel(`lc:${convId}`);
  void ch.send({ type: "broadcast", event: "typing", payload: { who } });
}
