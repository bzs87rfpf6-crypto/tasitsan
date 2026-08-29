import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Send, Loader2, MessageCircle, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminStartVisitorChat,
  adminGetConversation,
  adminSendMessage,
  adminMarkSeen,
} from "@/lib/live-chat/live-chat.functions";

export type VisitorChatContext = {
  session: string;
  path?: string | null;
  city?: string | null;
  device?: string | null;
  lastQuery?: string | null;
  lastOem?: string | null;
  lastPart?: string | null;
  lastStatus?: string | null;
  lastAt?: string | null;
  draft?: string | null;
};

type Msg = {
  id: string;
  sender_type: string;
  message: string | null;
  attachment_url: string | null;
  created_at: string;
};

function timeOf(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

export function VisitorChatDialog({
  ctx,
  onClose,
}: {
  ctx: VisitorChatContext;
  onClose: () => void;
}) {
  const start = useServerFn(adminStartVisitorChat);
  const getConv = useServerFn(adminGetConversation);
  const send = useServerFn(adminSendMessage);
  const markSeen = useServerFn(adminMarkSeen);

  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(ctx.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const convIdRef = useRef<string | null>(null);
  const startingRef = useRef<Promise<string> | null>(null);

  // Resolve (or create) the conversation for this visitor session. Never gated
  // on the visitor's chat widget: the conversation is created server-side from
  // the analytics session id alone.
  const ensureConv = useCallback(async (): Promise<string> => {
    if (convIdRef.current) return convIdRef.current;
    if (!startingRef.current) {
      startingRef.current = (async () => {
        const res = await start({
          data: {
            session_id: ctx.session,
            context: {
              path: ctx.path ?? null,
              city: ctx.city ?? null,
              device: ctx.device ?? null,
              last_query: ctx.lastQuery ?? null,
            },
          },
        });
        const id = res.conversation_id as string;
        convIdRef.current = id;
        setConvId(id);
        setError(null);
        return id;
      })().catch((e) => {
        startingRef.current = null;
        throw e;
      });
    }
    return startingRef.current;
  }, [ctx.session, ctx.path, ctx.city, ctx.device, ctx.lastQuery, start]);

  useEffect(() => {
    let alive = true;
    convIdRef.current = null;
    startingRef.current = null;
    setConvId(null);
    setMsgs([]);
    ensureConv().catch((e) => {
      console.error("[live-chat][admin] start chat failed", ctx.session, e);
      if (alive) setError("Sohbet açılamadı, tekrar deneniyor…");
    });
    return () => {
      alive = false;
    };
  }, [ctx.session, ensureConv]);

  const refresh = useCallback(async () => {
    const id = convIdRef.current;
    if (!id) return;
    try {
      const res = await getConv({ data: { id } });
      setMsgs((res.messages ?? []) as Msg[]);
      const p = res.profile as { display_name?: string | null } | null;
      setProfileName(p?.display_name ?? null);
    } catch (e) {
      console.warn("[live-chat][admin] refresh failed", id, e);
    }
  }, [getConv]);

  // Realtime + polling fallback.
  useEffect(() => {
    if (!convId) return;
    void refresh();
    void markSeen({ data: { conversation_id: convId } }).catch(() => undefined);

    const channel = supabase
      .channel(`admin-live-chat-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `conversation_id=eq.${convId}` },
        () => void refresh(),
      )
      .subscribe();

    const iv = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [convId, refresh, markSeen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const id = await ensureConv();
      await send({ data: { conversation_id: id, message: text } });
      setInput("");
      setError(null);
      await refresh();
    } catch (err) {
      console.error("[live-chat][admin] send failed", err);
      toast.error((err as Error).message || "Mesaj gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex sm:items-center sm:justify-end" onClick={onClose}>
      <div
        className="bg-background border border-gold/30 w-full sm:w-[440px] h-[100dvh] sm:h-[86vh] sm:mr-4 sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-black to-neutral-900 border-b border-gold/30">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="size-4 text-gold shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                {profileName ? `${profileName}` : "Anonim ziyaretçi"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Oturum #{ctx.session.slice(0, 10)}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border bg-card/60 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Aktif Ziyaretçi
          </div>
          <Info label="Arama" value={ctx.lastQuery} />
          <Info label="OEM" value={ctx.lastOem} />
          <Info label="Ürün" value={ctx.lastPart} />
          <Info label="Durum" value={ctx.lastStatus} />
          <Info label="Sayfa" value={ctx.path} />
          <Info label="Şehir" value={ctx.city} />
          <Info label="Son aktif" value={ctx.lastAt ? timeOf(ctx.lastAt) : null} />
          <div className="flex gap-2 text-[11px]">
            <span className="text-muted-foreground">Kimlik:</span>
            <span className="font-medium inline-flex items-center gap-1">
              <UserIcon className="size-3" /> {profileName ? "Üye" : "Anonim ziyaretçi"}
            </span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {error && <div className="text-xs text-amber-400">{error}</div>}
          {msgs.map((m) => {
            const mine = m.sender_type === "admin";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    mine
                      ? "bg-gold text-black rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm border border-border"
                  }`}
                >
                  {m.message}
                  <div className={`text-[9px] mt-1 ${mine ? "text-black/60" : "text-muted-foreground"}`}>
                    {timeOf(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
          {msgs.length === 0 && (
            <div className="text-xs text-muted-foreground">Henüz mesaj yok — ilk mesajı siz yazın.</div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="p-2 border-t border-border flex items-center gap-2 bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mesaj yaz…"
            className="flex-1 bg-secondary border border-border rounded-full px-3 py-2 text-base sm:text-xs outline-none focus:border-gold/60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || !ctx.session}
            className="rounded-full w-9 h-9 grid place-items-center bg-gold text-black disabled:opacity-40 shrink-0"
            aria-label="Gönder"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
