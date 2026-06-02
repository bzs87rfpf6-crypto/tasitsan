import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users as UsersIcon, Package, MapPin, Search, Phone, MessageCircle,
  Monitor, Smartphone, TrendingUp, Eye, Hash, Building2,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { getAnalyticsOverview } from "@/lib/analytics-admin.functions";
import { StatCard } from "@/components/admin/StatCard";

type Overview = Awaited<ReturnType<typeof getAnalyticsOverview>>;

const GOLD = "#D4AF37";
const PALETTE = ["#D4AF37", "#E8C870", "#8b6f1f", "#3b3b3b", "#5c5c5c", "#a07f29"];

export function AnalyticsDashboard() {
  const fetchOverview = useServerFn(getAnalyticsOverview);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchOverview()
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [fetchOverview]);

  if (loading) return <p className="text-center text-muted-foreground text-sm py-8">İstatistikler yükleniyor...</p>;
  if (error) return <p className="text-center text-destructive text-sm py-8">{error}</p>;
  if (!data) return null;

  const deviceData = data.devices.map((d, i) => ({ name: d.device, value: d.sessions, fill: PALETTE[i % PALETTE.length] }));

  return (
    <div className="space-y-4">
      {/* Ziyaretçi metrikleri */}
      <SectionTitle icon={<TrendingUp className="size-4" />} title="Ziyaretçi Özeti" />
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<UsersIcon className="size-3.5" />} label="Toplam Ziyaretçi (30g)" value={data.visitorsTotal} />
        <StatCard icon={<TrendingUp className="size-3.5" />} label="Bugün" value={data.visitorsDaily} accent="text-emerald-400" />
        <StatCard icon={<TrendingUp className="size-3.5" />} label="Bu Hafta" value={data.visitorsWeekly} />
        <StatCard icon={<TrendingUp className="size-3.5" />} label="Bu Ay" value={data.visitorsMonthly} />
        <StatCard icon={<MapPin className="size-3.5" />} label="Farklı Şehir" value={data.distinctCities} accent="text-gold" />
        <StatCard icon={<Eye className="size-3.5" />} label="Toplam Tıklama" value={data.whatsappClicks + data.callClicks} />
      </div>

      {/* Daily visitor trend */}
      <Card title="Son 30 Gün Ziyaretçi">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.dailySeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
            <Line type="monotone" dataKey="visitors" stroke={GOLD} strokeWidth={2} dot={false} name="Ziyaretçi" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Cities */}
        <Card title="Şehirlere Göre Dağılım">
          {data.cities.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.cities.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis type="category" dataKey="city" tick={{ fontSize: 10, fill: "#ccc" }} width={80} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
                <Bar dataKey="count" fill={GOLD} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Devices */}
        <Card title="Mobil / Masaüstü Oranı">
          {deviceData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} label={{ fontSize: 11, fill: "#ccc" }}>
                  {deviceData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Click counts */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<MessageCircle className="size-3.5" />} label="WhatsApp Tıklama" value={data.whatsappClicks} accent="text-emerald-400" />
        <StatCard icon={<Phone className="size-3.5" />} label="Bizi Ara Tıklama" value={data.callClicks} accent="text-gold" />
      </div>

      {/* Üyeler & İlanlar */}
      <SectionTitle icon={<UsersIcon className="size-4" />} title="Üye & İlan İstatistikleri" />
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<UsersIcon className="size-3.5" />} label="Toplam Üye" value={data.totalMembers} />
        <StatCard icon={<UsersIcon className="size-3.5" />} label="Bugün Yeni Üye" value={data.newMembersToday} accent="text-emerald-400" />
        <StatCard icon={<Package className="size-3.5" />} label="Toplam İlan" value={data.totalParts} />
        <StatCard icon={<Package className="size-3.5" />} label="Bugün Yeni İlan" value={data.newPartsToday} accent="text-emerald-400" />
      </div>

      <Card title="Son 30 Gün Üye / İlan Kayıtları">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.dailySeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="newMembers" stroke="#10b981" strokeWidth={2} dot={false} name="Yeni Üye" />
            <Line type="monotone" dataKey="newParts" stroke={GOLD} strokeWidth={2} dot={false} name="Yeni İlan" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Top lists */}
      <div className="grid sm:grid-cols-2 gap-3">
        <RankList title="En Çok Görüntülenen İlanlar" icon={<Eye className="size-4" />}
          items={data.topParts.map((p) => ({ label: p.title || p.part_id, value: p.views }))} />
        <RankList title="En Çok Aranan Parça İsimleri" icon={<Search className="size-4" />}
          items={data.topSearches.map((s) => ({ label: s.query, value: s.count }))} />
        <RankList title="En Çok Aranan OEM Kodları" icon={<Hash className="size-4" />}
          items={data.topOem.map((s) => ({ label: s.oem, value: s.count }))} />
        <RankList title="Satıcı Bazlı İlan Sayıları" icon={<Building2 className="size-4" />}
          items={data.topSellers.map((s) => ({ label: s.name, value: s.count }))} />
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-gold">{icon}</span>
      <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{title}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <h3 className="text-xs font-semibold mb-2 text-foreground/90">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground py-8 text-center">Henüz veri yok.</p>;
}

function RankList({ title, icon, items }: { title: string; icon: React.ReactNode; items: { label: string; value: number }[] }) {
  const max = items[0]?.value ?? 1;
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gold">{icon}</span>
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? <Empty /> : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex-1 font-medium">{i + 1}. {it.label}</span>
                <span className="text-gold font-mono tabular-nums">{it.value}</span>
              </div>
              <div className="h-1 mt-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gold-gradient" style={{ width: `${Math.max(6, (it.value / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
