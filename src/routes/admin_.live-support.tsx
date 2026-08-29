import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Search, MessageCircle, User as UserIcon, Paperclip, Image as ImageIcon, Smile,
  Check, CheckCheck, X, StickyNote, Lock, RotateCcw, ExternalLink, Loader2, Circle, Sparkles,
} from "lucide-react";
import {
  adminListConversations, adminGetConversation, adminSendMessage, adminMarkSeen, adminSetStatus, adminAddNote,
  adminSummarizeConversation,
} from "@/lib/live-chat/live-chat.functions";
import { uploadAttachment, sendTyping } from "@/lib/live-chat/visitor";
import { ChatAttachment } from "@/components/support/ChatAttachment";
import { playNotificationSound, isSoundEnabled, unlockNotificationAudio } from "@/lib/notification-sounds";
import { ChatPushPanel } from "@/components/admin/ChatPushPanel";
import { AdminInstallCard } from "@/components/admin/AdminInstallCard";
import { hasAdminAccess } from "@/lib/admin-access";


export const Route = createFileRoute("/admin_/live-support")({
  head: () => ({ meta: [{ title: "Canlı Destek — Yönetim" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: LiveChatAdminPage,
});

import type { Database } from "@/integrations/supabase/types";
type ConvRow = Database["public"]["Tables"]["live_chat_conversations"]["Row"] & { profile?: { display_name?: string | null; avatar_url?: string | null; email?: string | null; whatsapp?: string | null; city?: string | null; created_at?: string | null } | null };
type Detail = Awaited<ReturnType<typeof adminGetConversation>>;
type Msg = Detail["messages"][number];

const STATUS_LABEL: Record<string, string> = { waiting: "Bekliyor", active: "Aktif", closed: "Kapalı" };
const STATUS_COLOR: Record<string, string> = {
  waiting: "bg-gold/15 text-gold border-gold/40",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  closed: "bg-muted text-muted-foreground border-border",
};

const EMOJIS = ["👍","🙏","😊","😂","🎉","❤️","🔥","✅","⚠️","🙌","👋","🚗","🔧","📦","💰","📞"];

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24); return `${d}g`;
}

function LiveChatAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<"all" | "waiting" | "active" | "closed">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [noteText, setNoteText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);
  const originalTitle = useRef<string>("");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list = useServerFn(adminListConversations);
  const getConv = useServerFn(adminGetConversation);
  const sendFn = useServerFn(adminSendMessage);
  const markSeen = useServerFn(adminMarkSeen);
  const setStatus = useServerFn(adminSetStatus);
  const addNote = useServerFn(adminAddNote);
  const summarize = useServerFn(adminSummarizeConversation);
  const [aiSummary, setAiSummary] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      const redirect = typeof window === "undefined"
        ? "/admin/live-support"
        : `${window.location.pathname}${window.location.search}`;
      nav({ to: "/auth", search: { redirect } as never, replace: true });
    }
  }, [authLoading, user, nav]);
  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    let cancelled = false;
    setIsAdmin(null);
    hasAdminAccess(user.id)
      .then((allowed) => { if (!cancelled) setIsAdmin(allowed); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [user]);
  useEffect(() => {
    if (isAdmin === false) { toast.error("Yetkin yok."); nav({ to: "/" }); }
  }, [isAdmin, nav]);

  useEffect(() => { if (typeof document !== "undefined") originalTitle.current = document.title; }, []);

  const totalUnread = useMemo(() => convs.reduce((a, c) => a + (c.unread_admin ?? 0), 0), [convs]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = totalUnread > 0 ? `(${totalUnread}) Canlı Destek — Yönetim` : (originalTitle.current || "Canlı Destek — Yönetim");
  }, [totalUnread]);

  // Load list
  const refreshList = async () => {
    try {
      const rows = await list({ data: { status: filter, search: search || undefined } });
      setConvs(rows as unknown as ConvRow[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) void refreshList(); /* eslint-disable-next-line */ }, [isAdmin, filter]);
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => void refreshList(), 300);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [search]);

  // Realtime on list
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase.channel("admin-live-chat-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_conversations" }, () => void refreshList())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat_messages" }, (p) => {
        const m = p.new as Msg;
        if (m.sender_type === "visitor") {
          if (isSoundEnabled()) playNotificationSound("new_inquiry");
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            new Notification("Yeni canlı destek mesajı", { body: (m.message || "[dosya]").slice(0, 120) });
          }
        }
        if (m.conversation_id === selectedId) {
          setDetail((d) => d ? { ...d, messages: [...d.messages, m] } : d);
        }
        void refreshList();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    /* eslint-disable-next-line */
  }, [isAdmin, selectedId]);

  // Request browser notification permission once
  useEffect(() => {
    if (!isAdmin || typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [isAdmin]);

  // Load a conversation
  const openConv = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setVisitorTyping(false);
    if (typeof window !== "undefined") (window as unknown as { __lc_openConvId?: string }).__lc_openConvId = id;
    try {
      const d = await getConv({ data: { id } });
      setDetail(d);
      await markSeen({ data: { conversation_id: id } });
      void refreshList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yüklenemedi");
    }
  };

  // Push bildiriminden gelen derin bağlantı: /admin/live-support?c=<conversation_id>
  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("c");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) void openConv(id);
    /* eslint-disable-next-line */
  }, [isAdmin]);

  // Clear open-conv marker on unmount so global notifier resumes for that conv
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") (window as unknown as { __lc_openConvId?: string }).__lc_openConvId = undefined;
    };
  }, []);

  // Realtime for selected conv (typing + updates)
  useEffect(() => {
    if (!selectedId) return;
    const ch = supabase.channel(`lc:${selectedId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_conversations", filter: `id=eq.${selectedId}` },
        (p) => setDetail((d) => d ? { ...d, conv: p.new as Detail["conv"] } : d))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_messages", filter: `conversation_id=eq.${selectedId}` },
        (p) => setDetail((d) => d ? { ...d, messages: d.messages.map((m) => m.id === (p.new as Msg).id ? (p.new as Msg) : m) } : d))
      .on("broadcast", { event: "typing" }, (p) => {
        if ((p.payload as { who?: string }).who === "visitor") {
          setVisitorTyping(true);
          setTimeout(() => setVisitorTyping(false), 2500);
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [selectedId]);

  // Auto-scroll on messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail?.messages.length, visitorTyping]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendFn({ data: { conversation_id: selectedId, message: text } });
      // realtime will push it; also fetch to sync
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gönderilemedi");
      setInput(text);
    } finally { setSending(false); }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
    if (selectedId) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      sendTyping(selectedId, "admin");
      typingTimer.current = setTimeout(() => { /* stop */ }, 1500);
    }
  }

  async function onFile(file: File) {
    if (!selectedId) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Dosya 10MB'ı geçemez"); return; }
    const res = await uploadAttachment(selectedId, file);
    if ("error" in res) { toast.error(res.error); return; }
    await sendFn({ data: { conversation_id: selectedId, attachment_url: res.path, attachment_type: res.type, message: undefined } });
  }

  async function toggleClose() {
    if (!detail) return;
    const next = detail.conv.status === "closed" ? "active" : "closed";
    await setStatus({ data: { conversation_id: detail.conv.id, status: next } });
    toast.success(next === "closed" ? "Sohbet kapatıldı" : "Sohbet yeniden açıldı");
  }

  async function submitNote() {
    if (!detail || !noteText.trim()) return;
    await addNote({ data: { conversation_id: detail.conv.id, note: noteText.trim() } });
    setNoteText("");
    const d = await getConv({ data: { id: detail.conv.id } });
    setDetail(d);
    toast.success("Not eklendi");
  }

  /** AI yalnızca yönetici isterse çalışır; müşteriye hiçbir şey yazmaz. */
  async function runSummary() {
    if (!detail || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await summarize({ data: { id: detail.conv.id } });
      setAiSummary(r.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Özet alınamadı");
    } finally { setAiBusy(false); }
  }



  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-6 animate-spin text-gold" /></div>;
  }

  const conv = detail?.conv;
  const profile = detail?.profile;
  const deviceMeta = (conv?.device_meta ?? {}) as Record<string, any>;
  const userMeta = (conv?.user_meta ?? {}) as Record<string, any>;
  const displayName = profile?.display_name || userMeta.name || (conv?.user_id ? "Üye" : "Misafir");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur px-3 py-2 flex items-center gap-3">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-4" /> Yönetim
        </Link>
        <div className="text-sm font-semibold text-gold flex items-center gap-2">
          <MessageCircle className="size-4" /> Canlı Destek
        </div>
        {totalUnread > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold text-background font-bold">
            {totalUnread} yeni
          </span>
        )}
        <div className="ml-auto hidden sm:block w-[420px] max-w-[50vw]">
          <ChatPushPanel compact />
        </div>
      </header>

      <div className="sm:hidden px-3 py-2 border-b border-border/60 space-y-2">
        <ChatPushPanel compact />
        <AdminInstallCard />
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] h-[calc(100vh-45px)]">
        {/* LEFT: Conversations */}
        <aside className={`border-r border-border/60 bg-card/40 flex flex-col ${selectedId ? "hidden lg:flex" : "flex"}`}>
          <div className="p-2 space-y-2 border-b border-border/60">
            <div className="relative">
              <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara..."
                className="w-full h-8 rounded-md bg-background border border-border pl-7 pr-2 text-xs outline-none focus:border-gold/60" />
            </div>
            <div className="flex gap-1 text-[10px]">
              {(["all","waiting","active","closed"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 py-1 rounded ${filter === f ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted text-muted-foreground border border-transparent"}`}>
                  {f === "all" ? "Tümü" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></div>}
            {!loading && convs.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">Konuşma yok.</div>}
            {convs.map((c) => {
              const isSel = c.id === selectedId;
              const meta = (c.user_meta ?? {}) as Record<string, any>;
              const p = (c as any).profile as { display_name?: string | null } | null;
              const name = p?.display_name || meta.name || (c.user_id ? "Üye" : "Misafir");
              return (
                <button key={c.id} onClick={() => openConv(c.id)}
                  className={`w-full text-left px-3 py-2 border-b border-border/40 flex flex-col gap-0.5 ${isSel ? "bg-gold/10" : "hover:bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className={`text-[9px] px-1 rounded border ${c.user_id ? "border-emerald-500/40 text-emerald-400" : "border-gold/40 text-gold"}`}>
                        {c.user_id ? "ÜYE" : "MİSAFİR"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || "—"}</div>
                    {(c.unread_admin ?? 0) > 0 && (
                      <span className="text-[9px] px-1.5 rounded-full bg-gold text-background font-bold">{c.unread_admin}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <span className={`px-1 rounded border ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER: Chat */}
        <section className={`flex flex-col bg-background ${selectedId ? "flex" : "hidden lg:flex"}`}>
          {!conv && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <MessageCircle className="size-10 opacity-30" />
              Sohbet seçin
            </div>
          )}
          {conv && (
            <>
              <div className="border-b border-border/60 px-3 py-2 flex items-center justify-between gap-2 bg-card/40">
                <div className="flex items-center gap-2 min-w-0">
                  <button className="lg:hidden text-muted-foreground" onClick={() => setSelectedId(null)}><ArrowLeft className="size-4" /></button>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {displayName}
                      <span className={`text-[9px] px-1 rounded border ${STATUS_COLOR[conv.status]}`}>{STATUS_LABEL[conv.status]}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {visitorTyping ? <span className="text-emerald-400">yazıyor…</span> : `Son mesaj ${timeAgo(conv.last_message_at)} önce`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={toggleClose} title={conv.status === "closed" ? "Yeniden aç" : "Kapat"}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                    {conv.status === "closed" ? <RotateCcw className="size-4" /> : <Lock className="size-4" />}
                  </button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gradient-to-b from-background to-muted/20">
                {detail?.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
                {visitorTyping && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-muted-foreground italic">yazıyor…</div>
                  </div>
                )}
              </div>

              <form onSubmit={submit} className="border-t border-border/60 p-2 bg-card/40 flex items-end gap-1.5 relative">
                <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <input ref={imgRef} type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} className="p-2 text-muted-foreground hover:text-gold" title="Dosya"><Paperclip className="size-4" /></button>
                <button type="button" onClick={() => imgRef.current?.click()} className="p-2 text-muted-foreground hover:text-gold" title="Resim"><ImageIcon className="size-4" /></button>
                <button type="button" onClick={() => setShowEmojis((v) => !v)} className="p-2 text-muted-foreground hover:text-gold" title="Emoji"><Smile className="size-4" /></button>
                {showEmojis && (
                  <div className="absolute bottom-14 left-2 bg-card border border-border rounded-lg p-2 grid grid-cols-8 gap-1 shadow-xl z-10">
                    {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { setInput((i) => i + e); setShowEmojis(false); }} className="text-lg hover:bg-muted rounded p-1">{e}</button>)}
                  </div>
                )}
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                  placeholder={conv.status === "closed" ? "Sohbet kapalı — yeniden açmak için yaz…" : "Mesaj (Enter=Gönder, Shift+Enter=Yeni satır)"}
                  rows={1} className="flex-1 resize-none rounded-lg bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold/60 max-h-32" />
                <button type="submit" disabled={sending || !input.trim()} className="rounded-lg h-9 w-9 flex items-center justify-center bg-gold-gradient text-gold-foreground disabled:opacity-40">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>
            </>
          )}
        </section>

        {/* RIGHT: User info */}
        <aside className={`border-l border-border/60 bg-card/40 overflow-y-auto ${detail ? "hidden lg:block" : "hidden"}`}>
          {detail && (
            <div className="p-3 space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="size-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : <UserIcon className="size-6 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{displayName}</div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Circle className="size-1.5 fill-emerald-400 text-emerald-400" /> {conv?.user_id ? "Üye" : "Misafir"}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/40 pt-2">
                <InfoRow label="E-posta" value={profile?.email ?? userMeta.email ?? userMeta.contact ?? "—"} />
                <InfoRow label="Telefon" value={profile?.whatsapp ?? "—"} />
                <InfoRow label="Şehir" value={profile?.city ?? "—"} />
                <InfoRow label="Son sayfa" value={deviceMeta.page ?? "—"} />
                <InfoRow label="Tarayıcı" value={deviceMeta.browser ?? "—"} />
                <InfoRow label="İşletim sistemi" value={deviceMeta.os ?? "—"} />
                <InfoRow label="Cihaz" value={deviceMeta.device ?? "—"} />
                <InfoRow label="Dil" value={deviceMeta.lang ?? "—"} />
                <InfoRow label="Kayıt tarihi" value={profile?.created_at ? new Date(profile.created_at).toLocaleString("tr-TR") : "—"} />
                <InfoRow label="Son giriş" value={detail.lastSignIn ? new Date(detail.lastSignIn).toLocaleString("tr-TR") : "—"} />
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                {conv?.user_id && (
                  <Link to="/u/$id" params={{ id: conv.user_id }} className="text-[10px] px-2 py-1 rounded border border-border hover:border-gold/60 hover:text-gold inline-flex items-center gap-1">
                    <ExternalLink className="size-3" /> Profili aç
                  </Link>
                )}
                <button onClick={toggleClose} className="text-[10px] px-2 py-1 rounded border border-border hover:border-gold/60 hover:text-gold inline-flex items-center gap-1">
                  {conv?.status === "closed" ? <><RotateCcw className="size-3"/> Yeniden aç</> : <><Lock className="size-3"/> Sohbeti kapat</>}
                </button>
              </div>

              <div className="border-t border-border/40 pt-2">
                <button onClick={runSummary} disabled={aiBusy}
                  className="text-[10px] px-2 py-1 rounded border border-gold/50 text-gold hover:bg-gold/10 inline-flex items-center gap-1 disabled:opacity-50">
                  {aiBusy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} AI özet (yalnızca sana)
                </button>
                {aiSummary && (
                  <div className="mt-1.5 bg-background border border-gold/30 rounded p-2 text-[11px] whitespace-pre-wrap">{aiSummary}</div>
                )}
              </div>



              <div className="border-t border-border/40 pt-2">
                <div className="font-semibold mb-1.5 flex items-center gap-1"><StickyNote className="size-3.5" /> Notlar</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {detail.notes.map((n) => (
                    <div key={n.id} className="bg-background border border-border rounded p-1.5 text-[11px]">
                      <div className="whitespace-pre-wrap">{n.note}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString("tr-TR")}</div>
                    </div>
                  ))}
                  {detail.notes.length === 0 && <div className="text-muted-foreground text-[10px]">Not yok.</div>}
                </div>
                <div className="mt-2 flex gap-1">
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Not ekle…"
                    className="flex-1 h-7 rounded bg-background border border-border px-2 text-[11px] outline-none focus:border-gold/60" />
                  <button onClick={submitNote} disabled={!noteText.trim()} className="text-[10px] px-2 rounded bg-gold-gradient text-gold-foreground disabled:opacity-40">Ekle</button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const isAdmin = m.sender_type === "admin";
  const isSystem = m.sender_type === "system";
  if (isSystem) {
    return <div className="text-center text-[10px] text-muted-foreground italic">{m.message}</div>;
  }
  return (
    <div className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
        isAdmin ? "bg-gold-gradient text-gold-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
      }`}>
        <ChatAttachment value={m.attachment_url} type={m.attachment_type} maxSize={240} />
        {m.message && <div className="whitespace-pre-wrap">{m.message}</div>}
        <div className={`flex items-center gap-1 text-[9px] mt-0.5 ${isAdmin ? "text-black/60 justify-end" : "text-muted-foreground"}`}>
          <span>{new Date(m.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
          {isAdmin && (m.seen_at ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
        </div>
      </div>
    </div>
  );
}
