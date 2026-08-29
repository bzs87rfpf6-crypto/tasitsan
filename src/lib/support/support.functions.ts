import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SUPPORT_SYSTEM_PROMPT } from "./support-knowledge";

type Msg = { role: "user" | "assistant"; content: string };

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  session_id: z.string().min(4).max(80),
  chat_id: z.string().uuid().nullable().optional(),
  messages: z.array(MessageSchema).min(1).max(40),
});

export const sendSupportMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI servisi yapılandırılmamış." };
    }

    // Detect live-support intent (also handled by system prompt)
    const last = data.messages[data.messages.length - 1];
    const wantsLive = /canlı destek|yetkili|temsilci|insan(a|la)? görüş|müşteri hizmetleri/i.test(last.content);

    let reply = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SUPPORT_SYSTEM_PROMPT },
            ...data.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.4,
          max_tokens: 500,
        }),
      });
      if (res.status === 429) return { ok: false as const, error: "Şu anda yoğunluk var, kısa süre sonra tekrar deneyin." };
      if (res.status === 402) return { ok: false as const, error: "AI kredisi doldu. Lütfen yönetici ile iletişime geçin." };
      if (!res.ok) return { ok: false as const, error: `AI hatası (${res.status})` };
      const j = await res.json();
      reply = String(j?.choices?.[0]?.message?.content ?? "").trim();
    } catch (e) {
      console.error("[support] ai fail", e);
      return { ok: false as const, error: "AI yanıt veremedi. Lütfen tekrar deneyin." };
    }

    if (!reply) reply = "Üzgünüm, şu anda yanıt üretemedim. Canlı desteğe iletebilirim.";

    // Persist chat (best-effort, service role for guest support)
    let chatId = data.chat_id ?? null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const newMessages: Msg[] = [...data.messages, { role: "assistant", content: reply }];
      if (chatId) {
        await supabaseAdmin
          .from("support_chats")
          .update({
            messages: newMessages as never,
            message_count: newMessages.length,
            last_user_message: last.content.slice(0, 500),
            live_requested: wantsLive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", chatId);
      } else {
        const { data: ins } = await supabaseAdmin
          .from("support_chats")
          .insert({
            session_id: data.session_id,
            messages: newMessages as never,
            message_count: newMessages.length,
            last_user_message: last.content.slice(0, 500),
            live_requested: wantsLive,
          })
          .select("id")
          .single();
        chatId = ins?.id ?? null;
      }
    } catch (e) {
      console.warn("[support] persist fail", e);
    }

    return { ok: true as const, reply, chat_id: chatId, live: wantsLive };
  });

const LiveSchema = z.object({
  chat_id: z.string().uuid().nullable().optional(),
  session_id: z.string().min(4).max(80),
  name: z.string().trim().max(120).optional(),
  contact: z.string().trim().min(3).max(200),
  message: z.string().trim().min(3).max(2000),
});

export const submitLiveSupport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LiveSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("support_live_requests").insert({
        chat_id: data.chat_id ?? null,
        session_id: data.session_id,
        name: data.name ?? null,
        contact: data.contact,
        message: data.message,
      });
      if (error) return { ok: false as const, error: error.message };
      if (data.chat_id) {
        await supabaseAdmin
          .from("support_chats")
          .update({ live_requested: true, updated_at: new Date().toISOString() })
          .eq("id", data.chat_id);
      }
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      return { ok: false as const, error: msg };
    }
  });

export const rateSupportChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    chat_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
  }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("support_chats")
        .update({ satisfaction: data.rating, resolved: data.rating >= 4, updated_at: new Date().toISOString() })
        .eq("id", data.chat_id);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
