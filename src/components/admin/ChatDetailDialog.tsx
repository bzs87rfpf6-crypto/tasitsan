// Yönetici: bir AI sohbet oturumunun tam detayı (mesajlar, davranışlar, analiz).
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getChatDetail, updateChatFlags, type ChatDetail } from "@/lib/chat-insight.functions";
import {
  Loader2, Copy, Download, FileText, Ban, Star, Bot, User, MapPin, Monitor,
  Globe, Clock, ArrowRight, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

const fmtTime = (s: string) => (s ? new Date(s).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");
const fmtDate = (s: string) => (s ? new Date(s).toLocaleString("tr-TR") : "—");

export function ChatDetailDialog({
  open,
  onOpenChange,
  chatId,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chatId?: string | null;
  sessionId?: string | null;
}) {
  const fetchDetail = useServerFn(getChatDetail);
  const setFlags = useServerFn(updateChatFlags);
  const [data, setData] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!open) { setData(null); setShowAll(false); return; }
    let alive = true;
    setLoading(true);
    fetchDetail({ data: { chat_id: chatId ?? undefined, session_id: sessionId ?? undefined } })
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => toast.error(String(e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, chatId, sessionId, fetchDetail]);

  const visibleMessages = useMemo(() => {
    if (!data) return [];
    return showAll || data.messages.length <= 60 ? data.messages : data.messages.slice(-60);
  }, [data, showAll]);

  const copyChat = async () => {
    if (!data) return;
    const txt = data.messages.map((m) => `${m.role === "user" ? "Müşteri" : "AI"}: ${m.content}`).join("\n\n");
    await navigator.clipboard.writeText(txt);
    toast.success("Sohbet kopyalandı");
  };

  const download = (kind: "json" | "txt") => {
    if (!data) return;
    const content = kind === "json"
      ? JSON.stringify(data, null, 2)
      : [
          `Taşıtsan Sohbet Raporu`,
          `Oturum: ${data.session_id}`,
          `Başlangıç: ${fmtDate(data.started_at)} · Bitiş: ${fmtDate(data.ended_at)}`,
          `Konum: ${[data.city, data.country].filter(Boolean).join(", ") || "—"} · Cihaz: ${data.device} · ${data.browser}/${data.os}`,
          `Kaynak: ${data.source}`,
          "",
          ...data.messages.map((m) => `${m.role === "user" ? "Müşteri" : "AI"}: ${m.content}`),
          "",
          `AI Analizi: ${data.analysis.summary}`,
          `Öneri: ${data.analysis.recommendation}`,
        ].join("\n");
    const blob = new Blob([content], { type: kind === "json" ? "application/json" : "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sohbet-${data.session_id.slice(0, 8)}.${kind === "json" ? "json" : "txt"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const flag = async (patch: { is_spam?: boolean; ai_rating?: number }) => {
    if (!data) return;
    await setFlags({ data: { chat_id: data.chat_id, ...patch } });
    setData({ ...data, ...patch } as ChatDetail);
    toast.success("Kaydedildi");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">💬 Sohbet Detayı</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Sohbet yükleniyor…
          </div>
        ) : !data ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Bu oturuma ait sohbet bulunamadı.</div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Meta */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
              <Meta icon={<Clock className="size-3" />} label="Başlangıç" value={fmtDate(data.started_at)} />
              <Meta icon={<Clock className="size-3" />} label="Bitiş" value={fmtDate(data.ended_at)} />
              <Meta icon={<Clock className="size-3" />} label="Süre" value={`${Math.round(data.duration_sec / 60)} dk (${data.duration_sec} sn)`} />
              <Meta icon={<Bot className="size-3" />} label="Mesaj" value={String(data.message_count)} />
              <Meta icon={<MapPin className="size-3" />} label="Konum" value={[data.city, data.country].filter(Boolean).join(", ") || "—"} />
              <Meta icon={<Globe className="size-3" />} label="Kaynak" value={data.source} />
              <Meta icon={<Monitor className="size-3" />} label="Cihaz" value={`${data.device ?? "—"} · ${data.browser} / ${data.os}`} />
              <Meta icon={<User className="size-3" />} label="Session" value={`#${data.session_id.slice(0, 12)}`} />
              <Meta icon={<User className="size-3" />} label="Kullanıcı" value={data.user_id ? `#${data.user_id.slice(0, 8)}` : "Misafir"} />
              <Meta icon={<Globe className="size-3" />} label="IP" value={data.ip_masked ?? "gizli"} />
            </div>

            {/* AI analizi */}
            <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-1">
              <div className="text-xs font-semibold text-gold">🤖 AI Analizi</div>
              <p className="text-xs leading-relaxed">{data.analysis.summary}</p>
              <p className="text-xs font-medium">💡 {data.analysis.recommendation}</p>
              {data.analysis.oems.length > 0 && (
                <p className="text-[11px] text-muted-foreground font-mono">OEM: {data.analysis.oems.join(", ")}</p>
              )}
            </div>

            {/* Mesajlar */}
            <div>
              <div className="text-xs font-semibold mb-2">Konuşma</div>
              {!showAll && data.messages.length > 60 && (
                <button onClick={() => setShowAll(true)} className="text-[11px] text-gold mb-2">
                  Tüm {data.messages.length} mesajı göster
                </button>
              )}
              <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                {visibleMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-primary/15 border border-primary/30" : "bg-muted border border-border"}`}>
                      <div className="text-[10px] opacity-60 mb-0.5">
                        {m.role === "user" ? "Müşteri" : "AI"} {m.ts ? `· ${fmtTime(m.ts)}` : ""}
                      </div>
                      {m.content}
                    </div>
                  </div>
                ))}
                {visibleMessages.length === 0 && <Empty>Mesaj kaydı yok.</Empty>}
              </div>
            </div>

            {/* Davranışlar */}
            <div className="grid md:grid-cols-2 gap-3">
              <Behavior title="Sohbet Öncesi" icon={<ArrowLeft className="size-3" />} rows={data.before} />
              <Behavior title="Sohbet Sonrası" icon={<ArrowRight className="size-3" />} rows={data.after} />
            </div>

            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Flag on={data.after_flags.viewed_part} label="Ürün görüntüledi" />
              <Flag on={data.after_flags.added_to_cart} label="Sepete ekledi" />
              <Flag on={data.after_flags.checkout} label="Satın almaya geçti" />
              <Flag on={data.after_flags.ordered} label="Sipariş oluşturdu" />
              <Flag on={data.after_flags.left} label="Siteyi terk etti" />
            </div>

            {/* Araçlar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Tool onClick={copyChat} icon={<Copy className="size-3" />}>Kopyala</Tool>
              <Tool onClick={() => download("json")} icon={<Download className="size-3" />}>JSON indir</Tool>
              <Tool onClick={() => download("txt")} icon={<FileText className="size-3" />}>Rapor indir</Tool>
              <Tool onClick={() => flag({ is_spam: !data.is_spam })} icon={<Ban className="size-3" />}>
                {data.is_spam ? "Spam işaretini kaldır" : "Spam işaretle"}
              </Tool>
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">AI performansı:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => flag({ ai_rating: n })} title={`${n} yıldız`}>
                    <Star className={`size-3.5 ${(data.ai_rating ?? 0) >= n ? "text-amber-500 fill-current" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card/50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="font-medium truncate" title={value}>{value}</div>
    </div>
  );
}

function Behavior({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: { created_at: string; event_type: string; path: string | null; label: string | null }[] }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-xs font-semibold flex items-center gap-1 mb-1">{icon}{title}</div>
      {rows.length === 0 ? (
        <Empty>Kayıt yok.</Empty>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto text-[11px] font-mono">
          {rows.map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-muted-foreground tabular-nums shrink-0">{fmtTime(r.created_at)}</span>
              <span className="shrink-0 text-gold">{r.event_type}</span>
              <span className="truncate text-muted-foreground">{r.label ?? r.path ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border ${on ? "border-emerald-500/50 text-emerald-500" : "border-border text-muted-foreground"}`}>
      {on ? "✅" : "—"} {label}
    </span>
  );
}

function Tool({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border hover:border-gold hover:text-gold transition">
      {icon}{children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground py-2">{children}</p>;
}
