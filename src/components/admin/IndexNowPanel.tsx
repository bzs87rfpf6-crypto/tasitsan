import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIndexNowStats, getIndexNowRecent, triggerIndexNowFlush } from "@/lib/indexnow.functions";
import { Button } from "@/components/ui/button";
import { Loader2, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Stats { pending: number; sent_today: number; failed: number; sent_total: number }
interface Row { id: string; url: string; status: string; attempts: number; last_error: string | null; enqueued_at: string; sent_at: string | null }

export function IndexNowPanel() {
  const statsFn   = useServerFn(getIndexNowStats);
  const recentFn  = useServerFn(getIndexNowRecent);
  const flushFn   = useServerFn(triggerIndexNowFlush);

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows]   = useState<Row[]>([]);
  const [busy, setBusy]   = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([statsFn(), recentFn({ data: { limit: 50 } })]);
      setStats(s); setRows(r as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const flush = async () => {
    setBusy(true);
    try {
      const r = await flushFn();
      toast.success(`Gönderildi (HTTP ${r.status})`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base text-gold">IndexNow Kuyruğu</h2>
          <p className="text-xs text-muted-foreground">Yeni ve güncellenen URL'leri Bing/Yandex/Naver'a anında bildir.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={flush} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="ml-1">Şimdi Gönder</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <Card label="Bekleyen"     value={stats?.pending ?? "—"} />
        <Card label="Bugün Gönderilen" value={stats?.sent_today ?? "—"} />
        <Card label="Hatalı"       value={stats?.failed ?? "—"} />
        <Card label="Toplam Gönderilen" value={stats?.sent_total ?? "—"} />
      </div>

      <div className="border-t border-border pt-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Son 50 URL</h3>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">Henüz kayıt yok.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 py-1.5">
              <span className="truncate flex-1">{r.url}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                r.status === "sent" ? "bg-emerald-500/10 text-emerald-500" :
                r.status === "failed" ? "bg-red-500/10 text-red-500" :
                "bg-amber-500/10 text-amber-500"
              }`}>{r.status}</span>
              <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                {new Date(r.enqueued_at).toLocaleString("tr-TR")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-xl font-display text-gold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
