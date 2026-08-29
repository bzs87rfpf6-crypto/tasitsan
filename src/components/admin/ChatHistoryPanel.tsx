// Yönetici: canlı trafik altında AI sohbet geçmişi (filtreler + gerçek zamanlı).
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listChatSessions,
  type ChatSessionRow,
  type ChatRange,
  type ChatSourceFilter,
  type ChatOutcomeFilter,
} from "@/lib/chat-insight.functions";
import { ChatDetailDialog } from "./ChatDetailDialog";
import { MessagesSquare, Loader2, RefreshCw, Star, Ban } from "lucide-react";

const RANGES: { k: ChatRange; label: string }[] = [
  { k: "today", label: "Bugün" },
  { k: "7d", label: "Son 7 Gün" },
  { k: "30d", label: "Son 30 Gün" },
];
const SOURCES: { k: ChatSourceFilter; label: string }[] = [
  { k: "all", label: "Tüm Kaynaklar" },
  { k: "facebook", label: "Facebook" },
  { k: "google", label: "Google" },
  { k: "organic", label: "Organik" },
];
const OUTCOMES: { k: ChatOutcomeFilter; label: string }[] = [
  { k: "all", label: "Tümü" },
  { k: "ai", label: "AI Sohbeti Olanlar" },
  { k: "converted", label: "Siparişe Dönüşenler" },
  { k: "abandoned", label: "Satın Almadan Ayrılanlar" },
];

const fmt = (s: string) => (s ? new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function ChatHistoryPanel() {
  const list = useServerFn(listChatSessions);
  const [rows, setRows] = useState<ChatSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<ChatRange>("7d");
  const [source, setSource] = useState<ChatSourceFilter>("all");
  const [outcome, setOutcome] = useState<ChatOutcomeFilter>("all");
  const [openChat, setOpenChat] = useState<{ chatId?: string; sessionId?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await list({ data: { range, source, outcome } })); }
    catch (e) { console.warn("[chat-history]", e); }
    finally { setLoading(false); }
  }, [list, range, source, outcome]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: yeni/güncellenen sohbetlerde listeyi tazele
  useEffect(() => {
    const ch = supabase
      .channel("admin-chat-history")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_chats" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-4 text-gold" />
        <h3 className="text-sm font-semibold">Sohbet Geçmişi ({rows.length})</h3>
        <button onClick={() => void load()} className="ml-auto text-muted-foreground hover:text-gold" title="Yenile">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {RANGES.map((r) => (
          <Chip key={r.k} on={range === r.k} onClick={() => setRange(r.k)}>{r.label}</Chip>
        ))}
        <span className="w-px bg-border mx-1" />
        {SOURCES.map((s) => (
          <Chip key={s.k} on={source === s.k} onClick={() => setSource(s.k)}>{s.label}</Chip>
        ))}
        <span className="w-px bg-border mx-1" />
        {OUTCOMES.map((o) => (
          <Chip key={o.k} on={outcome === o.k} onClick={() => setOutcome(o.k)}>{o.label}</Chip>
        ))}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-3 animate-spin" /> Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">Bu filtrede sohbet yok.</p>
      ) : (
        <ul className="space-y-1.5 max-h-[26rem] overflow-y-auto">
          {rows.map((r) => (
            <li key={r.chat_id}>
              <button
                onClick={() => setOpenChat({ chatId: r.chat_id, sessionId: r.session_id })}
                className="w-full text-left rounded-lg border border-border hover:border-gold/60 transition p-2"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground tabular-nums shrink-0">{fmt(r.started_at)}</span>
                  <span className="px-1.5 rounded border border-border text-muted-foreground">{r.source}</span>
                  <span className="text-muted-foreground">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</span>
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {r.is_spam && <Ban className="size-3 text-rose-500" />}
                    {r.ai_rating ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="size-3 fill-current" />{r.ai_rating}</span>
                    ) : null}
                    {r.converted ? (
                      <span className="px-1.5 rounded-full border border-emerald-500/50 text-emerald-500">Siparişe döndü</span>
                    ) : r.engaged ? (
                      <span className="px-1.5 rounded-full border border-sky-500/50 text-sky-500">İlgilendi</span>
                    ) : (
                      <span className="px-1.5 rounded-full border border-border text-muted-foreground">Ayrıldı</span>
                    )}
                    <span className="font-mono text-muted-foreground">{r.message_count} msj</span>
                  </span>
                </div>
                <p className="truncate text-xs mt-1">{r.last_user_message ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  #{r.session_id.slice(0, 8)} · {r.device ?? "—"} · {r.browser}/{r.os}
                  {r.live_requested ? " · canlı destek istendi" : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ChatDetailDialog
        open={!!openChat}
        onOpenChange={(v) => { if (!v) setOpenChat(null); }}
        chatId={openChat?.chatId ?? null}
        sessionId={openChat?.sessionId ?? null}
      />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border transition ${on ? "border-gold text-gold" : "border-border text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
