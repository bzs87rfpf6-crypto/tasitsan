// Yönetici ana ekranı: canlı mesaj kutusu (realtime + hızlı cevap + WhatsApp).
// Mevcut /admin/live-support sayfasını değiştirmez; aynı server fonksiyonlarını kullanır.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, ExternalLink, ArrowLeft, RefreshCw, Check } from "lucide-react";
import {
  adminListConversations, adminGetConversation, adminSendMessage, adminMarkSeen,
} from "@/lib/live-chat/live-chat.functions";
import { playNotificationSound, isSoundEnabled, unlockNotificationAudio } from "@/lib/notification-sounds";

type Conv = {
  id: string;
  status: string;
  unread_admin: number | null;
  last_message_at: string | null;
  visitor_name?: string | null;
  visitor_city?: string | null;
  profile?: { display_name?: string | null; whatsapp?: string | null } | null;
  [k: string]: unknown;
};
type Detail = Awaited<ReturnType<typeof adminGetConversation>>;
type Msg = Detail["messages"][number];

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}sn`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}sa`;
  return `${Math.floor(h / 24)}g`;
}

function convName(c: Conv) {
  return (
    (c.profile?.display_name as string | undefined) ||
    (c["visitor_name"] as string | undefined) ||
    (c["guest_name"] as string | undefined) ||
    `Ziyaretçi #${c.id.slice(0, 6)}`
  );
}

export function DashboardLiveInbox() {
  const list = useServerFn(adminListConversations);
  const getConv = useServerFn(adminGetConversation);
  const sendFn = useServerFn(adminSendMessage);
  const markSeen = useServerFn(adminMarkSeen);

  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refresh = useCallback(async () => {
    try {
      const rows = await list({ data: { status: "all" } });
      setConvs((rows as unknown as Conv[]).slice(0, 30));
    } catch (e) { console.warn("[dash-inbox]", e); }
    finally { setLoading(false); }
  }, [list]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: yeni ziyaretçi mesajı → liste tazele + bildirim + açık sohbete ekle
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { void Notification.requestPermission(); } catch { /* noop */ }
    }
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });

    const ch = supabase.channel("admin-dashboard-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat_messages" }, (p) => {
        const m = p.new as Msg;
        if (m.conversation_id === selectedRef.current) {
          setDetail((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
          if (m.sender_type === "visitor") void markSeen({ data: { conversation_id: m.conversation_id } }).catch(() => {});
        }
        if (m.sender_type === "visitor" && m.conversation_id !== selectedRef.current) {
          if (isSoundEnabled()) playNotificationSound("new_inquiry");
          toast.message("💬 Yeni müşteri mesajı", { description: (m.message || "[dosya]").slice(0, 120) });
        }
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_conversations" }, () => void refresh())
      .subscribe();

    const iv = window.setInterval(() => void refresh(), 60000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.clearInterval(iv);
      window.clearInterval(iv);
      void supabase.removeChannel(ch);
    };
  }, [refresh, markSeen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail?.messages.length]);

  const totalUnread = useMemo(() => convs.reduce((a, c) => a + (c.unread_admin ?? 0), 0), [convs]);
  const openList = useMemo(
    () => convs.filter((c) => c.status !== "closed" || (c.unread_admin ?? 0) > 0).slice(0, 8),
    [convs],
  );

  const open = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    try {
      const d = await getConv({ data: { id } });
      setDetail(d);
      await markSeen({ data: { conversation_id: id } });
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sohbet yüklenemedi");
      setSelectedId(null);
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendFn({ data: { conversation_id: selectedId, message: text } });
      const d = await getConv({ data: { id: selectedId } });
      setDetail(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gönderilemedi");
      setInput(text);
    } finally { setSending(false); }
  };

  const selectedConv = convs.find((c) => c.id === selectedId) ?? null;
  const waDigits = String(
    (detail?.profile as { whatsapp?: string | null } | null)?.whatsapp ??
    selectedConv?.profile?.whatsapp ??
    (selectedConv?.["visitor_phone"] as string | undefined) ??
    "",
  ).replace(/\D/g, "");

  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
      <header className="flex items-center gap-2">
        <MessageSquare className="size-4 text-gold" />
        <h3 className="text-sm font-semibold">💬 Yeni Mesaj</h3>
        {totalUnread > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold grid place-items-center">
            {totalUnread}
          </span>
        )}
        <button onClick={() => void refresh()} className="ml-auto text-muted-foreground hover:text-gold" title="Yenile">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <Link to="/admin/live-support" className="text-[11px] text-muted-foreground hover:text-gold inline-flex items-center gap-1">
          Tümü <ExternalLink className="size-3" />
        </Link>
      </header>

      {!selectedId ? (
        loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-3 animate-spin" /> Yükleniyor…
          </p>
        ) : openList.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground text-center">Bekleyen mesaj yok.</p>
        ) : (
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
            {openList.map((c) => {
              const unread = c.unread_admin ?? 0;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => void open(c.id)}
                    className={`w-full text-left py-2.5 px-1 flex items-center gap-2 hover:bg-accent/40 rounded-md ${unread > 0 ? "bg-gold/5" : ""}`}
                  >
                    <span className={`size-2 rounded-full shrink-0 ${unread > 0 ? "bg-red-500" : "bg-muted-foreground/40"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${unread > 0 ? "font-semibold" : ""}`}>{convName(c)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {(c["last_message_preview"] as string | undefined) || (unread > 0 ? "Yeni mesaj" : "Sohbet")}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{timeAgo(c.last_message_at)}</span>
                    {unread > 0 && (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center">
                        {unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="flex flex-col h-[26rem] sm:h-[24rem]">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <button onClick={() => { setSelectedId(null); setDetail(null); }} className="p-1 rounded hover:bg-accent" title="Geri">
              <ArrowLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold truncate">{selectedConv ? convName(selectedConv) : "Sohbet"}</span>
            <span className="ml-auto flex items-center gap-2">
              {waDigits.length >= 10 && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"
                >
                  WhatsApp’tan devam et
                </a>
              )}
              <Link to="/admin/live-support" className="text-[11px] text-muted-foreground hover:text-gold">Panelde aç</Link>
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-2">
            {!detail ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> Yükleniyor…</p>
            ) : detail.messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">Henüz mesaj yok.</p>
            ) : (
              detail.messages.map((m) => {
                const mine = m.sender_type === "admin";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] ${mine ? "bg-gold/15 border border-gold/30" : "bg-muted"}`}>
                      {m.message ? <p className="whitespace-pre-wrap break-words">{m.message}</p> : <p className="italic text-muted-foreground">[dosya]</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        {new Date(m.created_at as string).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        {mine && m.seen_at ? <Check className="size-3" /> : null}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={submit} className="flex items-end gap-2 pt-2 border-t border-border">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              rows={1}
              placeholder="Hızlı cevap yazın…"
              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[40px] max-h-24"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-10 px-3 rounded-lg bg-gold-gradient text-gold-foreground font-semibold disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
