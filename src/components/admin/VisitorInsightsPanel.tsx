import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Eye, Clock, Bot, Flame, Gauge, Store, Fingerprint,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { getVisitorReport, type VisitorReport } from "@/lib/visitor-report.functions";
import { StatCard } from "@/components/admin/StatCard";
import { formatDuration } from "@/lib/fingerprint";

const GOLD = "#D4AF37";
const RANGES = [7, 30, 90] as const;

export function VisitorInsightsPanel() {
  const fetchReport = useServerFn(getVisitorReport);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<VisitorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReport({ data: { days } })
      .then((d) => { if (active) { setData(d); setError(null); setLoading(false); } })
      .catch((e: Error) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [fetchReport, days]);

  const eng = data?.engagement ?? { bounce: 0, viewed: 0, high: 0 };
  const engTotal = eng.bounce + eng.viewed + eng.high;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gold"><Fingerprint className="size-4" /></span>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold truncate">
            Ziyaretçi & İlgi Analizi (Parmak İzi Bazlı)
          </h2>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-semibold uppercase tracking-wider shrink-0">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`px-2 py-1 border-l border-border first:border-l-0 ${days === r ? "bg-gold-gradient text-gold-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{r} Gün</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-6">Rapor yükleniyor...</p>
      ) : error ? (
        <p className="text-center text-destructive text-sm py-6">{error}</p>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard icon={<Eye className="size-3.5" />} label="Toplam Ziyaret" value={data.totalVisits} />
            <StatCard icon={<Users className="size-3.5" />} label="Tekil Ziyaretçi" value={data.uniqueVisitors} accent="text-gold" />
            <StatCard icon={<Eye className="size-3.5" />} label="Bugün Ziyaret" value={data.totalVisitsToday} />
            <StatCard icon={<Users className="size-3.5" />} label="Bugünkü Benzersiz Ziyaretçi" value={data.uniqueVisitorsToday} accent="text-emerald-400" />
            <StatCard icon={<Gauge className="size-3.5" />} label="Ziyaretçi Başına Ziyaret" value={data.visitsPerVisitor} />
            <StatCard icon={<Users className="size-3.5" />} label="Son 24 Saat Tekil" value={data.uniqueVisitors24h} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="size-3.5" /> Ortalama Sayfada Kalma
              </div>
              <div className="mt-1 font-display text-xl text-gold">{formatDuration(data.avgTimeSec * 1000)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Medyan: {formatDuration(data.medianTimeSec * 1000)}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Bot className="size-3.5" /> Bot Trafiği (Ayrı)
              </div>
              <div className="mt-1 font-display text-xl text-amber-300">{data.botVisits.toLocaleString("tr-TR")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{data.botSessions} bot oturumu · tekil ziyaretçiye dahil değil</div>
            </div>
          </div>

          {/* İlgi seviyesi dağılımı */}
          <div className="bg-card rounded-xl border border-border p-3">
            <h3 className="text-xs font-semibold mb-2">İlgi Seviyesi Dağılımı</h3>
            {engTotal === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Henüz süre verisi toplanmadı.</p>
            ) : (
              <div className="space-y-2">
                <EngRow label="⚡ Hızlı Çıkış (0-10 sn)" value={eng.bounce} total={engTotal} color="bg-rose-400" />
                <EngRow label="👀 İncelendi (10-60 sn)" value={eng.viewed} total={engTotal} color="bg-amber-400" />
                <EngRow label="🔥 Yüksek İlgi (60 sn+)" value={eng.high} total={engTotal} color="bg-emerald-400" />
              </div>
            )}
          </div>

          {/* Günlük ziyaret / tekil ziyaretçi */}
          <div className="bg-card rounded-xl border border-border p-3">
            <h3 className="text-xs font-semibold mb-2">Toplam Ziyaret vs Tekil Ziyaretçi</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="visits" name="Toplam Ziyaret" fill="#5c5c5c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="uniques" name="Tekil Ziyaretçi" fill={GOLD} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ListCard
              title="En Çok İncelenen Ürünler"
              icon={<Eye className="size-4" />}
              rows={data.topViewedParts.map((p) => ({
                label: p.title,
                main: `${p.views} görüntüleme`,
                sub: `${p.visitors} tekil · ort. ${formatDuration(p.avg_sec * 1000)}`,
              }))}
            />
            <ListCard
              title="En Yüksek İlgi Gören Ürünler"
              icon={<Flame className="size-4" />}
              rows={data.topEngagedParts.map((p) => ({
                label: p.title,
                main: formatDuration(p.avg_sec * 1000),
                sub: `${p.high_interest} yüksek ilgi · ${p.views} ölçüm`,
              }))}
            />
            <ListCard
              title="En Çok Ziyaret Edilen Satıcı Profilleri"
              icon={<Store className="size-4" />}
              rows={data.topSellerProfiles.map((s) => ({
                label: s.name,
                main: `${s.visits} ziyaret`,
                sub: `${s.visitors} tekil ziyaretçi`,
              }))}
            />
            <ListCard
              title="Bot / Crawler Dağılımı"
              icon={<Bot className="size-4" />}
              rows={data.botsByName.map((b) => ({ label: b.name, main: `${b.hits} istek`, sub: "" }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function EngRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{value} · %{pct}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function ListCard({ title, icon, rows }: {
  title: string; icon: React.ReactNode; rows: { label: string; main: string; sub: string }[];
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gold">{icon}</span>
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Henüz veri yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="truncate flex-1 font-medium">{i + 1}. {r.label}</span>
              <span className="text-right shrink-0">
                <span className="text-gold font-mono tabular-nums block">{r.main}</span>
                {r.sub && <span className="text-[10px] text-muted-foreground">{r.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
