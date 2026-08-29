import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Flame, RefreshCw, Sparkles, TrendingUp, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DEMAND_TIER_META, tierOfScore } from "@/lib/demand";
import { getDemandAiInsights, runDemandAiAnalysis, type DemandAiInsights } from "@/lib/demand-ai.functions";

type Analytics = {
  totals: { signals: number; open: number; fulfilled: number; missing: number; searches: number };
  top_oems: { oem_code: string; part_name: string | null; brand: string | null; search_count: number; score: number; tier: string; in_stock_count: number }[];
  top_keywords: { keyword: string; search_count: number; score: number }[];
  missing: { oem_code: string | null; label: string | null; brand: string | null; search_count: number; unique_users: number; score: number; tier: string; last_seen_at: string }[];
  rising: { oem_code: string | null; label: string | null; brand: string | null; count_7d: number; count_30d: number; score: number; tier: string }[];
  repeated: { oem_code: string | null; label: string | null; search_count: number; unique_users: number; repeat_ratio: number }[];
  by_brand: { brand: string; searches: number; signals: number }[];
  by_category: { category: string; searches: number; signals: number }[];
  daily: { day: string; searches: number }[];
  weekly: { week: string; searches: number }[];
  monthly: { month: string; searches: number }[];
  sources: { source: string; hits: number }[];
};

export function DemandAnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [ai, setAi] = useState<DemandAiInsights | null>(null);
  const [busy, setBusy] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);

  const fetchAi = useServerFn(getDemandAiInsights);
  const runAi = useServerFn(runDemandAiAnalysis);

  const load = useCallback(async () => {
    setBusy(true);
    const { data: d, error } = await supabase.rpc("admin_demand_analytics", { _days: 30 });
    if (error) toast.error(error.message);
    setData((d ?? null) as unknown as Analytics | null);
    try { setAi(await fetchAi()); } catch { /* yoksay */ }
    setBusy(false);
  }, [fetchAi]);

  useEffect(() => { void load(); }, [load]);

  const onRunAi = async () => {
    setAiBusy(true);
    try {
      setAi(await runAi());
      toast.success("AI talep analizi güncellendi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analiz çalıştırılamadı.");
    }
    setAiBusy(false);
  };

  if (busy) return <p className="text-sm text-muted-foreground text-center py-8">Talep analizi yükleniyor…</p>;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-8">Veri yok.</p>;

  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base flex items-center gap-2">
          <BarChart3 className="size-4 text-gold" /> Talep Analizi
        </h2>
        <Button size="sm" variant="outline" className="h-8" onClick={() => void load()}>
          <RefreshCw className="size-3.5 mr-1" /> Yenile
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Kpi label="Talep Sinyali" value={t.signals} />
        <Kpi label="Açık" value={t.open} />
        <Kpi label="Karşılandı" value={t.fulfilled} accent="text-emerald-400" />
        <Kpi label="Stokta Yok" value={t.missing} accent="text-red-400" />
        <Kpi label="Toplam Arama" value={t.searches} />
      </div>

      <Section icon={<PackageX className="size-4 text-red-400" />} title="Eksik Ürün Raporu (yoğun aranan, stokta yok)">
        <List
          rows={data.missing.map((m) => ({
            key: `${m.oem_code}-${m.label}`,
            main: m.label || m.oem_code || "—",
            sub: `${m.oem_code ?? ""}${m.brand ? ` · ${m.brand}` : ""} · ${m.unique_users} kişi`,
            right: `${DEMAND_TIER_META[tierOfScore(m.score)].icon} ${m.search_count}`,
          }))}
        />
      </Section>

      <Section icon={<TrendingUp className="size-4 text-gold" />} title="En Hızlı Yükselen Talepler (7 gün)">
        <List
          rows={data.rising.map((m) => ({
            key: `${m.oem_code}-${m.label}`,
            main: m.label || m.oem_code || "—",
            sub: `${m.brand ?? ""} · 30 gün: ${m.count_30d}`,
            right: `↑ ${m.count_7d}`,
          }))}
        />
      </Section>

      <div className="grid sm:grid-cols-2 gap-4">
        <Section icon={<Flame className="size-4 text-gold" />} title="En Çok Aranan OEM'ler">
          <List rows={data.top_oems.map((m) => ({ key: m.oem_code, main: m.oem_code, sub: m.part_name ?? m.brand ?? "", right: String(m.search_count) }))} />
        </Section>
        <Section icon={<Flame className="size-4 text-gold" />} title="En Çok Aranan Kelimeler">
          <List rows={data.top_keywords.map((m) => ({ key: m.keyword, main: m.keyword, sub: `puan ${m.score}`, right: String(m.search_count) }))} />
        </Section>
        <Section title="Marka Bazında Talep">
          <List rows={data.by_brand.map((m) => ({ key: m.brand, main: m.brand, sub: `${m.signals} talep`, right: String(m.searches) }))} />
        </Section>
        <Section title="Kategori Bazında Talep">
          <List rows={data.by_category.map((m) => ({ key: m.category, main: m.category, sub: `${m.signals} talep`, right: String(m.searches) }))} />
        </Section>
        <Section title="En Çok Tekrar Edilen Aramalar">
          <List rows={data.repeated.map((m) => ({ key: `${m.oem_code}-${m.label}`, main: m.label || m.oem_code || "—", sub: `${m.unique_users} kişi`, right: `x${m.repeat_ratio}` }))} />
        </Section>
        <Section title="Trafik Kaynakları">
          <List rows={data.sources.map((m) => ({ key: m.source, main: m.source, sub: "", right: String(m.hits) }))} />
        </Section>
        <Section title="Günlük Trend">
          <List rows={data.daily.slice(-14).reverse().map((m) => ({ key: m.day, main: new Date(m.day).toLocaleDateString("tr-TR"), sub: "", right: String(m.searches) }))} />
        </Section>
        <Section title="Haftalık / Aylık Trend">
          <List
            rows={[
              ...data.weekly.slice(-6).reverse().map((m) => ({ key: `w${m.week}`, main: `Hafta ${new Date(m.week).toLocaleDateString("tr-TR")}`, sub: "", right: String(m.searches) })),
              ...data.monthly.slice(-6).reverse().map((m) => ({ key: `m${m.month}`, main: `Ay ${new Date(m.month).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}`, sub: "", right: String(m.searches) })),
            ]}
          />
        </Section>
      </div>

      <Section icon={<Sparkles className="size-4 text-gold" />} title="AI Talep Analizi (her gece otomatik)">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {ai?.generated_at ? `Son çalışma: ${new Date(ai.generated_at).toLocaleString("tr-TR")}` : "Henüz çalışmadı"}
            </span>
            <Button size="sm" variant="outline" className="h-8" disabled={aiBusy} onClick={() => void onRunAi()}>
              {aiBusy ? "Çalışıyor…" : "Şimdi Çalıştır"}
            </Button>
          </div>
          {ai?.summary && <p className="text-xs text-muted-foreground">{ai.summary}</p>}
          <AiList title="Bu hafta en hızlı yükselenler" items={ai?.rising ?? []} />
          <AiList title="30 günde en çok talep gören OEM'ler" items={ai?.top_oems ?? []} />
          <AiList title="Talebi yüksek, stokta olmayanlar" items={ai?.missing ?? []} />
          <AiList title="Satıcılara önerilen ürünler" items={ai?.suggested ?? []} />
          <AiList title="Trend marka ve kategoriler" items={ai?.trends ?? []} />
        </div>
      </Section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className={`text-lg font-bold ${accent ?? ""}`}>{(value ?? 0).toLocaleString("tr-TR")}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
      <h3 className="text-xs font-semibold flex items-center gap-1.5">{icon}{title}</h3>
      {children}
    </section>
  );
}

function List({ rows }: { rows: { key: string; main: string; sub: string; right: string }[] }) {
  if (rows.length === 0) return <p className="text-[11px] text-muted-foreground">Kayıt yok.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={`${r.key}-${i}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-border/50 pb-1 last:border-0">
          <div className="min-w-0">
            <p className="truncate font-medium">{r.main}</p>
            {r.sub && <p className="truncate text-muted-foreground">{r.sub}</p>}
          </div>
          <span className="shrink-0 font-bold text-gold">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold">{title}</p>
      <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
