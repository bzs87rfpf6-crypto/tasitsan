import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye, Search, AlertTriangle, MessageCircle, Mail, Heart, Globe,
  TrendingUp, Sparkles, Activity, RefreshCw, Users, ShoppingCart, Bot,
} from "lucide-react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Link } from "@tanstack/react-router";
import {
  getConversionAnalytics,
  type ConversionAnalytics,
  type ConvPart,
} from "@/lib/conversion-analytics.functions";
import { buildPartParam } from "@/lib/part-slug";
import { getTodayMetrics, type TodayMetrics } from "@/lib/today-metrics.functions";


const COLORS = ["#d4af37", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899", "#84cc16"];
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("tr-TR");

type Range = "d1" | "d7" | "d30";
const RANGE_LABEL: Record<Range, string> = { d1: "Son 24 Saat", d7: "Son 7 Gün", d30: "Son 30 Gün" };

export function ConversionAnalyticsPanel() {
  const fetcher = useServerFn(getConversionAnalytics);
  const todayFetcher = useServerFn(getTodayMetrics);
  const [data, setData] = useState<ConversionAnalytics | null>(null);
  const [today, setToday] = useState<TodayMetrics | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("d7");

  // Ağır dönüşüm sorgusu. Hata (ör. statement timeout) durumunda MEVCUT veri
  // korunur — asla 0 / eksik sonuçla ezilmez.
  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetcher();
      if (res) setData(res);
    } catch (e) {
      setErr(
        (e instanceof Error ? e.message : "Veri alınamadı") +
          " — son başarılı veriler gösteriliyor."
      );
    } finally {
      setBusy(false);
    }
  };

  // Hafif "bugün" kartları — ayrı ve hızlı RPC (admin_today_metrics).
  const loadToday = async () => {
    try {
      const res = await todayFetcher();
      if (res) setToday(res);
    } catch {
      /* eski değerler korunur */
    }
  };

  useEffect(() => { void load(); void loadToday(); }, []);
  useEffect(() => {
    const id = setInterval(load, 120_000);
    const idT = setInterval(loadToday, 30_000);
    return () => { clearInterval(id); clearInterval(idT); };
  }, []);


  const viewedRows = useMemo<ConvPart[]>(
    () => (data?.top_viewed?.[range] ?? []) as ConvPart[],
    [data, range]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-gold flex items-center gap-2">
            <Activity className="size-5" /> Dönüşüm Analitik Merkezi
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ziyaretçilerin satın alma yolculuğu, ilgi alanları ve fırsat skorları.
            {data?.snapshot_at && <> · Güncellendi: {new Date(data.snapshot_at).toLocaleTimeString("tr-TR")}</>}
          </p>
        </div>
        <button onClick={load} disabled={busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-gold disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Yenile
        </button>
      </div>

      {err && <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg p-3">{err}</div>}
      {busy && !data && <div className="text-sm text-muted-foreground">Yükleniyor…</div>}

      {/* BUGÜN KARTLARI — hafif ve ayrı RPC (admin_today_metrics), gün boyunca geri düşmez */}
      {today && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<Users className="size-3.5" />} label="Bugün Toplam Gerçek Ziyaretçi" value={today.unique_visitors_today} accent="text-emerald-400" />
            <KpiCard icon={<Activity className="size-3.5" />} label="Şu An Aktif (5 dk)" value={today.active_5m} accent="text-emerald-300" />
            <KpiCard icon={<Globe className="size-3.5" />} label="Bugün Toplam Oturum" value={today.sessions_today} />
            <KpiCard icon={<Search className="size-3.5" />} label="Bugün Toplam Arama" value={today.searches_today} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard icon={<Eye className="size-3.5" />} label="Bugün Ürün Görüntüleme" value={today.part_views_today} />
            <KpiCard icon={<MessageCircle className="size-3.5" />} label="Bugün WhatsApp / Telefon" value={today.whatsapp_today + today.calls_today} accent="text-sky-400" />
            <KpiCard icon={<ShoppingCart className="size-3.5" />} label="Bugün Dönüşüm (iletişim kuran)" value={today.conversions_today} accent="text-gold" />
            <KpiCard icon={<Mail className="size-3.5" />} label="Bugün Teklif Talebi" value={today.inquiries_today} />
            <KpiCard icon={<Bot className="size-3.5" />} label="Filtrelenen Bot İsabeti" value={today.bots_filtered?.hits ?? 0} accent="text-muted-foreground" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            «Bugün Toplam Gerçek Ziyaretçi» = Europe/Istanbul günü içinde görülen tekil ziyaretçi (parmak izi → ziyaretçi kimliği → oturum), bot ve admin hariç; gün boyunca yalnızca artar.
            «Şu An Aktif» son 5 dakikayı gösterir ve doğal olarak düşebilir.
          </p>
        </div>
      )}

      {data && (
        <>


          {/* CONVERSION FUNNEL */}
          <Card title="Dönüşüm Hunisi (Son 7 Gün)" icon={<TrendingUp className="size-4" />}>
            <FunnelView f={data.funnel} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* TRAFFIC SOURCES */}
            <Card title="Trafik Kaynakları (30 gün)" icon={<Globe className="size-4" />}>
              {data.sources.length === 0 ? (
                <Empty>Henüz veri yok.</Empty>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.sources} dataKey="sessions" nameKey="source" outerRadius={80} label>
                        {data.sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* TOP VIEWED with range tabs */}
            <Card title="En Çok Görüntülenen Ürünler" icon={<Eye className="size-4" />}
              right={
                <div className="flex gap-1">
                  {(["d1", "d7", "d30"] as Range[]).map((r) => (
                    <button key={r} onClick={() => setRange(r)}
                      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                        range === r ? "bg-gold text-gold-foreground" : "border border-border text-muted-foreground"
                      }`}>
                      {RANGE_LABEL[r]}
                    </button>
                  ))}
                </div>
              }>
              <PartList rows={viewedRows} valueKey="views" valueLabel="görüntüleme" />
            </Card>
          </div>

          {/* OEM SEARCHES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="En Çok Aranan OEM Kodları (30 gün)" icon={<Search className="size-4" />}>
              <OemList rows={data.top_oem.map((o) => ({ oem: o.oem, count: o.search_count ?? 0, last: o.last_at }))} accent="gold" />
            </Card>
            <Card title="Sonuç Bulunamayan OEM Kodları" icon={<AlertTriangle className="size-4" />}
              hint="Stok ekleme önerisi · bu OEM'lere ürün eklerseniz hazır talep var">
              <OemList rows={data.no_result_oem.map((o) => ({ oem: o.oem, count: o.attempts ?? 0, last: o.last_at }))} accent="red" />
            </Card>
          </div>

          {/* WHATSAPP / INQUIRIES / FAVORITES */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="En Çok WhatsApp Tıklanan" icon={<MessageCircle className="size-4" />}>
              <PartList rows={data.whatsapp_parts} valueKey="clicks" valueLabel="tıklama" />
            </Card>
            <Card title="En Çok Teklif Alan" icon={<Mail className="size-4" />}>
              <PartList rows={data.inquiry_parts} valueKey="inquiries" valueLabel="teklif" />
            </Card>
            <Card title="En Çok Favorilenen" icon={<Heart className="size-4" />}>
              <PartList rows={data.favorite_parts} valueKey="favorites" valueLabel="favori" />
            </Card>
          </div>

          {/* SALES POTENTIAL */}
          <Card title="En Çok Satış Potansiyeli Olan Ürünler" icon={<Sparkles className="size-4" />}
            hint="Yüksek görüntülenme ancak düşük iletişim alan ürünler. Açıklama/fiyat/foto güncellemesi önerilir.">
            {data.sales_potential.length === 0 ? <Empty>Şimdilik öneri yok.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-2">Ürün</th>
                      <th className="px-2 text-right">7g Görüntüleme</th>
                      <th className="px-2 text-right">WA</th>
                      <th className="px-2 text-right">Teklif</th>
                      <th className="px-2 text-right">Fırsat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales_potential.map((p) => (
                      <tr key={p.part_id} className="border-b border-border/40 hover:bg-secondary/30">
                        <td className="py-1.5 pr-2">
                          <Link to="/parts/$id" params={{ id: buildPartParam({ id: p.part_id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code, oem_codes: p.oem_codes }) }} className="hover:text-gold line-clamp-1">
                            {p.title ?? p.part_id}
                          </Link>
                          {p.brand && <span className="text-[10px] text-muted-foreground ml-1">· {p.brand}</span>}
                        </td>
                        <td className="px-2 text-right text-gold font-semibold">{fmt(p.views_7d)}</td>
                        <td className="px-2 text-right">{fmt(p.wa_7d)}</td>
                        <td className="px-2 text-right">{fmt(p.inq_7d)}</td>
                        <td className="px-2 text-right">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                            {(p.opportunity_score ?? 0).toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* SEO DAILY */}
          <Card title="Günlük SEO Özeti" icon={<Globe className="size-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Google'dan gelen (bugün)</div>
                <div className="font-display text-3xl text-gold mt-1">{fmt(data.seo_daily.google_visitors_today)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground mb-1.5">En çok trafik alan sayfalar (bugün)</div>
                {data.seo_daily.top_paths_today.length === 0 ? <p className="text-xs text-muted-foreground">Veri yok.</p> : (
                  <ul className="space-y-0.5 text-xs">
                    {data.seo_daily.top_paths_today.slice(0, 6).map((p) => (
                      <li key={p.path} className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground">{p.path}</span>
                        <span className="text-gold font-semibold shrink-0">{fmt(p.hits)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground mb-1.5">En çok yükselen OEM (24s vs önceki 6g)</div>
                {data.seo_daily.rising_oem.length === 0 ? <p className="text-xs text-muted-foreground">Veri yok.</p> : (
                  <ul className="space-y-0.5 text-xs">
                    {data.seo_daily.rising_oem.slice(0, 6).map((p) => (
                      <li key={p.oem} className="flex justify-between gap-2">
                        <Link to="/oem/$oem" params={{ oem: p.oem }} className="font-mono text-gold hover:underline truncate">{p.oem}</Link>
                        <span className="text-emerald-400 shrink-0">{p.d1} ↑ (önc. {p.prev6})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ============ helpers ============ */

function Card({ title, icon, right, hint, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">{icon}{title}</h3>
        {right}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1.5 font-display text-2xl ${accent ?? "text-gold"}`}>{fmt(value)}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{children}</p>;
}

function PartList({ rows, valueKey, valueLabel }: { rows: ConvPart[]; valueKey: keyof ConvPart; valueLabel: string }) {
  if (rows.length === 0) return <Empty>Henüz veri yok.</Empty>;
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] ?? 0)));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const v = Number(r[valueKey] ?? 0);
        return (
          <li key={r.part_id} className="text-xs">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <Link to="/parts/$id" params={{ id: buildPartParam({ id: r.part_id, seo_slug: r.seo_slug, title: r.title, oem_code: r.oem_code, oem_codes: r.oem_codes }) }} className="hover:text-gold line-clamp-1 flex-1">
                {r.title ?? r.part_id}
              </Link>
              <span className="text-gold font-semibold shrink-0">{fmt(v)} <span className="text-muted-foreground text-[10px]">{valueLabel}</span></span>
            </div>
            <div className="h-1 bg-secondary rounded">
              <div className="h-full bg-gold rounded" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OemList({ rows, accent }: { rows: { oem: string; count: number; last: string }[]; accent: "gold" | "red" }) {
  if (rows.length === 0) return <Empty>Veri yok.</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const bar = accent === "red" ? "bg-red-500" : "bg-gold";
  const text = accent === "red" ? "text-red-400" : "text-gold";
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.oem} className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <Link to="/oem/$oem" params={{ oem: r.oem }} className={`font-mono hover:underline ${text} truncate flex-1`}>
              {r.oem}
            </Link>
            <span className={`${text} font-semibold shrink-0`}>{fmt(r.count)}</span>
          </div>
          <div className="h-1 bg-secondary rounded">
            <div className={`h-full ${bar} rounded`} style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FunnelView({ f }: { f: { visited: number; searched: number; viewed: number; whatsapped: number; offered: number; sold: number } }) {
  const steps = [
    { label: "Giriş", value: f.visited, icon: <Users className="size-3.5" /> },
    { label: "Arama", value: f.searched, icon: <Search className="size-3.5" /> },
    { label: "Ürün", value: f.viewed, icon: <Eye className="size-3.5" /> },
    { label: "WhatsApp", value: f.whatsapped, icon: <MessageCircle className="size-3.5" /> },
    { label: "Teklif", value: f.offered, icon: <Mail className="size-3.5" /> },
    { label: "Satış", value: f.sold, icon: <ShoppingCart className="size-3.5" /> },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  const data = steps.map((s) => ({ ...s, pct: max ? (s.value / max) * 100 : 0 }));
  return (
    <>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Bar dataKey="value" fill="#d4af37" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : 0;
          const rate = i > 0 && prev > 0 ? (s.value / prev) * 100 : null;
          return (
            <div key={s.label} className="text-center rounded-lg border border-border p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground">{s.icon}{s.label}</div>
              <div className="font-display text-lg text-gold mt-0.5">{fmt(s.value)}</div>
              {rate !== null && <div className="text-[10px] text-emerald-400">{rate.toFixed(1)}%</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
