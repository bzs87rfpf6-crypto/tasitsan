import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle, Headphones, CheckCircle2, Star } from "lucide-react";

type RecentChat = {
  id: string; session_id: string; user_id: string | null; message_count: number;
  last_user_message: string | null; live_requested: boolean; resolved: boolean;
  satisfaction: number | null; created_at: string; updated_at: string;
};
type LiveRow = { id: string; chat_id: string | null; name: string | null; contact: string; message: string; status: string; created_at: string };

type Stats = {
  chats_today: number;
  chats_total: number;
  resolved_today: number;
  live_requests_today: number;
  live_requests_open: number;
  avg_satisfaction: number | null;
  recent_chats: RecentChat[];
  live_requests_recent: LiveRow[];
};

export function AiSupportPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.rpc("admin_support_stats");
    if (error) setErr(error.message);
    else setStats(data as unknown as Stats);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Yükleniyor…</div>;
  if (err) return <div className="text-sm text-destructive">{err}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card icon={<MessageCircle className="size-4" />} label="Bugün Sohbet" value={stats.chats_today} />
        <Card icon={<MessageCircle className="size-4" />} label="Toplam Sohbet" value={stats.chats_total} />
        <Card icon={<CheckCircle2 className="size-4" />} label="Bugün Çözülen" value={stats.resolved_today} />
        <Card icon={<Headphones className="size-4" />} label="Canlı Talep (bugün)" value={stats.live_requests_today} />
        <Card icon={<Star className="size-4" />} label="Ort. Memnuniyet" value={stats.avg_satisfaction ?? "—"} />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-gold">Bekleyen Canlı Destek ({stats.live_requests_open})</h3>
        <div className="space-y-2">
          {stats.live_requests_recent.length === 0 && <div className="text-xs text-muted-foreground">Kayıt yok.</div>}
          {stats.live_requests_recent.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString("tr-TR")}</span>
                <span className={`px-1.5 py-0.5 rounded ${r.status === "new" ? "bg-gold/20 text-gold" : "bg-muted"}`}>{r.status}</span>
              </div>
              <div><b>{r.name || "İsimsiz"}</b> · <span className="font-mono text-xs">{r.contact}</span></div>
              <div className="text-xs whitespace-pre-wrap">{r.message}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-gold">Son Sohbetler</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-1.5 pr-2">Tarih</th>
                <th className="pr-2">Session</th>
                <th className="pr-2">Mesaj</th>
                <th className="pr-2">Son Soru</th>
                <th className="pr-2">Canlı</th>
                <th className="pr-2">Puan</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_chats.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(c.updated_at).toLocaleString("tr-TR")}</td>
                  <td className="pr-2 font-mono">{c.session_id.slice(0, 8)}</td>
                  <td className="pr-2">{c.message_count}</td>
                  <td className="pr-2 max-w-[280px] truncate">{c.last_user_message || "—"}</td>
                  <td className="pr-2">{c.live_requested ? "🎧" : ""}</td>
                  <td className="pr-2">{c.satisfaction ? "★".repeat(c.satisfaction) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-display text-gold mt-1">{value}</div>
    </div>
  );
}
