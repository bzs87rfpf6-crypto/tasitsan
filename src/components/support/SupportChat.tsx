import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, Loader2, Headphones, Paperclip, Image as ImageIcon, Check, CheckCheck } from "lucide-react";
import {
  ensureConversation,
  loadMessages,
  sendMessage,
  subscribeConversation,
  markVisitorSeen,
  uploadAttachment,
  sendTyping,
  getStoredConvId,
  setStoredConvId,
  pingVisitor,
  setGuestMode,
  type LiveMsg,
} from "@/lib/live-chat/visitor";
import { ChatAttachment } from "@/components/support/ChatAttachment";
import { trackEvent, getSessionId } from "@/lib/analytics";
import { toast } from "sonner";
import { playNotificationSound, isSoundEnabled } from "@/lib/notification-sounds";
import { supabase } from "@/integrations/supabase/client";
import { getPublicSiteSettings } from "@/lib/public-site-settings";

const LS_OPENED = "ts_support_opened_v1";
const LS_WELCOMED = "ts_support_welcomed_v1";

/**
 * Canlı destek widget'ı — %100 insan desteği.
 * AI yok; müşteri e-posta/telefon/üyelik vermeden, isim bile zorunlu olmadan
 * yazabilir. Sohbet kimliği otomatik ziyaretçi anahtarıyla üretilir ve
 * localStorage'da saklanarak konuşma sürdürülür. Her müşteri mesajı DB
 * tetikleyicisi üzerinden yöneticiye anlık push bildirimi gönderir.
 */
export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [welcomeBubble, setWelcomeBubble] = useState(false);
  const [supportPhone, setSupportPhone] = useState("");

  const [convId, setConvId] = useState<string | null>(null);
  const [liveMsgs, setLiveMsgs] = useState<LiveMsg[]>([]);
  const [adminTyping, setAdminTyping] = useState(false);
  const [unreadLive, setUnreadLive] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);

  // WhatsApp alternatifi (canlı sohbetin yerine geçmez).
  useEffect(() => {
    getPublicSiteSettings()
      .then((data) => setSupportPhone((data.contact_phone as string) ?? ""))
      .catch(() => setSupportPhone(""));
  }, []);

  useEffect(() => {
    const cid = getStoredConvId();
    if (cid) setConvId(cid);
  }, []);

  // Ziyaretçi heartbeat: admin'in başlattığı sohbeti yakalar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await pingVisitor(getSessionId());
        if (!alive || !res.conversation_id) return;
        const isNew = res.conversation_id !== getStoredConvId();
        if (isNew) {
          setGuestMode(true);
          setStoredConvId(res.conversation_id);
          setConvId(res.conversation_id);
        }
        if ((isNew && res.initiated_by === "admin") || res.unread > 0) {
          setUnreadLive(res.unread || 1);
          setOpen((o) => {
            if (!o) {
              setWelcomeBubble(false);
              if (isSoundEnabled()) playNotificationSound("new_inquiry");
              toast.message("🔔 Yeni mesaj — Taşıtsan destek ekibi size yazdı");
            }
            return true;
          });
        }
      } catch (e) {
        console.warn("[live-chat][visitor] ping failed", e);
      }
    };
    void tick();
    const iv = window.setInterval(() => void tick(), 6000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  // 8s karşılama balonu
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { if (localStorage.getItem(LS_WELCOMED) === "1") return; } catch { /* noop */ }
    const t = setTimeout(() => {
      setWelcomeBubble(true);
      try { localStorage.setItem(LS_WELCOMED, "1"); } catch { /* noop */ }
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [liveMsgs, open, loading, adminTyping]);

  useEffect(() => {
    if (!convId) return;
    let alive = true;
    void loadMessages(convId).then((rows) => { if (alive) setLiveMsgs(rows); });
    if (open) void markVisitorSeen(convId);
    const unsub = subscribeConversation(convId, {
      onMessage: (m) => {
        setLiveMsgs((prev) => {
          const exists = prev.some((x) => x.id === m.id);
          return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
        });
        if (m.sender_type === "admin") {
          if (isSoundEnabled()) playNotificationSound("new_inquiry");
          if (open) void markVisitorSeen(convId);
          else {
            setUnreadLive((n) => n + 1);
            setWelcomeBubble(false);
            setOpen(true);
          }
        }
      },
      onTyping: (who) => {
        if (who === "admin") {
          setAdminTyping(true);
          setTimeout(() => setAdminTyping(false), 2500);
        }
      },
    });
    return () => { alive = false; unsub(); };
  }, [convId, open]);

  function openChat() {
    setOpen(true);
    setWelcomeBubble(false);
    setUnreadLive(0);
    try { if (!localStorage.getItem(LS_OPENED)) localStorage.setItem(LS_OPENED, "1"); } catch { /* noop */ }
    void trackEvent("chat_open");
    if (convId) void markVisitorSeen(convId);
  }

  /** Sohbeti gerektiğinde otomatik açar — hiçbir bilgi istemeden. */
  async function ensureConv(firstMessage?: string): Promise<string | null> {
    if (convId) return convId;
    const res = await ensureConversation({ subject: "Canlı destek", message: firstMessage });
    if ("error" in res) { toast.error(res.error); return null; }
    setConvId(res.id);
    void trackEvent("chat_live_request", { auto: true });
    return res.id;
  }

  async function submitLive(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    try {
      if (!convId) {
        // İlk mesaj sohbet oluşturulurken birlikte gönderilir.
        const id = await ensureConv(text);
        if (!id) { setInput(text); return; }
        setLiveMsgs(await loadMessages(id));
      } else {
        const { error } = await sendMessage(convId, text);
        if (error) { toast.error(error.message); setInput(text); return; }
        sendTyping(convId, "visitor");
      }
    } catch (err) {
      toast.error("Gönderilemedi"); console.error(err);
    } finally { setLoading(false); }
  }

  function onLiveInput(v: string) {
    setInput(v);
    if (convId) sendTyping(convId, "visitor");
  }

  async function onFile(f: File) {
    if (f.size > 10 * 1024 * 1024) { toast.error("Dosya 10MB'ı geçemez"); return; }
    setLoading(true);
    try {
      const id = await ensureConv();
      if (!id) return;
      const res = await uploadAttachment(id, f);
      if ("error" in res) toast.error(res.error);
      else await sendMessage(id, "", { path: res.path, type: res.type });
    } finally { setLoading(false); }
  }

  const waDigits = supportPhone.replace(/\D/g, "");

  return (
    <>
      {!open && (
        <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+72px)] sm:bottom-4 z-[55] flex flex-col items-end gap-2">
          {welcomeBubble && (
            <button onClick={openChat}
              className="max-w-[260px] rounded-2xl bg-card border border-gold/40 shadow-gold px-3 py-2.5 text-left text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-1.5 font-semibold text-gold mb-0.5">
                <Headphones className="size-3.5" /> Canlı Destek
              </div>
              👋 Merhaba! Sorunuzu yazın, ekibimiz size doğrudan yanıt versin.
            </button>
          )}
          {unreadLive > 0 && (
            <button onClick={openChat}
              className="rounded-full bg-black text-gold border border-gold/60 px-3 py-1.5 text-[11px] font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2">
              🔔 {unreadLive} yeni mesaj
            </button>
          )}
          <button onClick={openChat} aria-label="Canlı desteği aç"
            className="relative rounded-full w-14 h-14 flex items-center justify-center bg-gradient-to-br from-gold to-amber-500 text-black shadow-2xl shadow-gold/40 border border-gold/60 hover:scale-105 transition">
            <MessageCircle className="size-6" />
            {unreadLive > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center border border-black">
                {unreadLive}
              </span>
            )}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-4 sm:right-4 z-[60] w-full sm:w-[380px] h-[85vh] sm:h-[600px] bg-background border border-gold/30 sm:rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-black to-neutral-900 border-b border-gold/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gold-gradient flex items-center justify-center text-black font-bold">
                <Headphones className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gold">Canlı Destek</div>
                <div className="text-[10px] text-muted-foreground">
                  {adminTyping ? "yazıyor…" : "Gerçek bir yetkili yanıtlar"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {waDigits.length >= 10 && (
                <a
                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent("Merhaba, Taşıtsan destek ekibiyle görüşmek istiyorum.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void trackEvent("click_whatsapp", { from: "support_chat" })}
                  title="WhatsApp’tan devam et"
                  className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"
                >
                  WhatsApp’tan devam et
                </a>
              )}
              <button onClick={() => { setOpen(false); void trackEvent("chat_closed"); }} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {liveMsgs.length === 0 && (
              <div className="bg-card/60 rounded-2xl p-3 text-xs text-muted-foreground text-center space-y-1">
                <div className="text-gold font-semibold text-sm">🎧 Doğrudan yetkiliye yazıyorsunuz</div>
                <div>Üyelik, e-posta veya telefon gerekmez. Mesajınızı yazın — en kısa sürede yanıtlayalım.</div>
              </div>
            )}
            {liveMsgs.map((m) => {
              const mine = m.sender_type === "visitor";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-gold-gradient text-gold-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                  }`}>
                    <ChatAttachment value={m.attachment_url} type={m.attachment_type} maxSize={220} />
                    {m.message && <div className="whitespace-pre-wrap">{m.message}</div>}
                    <div className={`flex items-center gap-1 text-[9px] mt-0.5 ${mine ? "text-black/60 justify-end" : "text-muted-foreground"}`}>
                      <span>{new Date(m.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                      {mine && (m.seen_at ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                    </div>
                  </div>
                </div>
              );
            })}
            {adminTyping && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-muted-foreground italic">yazıyor…</div>
              </div>
            )}
          </div>

          <form onSubmit={submitLive} className="border-t border-border p-2 flex gap-1.5 items-center bg-card/40">
            <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <input ref={imgRef} type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="p-1.5 text-muted-foreground hover:text-gold"><Paperclip className="size-4" /></button>
            <button type="button" onClick={() => imgRef.current?.click()} className="p-1.5 text-muted-foreground hover:text-gold"><ImageIcon className="size-4" /></button>
            <input value={input}
              onChange={(e) => onLiveInput(e.target.value)}
              placeholder="Mesajınızı yazın…"
              maxLength={2000}
              className="flex-1 rounded-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold/60" />
            <button type="submit" disabled={loading || !input.trim()}
              className="rounded-full w-10 h-10 flex items-center justify-center bg-gold-gradient text-gold-foreground disabled:opacity-50">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/50 text-center">
            Mesajlarınız doğrudan Taşıtsan yetkilisine iletilir.
          </div>
        </div>
      )}
    </>
  );
}
