// Admin-only server functions for the live-chat panel.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  await assertOwnerAdmin(ctx.supabase, ctx.userId);
}

export const adminListConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(["all", "waiting", "active", "closed"]).default("all"),
    search: z.string().trim().max(120).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    let q = context.supabase
      .from("live_chat_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = (rows ?? []) as Array<Record<string, any>>;
    if (data.search) {
      const s = data.search.toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(s));
    }
    // enrich with profiles for signed-in users
    const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    let profiles: Record<string, any> = {};
    if (userIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pr } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,whatsapp,city,email,avatar_url,created_at")
        .in("id", userIds);
      profiles = Object.fromEntries((pr ?? []).map((p: any) => [p.id, p]));
    }
    return list.map((c) => ({ ...c, profile: c.user_id ? profiles[c.user_id] ?? null : null }));
  });

export const adminGetConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: conv, error } = await context.supabase
      .from("live_chat_conversations").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Sohbet bulunamadı");
    const [{ data: msgs }, { data: notes }] = await Promise.all([
      context.supabase.from("live_chat_messages").select("*").eq("conversation_id", data.id).order("created_at", { ascending: true }).limit(500),
      context.supabase.from("live_chat_notes").select("*").eq("conversation_id", data.id).order("created_at", { ascending: false }).limit(50),
    ]);
    let profile = null;
    if (conv.user_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pr } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,whatsapp,city,email,avatar_url,created_at")
        .eq("id", conv.user_id).maybeSingle();
      profile = pr;
    }
    let lastSignIn: string | null = null;
    if (conv.user_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(conv.user_id);
        lastSignIn = u?.user?.last_sign_in_at ?? null;
      } catch { /* noop */ }
    }
    return { conv, messages: msgs ?? [], notes: notes ?? [], profile, lastSignIn };
  });

export const adminSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    message: z.string().trim().max(4000).optional(),
    attachment_url: z.string().trim().max(1000).nullable().optional(),
    attachment_type: z.string().max(120).nullable().optional(),
  }).refine((v) => (v.message && v.message.length > 0) || v.attachment_url, "Boş mesaj").parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("live_chat_messages").insert({
      conversation_id: data.conversation_id,
      sender_type: "admin",
      sender_id: context.userId,
      message: data.message ?? null,
      attachment_url: data.attachment_url ?? null,
      attachment_type: data.attachment_type ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminMarkSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await context.supabase.from("live_chat_messages").update({ seen_at: new Date().toISOString() })
      .eq("conversation_id", data.conversation_id).eq("sender_type", "visitor").is("seen_at", null);
    await context.supabase.from("live_chat_conversations").update({ unread_admin: 0 }).eq("id", data.conversation_id);
    return { ok: true as const };
  });

export const adminSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    status: z.enum(["waiting", "active", "closed"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch = {
      status: data.status,
      closed_at: data.status === "closed" ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase.from("live_chat_conversations").update(patch as never).eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminAddNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    note: z.string().trim().min(1).max(2000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("live_chat_notes").insert({
      conversation_id: data.conversation_id,
      admin_id: context.userId,
      note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Admin-initiated chat with a live visitor (member or anonymous).
 * Resolves the visitor token from the analytics session id, reuses an open
 * conversation when one exists, and optionally posts the first admin message.
 */
export const adminStartVisitorChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().trim().min(1).max(120),
    message: z.string().trim().max(4000).optional(),
    context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The Live Traffic panel only ever sees a MASKED session id (right(session_id,6))
    // for privacy. Binding a conversation to that masked value made it invisible to
    // the visitor, whose heartbeat reports the full session id. Resolve it first.
    type SessMap = { session_id: string; visitor_id: string; user_id: string | null; last_path: string | null };
    let sessionId = data.session_id;
    let mapRow: SessMap | null = null;

    {
      const { data: exact } = await supabaseAdmin
        .from("live_chat_visitor_sessions")
        .select("session_id,visitor_id,user_id,last_path")
        .eq("session_id", sessionId)
        .maybeSingle();
      mapRow = (exact as SessMap | null) ?? null;
    }
    if (!mapRow) {
      // Masked / partial id → newest visitor session whose id ends with it.
      const { data: suffix } = await supabaseAdmin
        .from("live_chat_visitor_sessions")
        .select("session_id,visitor_id,user_id,last_path")
        .like("session_id", `%${sessionId}`)
        .order("last_seen_at", { ascending: false })
        .limit(1);
      mapRow = ((suffix ?? [])[0] as SessMap | undefined) ?? null;
      if (mapRow) sessionId = mapRow.session_id;
    }

    if (!mapRow) {
      // Widget never pinged (e.g. visitor has JS chat closed): still recover the
      // full analytics session id so the heartbeat can claim the chat later.
      const { data: ev } = await supabaseAdmin
        .from("analytics_events")
        .select("session_id,created_at")
        .like("session_id", `%${sessionId}`)
        .order("created_at", { ascending: false })
        .limit(1);
      const full = ((ev ?? [])[0] as { session_id: string } | undefined)?.session_id;
      if (full) sessionId = full;
    }
    const map = mapRow;

    // The visitor's chat widget may not have registered its key yet. Fall back
    // to a deterministic placeholder derived from the analytics session id; the
    // visitor claims the conversation on its next heartbeat (visitorPing).
    const placeholder = `sess${sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`
      .padEnd(16, "0")
      .slice(0, 64);
    const visitorKey = map?.visitor_id ?? placeholder;

    const { data: openRows } = await supabaseAdmin
      .from("live_chat_conversations")
      .select("id,status,visitor_id")
      .is("user_id", null)
      .neq("status", "closed")
      .or(`visitor_id.eq.${visitorKey},session_id.eq.${sessionId},session_id.eq.${data.session_id}`)
      .order("last_message_at", { ascending: false })
      .limit(1);
    let convId = ((openRows ?? [])[0] as { id: string } | undefined)?.id ?? null;

    if (!convId) {
      const { data: created, error } = await supabaseAdmin
        .from("live_chat_conversations")
        .insert({
          visitor_id: visitorKey,
          user_id: null,
          session_id: sessionId,
          initiated_by: "admin",
          status: "active",
          subject: "Yönetici tarafından başlatıldı",
          user_meta: { name: null, contact: null, email: null, member_user_id: map?.user_id ?? null },
          device_meta: { ...(data.context ?? {}), path: map?.last_path ?? null, session_id: sessionId },
        } as never)
        .select("id")

        .single();
      if (error || !created) {
        console.error("[live-chat] admin conversation insert failed", error);
        throw new Error(error?.message ?? "Sohbet oluşturulamadı");
      }
      convId = (created as { id: string }).id;
    } else {
      await supabaseAdmin
        .from("live_chat_conversations")
        .update({ session_id: data.session_id, status: "active" } as never)
        .eq("id", convId);
    }


    if (data.message) {
      const { error } = await supabaseAdmin.from("live_chat_messages").insert({
        conversation_id: convId,
        sender_type: "admin",
        sender_id: context.userId,
        message: data.message,
      } as never);
      if (error) {
        console.error("[live-chat] admin message insert failed", error);
        throw new Error(error.message);
      }

    }
    return { conversation_id: convId };
  });

/**
 * Admin-only, ON-DEMAND AI helper.
 * Sadece yönetici düğmeye bastığında çalışır ve özet/analiz döndürür;
 * müşteriye asla otomatik mesaj yazmaz (hiçbir tabloya yazma yapmaz).
 */
export const adminSummarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: msgs, error } = await context.supabase
      .from("live_chat_messages")
      .select("sender_type,message,created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const transcript = (msgs ?? [])
      .map((m: { sender_type: string; message: string | null }) =>
        `${m.sender_type === "admin" ? "Yetkili" : "Müşteri"}: ${m.message ?? "[dosya]"}`)
      .join("\n")
      .slice(0, 12000);
    if (!transcript) return { summary: "Bu sohbette henüz mesaj yok." };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI yapılandırılmamış.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Sen bir oto yedek parça destek ekibinin iç asistanısın. Müşteriye cevap yazmazsın; yalnızca yöneticiye Türkçe kısa özet, talep edilen parça/OEM bilgisi ve önerilen sonraki adımı maddeler halinde verirsin." },
          { role: "user", content: `Sohbet dökümü:\n${transcript}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI hatası (${res.status})`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { summary: json.choices?.[0]?.message?.content?.trim() || "Özet üretilemedi." };
  });
