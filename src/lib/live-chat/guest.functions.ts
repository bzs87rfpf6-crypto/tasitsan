// Public (unauthenticated) live-chat endpoints for guest visitors.
//
// Guests have NO direct table or storage access anymore: every operation goes
// through here and must present the visitor token that owns the conversation.
// The service client is only reached after that ownership check passes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "live-chat-attachments";
const SIGNED_TTL = 60 * 60; // 1 hour

const zVisitor = z.string().trim().regex(/^[a-zA-Z0-9_-]{16,64}$/, "Geçersiz ziyaretçi anahtarı");
const zConv = z.string().uuid();
const zPath = z.string().trim().max(400).regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/, "Geçersiz dosya yolu");

type AdminClient = Awaited<ReturnType<typeof getAdmin>>;

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Spam/abuse guard for anonymous visitors. No e-mail or account is ever asked,
 * so the visitor token is the only identity: bucket everything on it.
 */
async function guardRate(db: AdminClient, key: string, max: number, windowSeconds: number) {
  const { data } = await db.rpc("check_rate_limit", {
    _key: key,
    _max: max,
    _window_seconds: windowSeconds,
  });
  const res = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (res && res.allowed === false) {
    throw new Error(`Çok hızlı gönderiyorsunuz. Lütfen ${res.retry_after_seconds ?? 30} sn sonra tekrar deneyin.`);
  }
}


/** Verifies the caller holds the visitor token of this guest conversation. */
async function requireGuestConversation(db: AdminClient, conversationId: string, visitorId: string) {
  const { data, error } = await db
    .from("live_chat_conversations")
    .select("id,status,visitor_id,user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const conv = data as { id: string; status: string; visitor_id: string | null; user_id: string | null } | null;
  // Guest conversations only, and only the visitor that created it.
  if (!conv || conv.user_id !== null || !conv.visitor_id || conv.visitor_id !== visitorId) {
    throw new Error("Sohbet bulunamadı");
  }
  return conv;
}

/** Replaces stored attachment paths with short-lived signed URLs. */
export interface GuestMsg {
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

async function withSignedAttachments(db: AdminClient, rows: Array<Record<string, unknown>>): Promise<GuestMsg[]> {
  const paths = Array.from(
    new Set(
      rows
        .map((r) => r.attachment_url)
        .filter((v): v is string => typeof v === "string" && v.length > 0 && !/^https?:\/\//i.test(v)),
    ),
  );
  const signed: Record<string, string> = {};
  await Promise.all(
    paths.map(async (p) => {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(p, SIGNED_TTL);
      if (data?.signedUrl) signed[p] = data.signedUrl;
    }),
  );
  return rows.map((r) => {
    const raw = r.attachment_url;
    const url = typeof raw === "string" && raw ? (signed[raw] ?? (/^https?:\/\//i.test(raw) ? raw : null)) : null;
    return {
      id: String(r.id),
      conversation_id: String(r.conversation_id),
      sender_type: String(r.sender_type),
      sender_id: (r.sender_id as string | null) ?? null,
      message: (r.message as string | null) ?? null,
      attachment_url: url,
      attachment_type: (r.attachment_type as string | null) ?? null,
      seen_at: (r.seen_at as string | null) ?? null,
      created_at: String(r.created_at),
    };
  });
}

export const guestEnsureConversation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        visitor_id: zVisitor,
        name: z.string().trim().max(120).nullish(),
        contact: z.string().trim().max(200).nullish(),
        subject: z.string().trim().max(200).nullish(),
        message: z.string().trim().max(4000).nullish(),
        device_meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    // Max 3 yeni sohbet / 10 dk.
    await guardRate(db, `lc_new:${data.visitor_id}`, 3, 600);



    // Cheap abuse guard: a visitor cannot keep spawning open conversations.
    const { count } = await db
      .from("live_chat_conversations")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", data.visitor_id)
      .neq("status", "closed");
    if ((count ?? 0) >= 5) throw new Error("Çok fazla açık sohbetiniz var.");

    const { data: row, error } = await db
      .from("live_chat_conversations")
      .insert({
        visitor_id: data.visitor_id,
        user_id: null,
        status: "waiting",
        subject: data.subject ?? null,
        user_meta: { name: data.name ?? null, contact: data.contact ?? null, email: null },
        device_meta: data.device_meta,
      } as never)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Sohbet oluşturulamadı");

    const id = (row as { id: string }).id;
    if (data.message) {
      await db.from("live_chat_messages").insert({
        conversation_id: id,
        sender_type: "visitor",
        sender_id: null,
        message: data.message,
      } as never);
    }
    return { id };
  });

export const guestGetChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ visitor_id: zVisitor, conversation_id: zConv }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const conv = await requireGuestConversation(db, data.conversation_id, data.visitor_id);
    const { data: msgs } = await db
      .from("live_chat_messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(200);
    const messages = await withSignedAttachments(db, (msgs ?? []) as Array<Record<string, unknown>>);
    return { status: conv.status, messages };
  });

export const guestSendMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        visitor_id: zVisitor,
        conversation_id: zConv,
        message: z.string().trim().max(4000).optional(),
        attachment_path: zPath.nullish(),
        attachment_type: z.string().trim().max(120).nullish(),
      })
      .refine((v) => (v.message && v.message.length > 0) || v.attachment_path, "Boş mesaj")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    // Max 20 mesaj / dakika, misafir anahtarı başına.
    await guardRate(db, `lc_msg:${data.visitor_id}`, 20, 60);
    const conv = await requireGuestConversation(db, data.conversation_id, data.visitor_id);

    if (conv.status === "closed") throw new Error("Bu sohbet kapatıldı.");
    if (data.attachment_path && !data.attachment_path.startsWith(`${data.conversation_id}/`)) {
      throw new Error("Geçersiz dosya yolu");
    }
    const { error } = await db.from("live_chat_messages").insert({
      conversation_id: data.conversation_id,
      sender_type: "visitor",
      sender_id: null,
      message: data.message || null,
      attachment_url: data.attachment_path ?? null,
      attachment_type: data.attachment_type ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const guestMarkSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ visitor_id: zVisitor, conversation_id: zConv }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await requireGuestConversation(db, data.conversation_id, data.visitor_id);
    await db
      .from("live_chat_messages")
      .update({ seen_at: new Date().toISOString() } as never)
      .eq("conversation_id", data.conversation_id)
      .eq("sender_type", "admin")
      .is("seen_at", null);
    await db
      .from("live_chat_conversations")
      .update({ unread_visitor: 0 } as never)
      .eq("id", data.conversation_id);
    return { ok: true as const };
  });

/** Issues a one-shot signed upload URL scoped to the visitor's own conversation folder. */
export const guestCreateUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        visitor_id: zVisitor,
        conversation_id: zConv,
        ext: z.string().trim().toLowerCase().regex(/^[a-z0-9]{1,8}$/).default("bin"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const conv = await requireGuestConversation(db, data.conversation_id, data.visitor_id);
    if (conv.status === "closed") throw new Error("Bu sohbet kapatıldı.");
    const path = `${data.conversation_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${data.ext}`;
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Yükleme başlatılamadı");
    return { path, token: signed.token };
  });

/**
 * Heartbeat from the visitor widget.
 * - Maps the analytics session id to the live-chat visitor token so an admin
 *   can start a conversation straight from the Live Traffic panel.
 * - Returns any open conversation belonging to this visitor (including ones
 *   the admin started), so the widget can pick it up without a page reload.
 */
export const visitorPing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        visitor_id: zVisitor,
        session_id: z.string().trim().min(1).max(120),
        path: z.string().trim().max(300).nullish(),
        user_id: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await db
      .from("live_chat_visitor_sessions")
      .upsert(
        {
          session_id: data.session_id,
          visitor_id: data.visitor_id,
          user_id: data.user_id ?? null,
          last_path: data.path ?? null,
          last_seen_at: new Date().toISOString(),
        } as never,
        { onConflict: "session_id" },
      );

    // Match by this visitor's own key, by the full analytics session id, or by
    // the MASKED session id (right(session_id,6)) that the admin Live Traffic
    // panel used before the fix — so admin-initiated chats are always found.
    const masked = data.session_id.slice(-6);
    const { data: rows } = await db
      .from("live_chat_conversations")
      .select("id,status,unread_visitor,initiated_by,visitor_id,session_id")
      .is("user_id", null)
      .neq("status", "closed")
      .or(
        `visitor_id.eq.${data.visitor_id},session_id.eq.${data.session_id},session_id.eq.${masked},visitor_id.eq.sess${masked}`.concat(
          `,visitor_id.eq.${`sess${masked}`.padEnd(16, "0").slice(0, 64)}`,
        ),
      )
      .order("last_message_at", { ascending: false })
      .limit(1);
    const conv = (rows ?? [])[0] as
      | {
          id: string;
          status: string;
          unread_visitor: number | null;
          initiated_by: string | null;
          visitor_id: string | null;
          session_id: string | null;
        }
      | undefined;
    if (!conv) return { conversation_id: null, unread: 0, initiated_by: null };

    // Claim a session-matched conversation for this visitor key (and repair a
    // masked session id) so every later guest call passes the ownership check.
    if (conv.visitor_id !== data.visitor_id || conv.session_id !== data.session_id) {
      await db
        .from("live_chat_conversations")
        .update({ visitor_id: data.visitor_id, session_id: data.session_id } as never)
        .eq("id", conv.id);
    }

    return {
      conversation_id: conv.id,
      unread: conv.unread_visitor ?? 0,
      initiated_by: conv.initiated_by ?? "visitor",
    };
  });

