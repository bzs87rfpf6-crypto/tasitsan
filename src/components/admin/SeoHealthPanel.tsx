import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { getSeoHealth, type SeoHealth } from "@/lib/seo-health.functions";

export function SeoHealthPanel() {
  const q = useQuery({
    queryKey: ["admin:seo-health"],
    queryFn: () => getSeoHealth(),
    refetchInterval: 60_000,
  });

  if (q.isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> SEO sağlık raporu hesaplanıyor…
        </div>
      </Card>
    );
  }
  if (q.isError || !q.data) {
    return <Card className="p-4 text-sm text-destructive">SEO sağlığı yüklenemedi.</Card>;
  }
  const d: SeoHealth = q.data;
  const indexable = Math.max(0, d.active_total - d.noindex_pages);
  const coverage = d.active_total ? Math.round((indexable / d.active_total) * 100) : 0;

  return (
    <Card className="p-4 space-y-4">
      <header className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-widest text-gold">SEO Sağlık Merkezi</div>
        <h2 className="font-display text-lg">İndekslenebilirlik & Eksiklikler</h2>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Aktif İlan" value={d.active_total} tone="neutral" />
        <Kpi label="İndekslenebilir" value={indexable} tone="ok" sub={`%${coverage} kapsama`} />
        <Kpi label="Noindex (stoksuz)" value={d.noindex_pages} tone="warn" />
        <Kpi label="OEM Sayfası" value={d.oem_indexable} tone="ok" />
        <Kpi label="Marka Sayfası" value={d.brand_indexable} tone="ok" />
        <Kpi label="Görsel Eksik" value={d.missing_photo} tone="warn" />
        <Kpi label="Açıklama Eksik" value={d.missing_description} tone="warn" />
        <Kpi label="OEM Eksik" value={d.missing_oem} tone="warn" />
        <Kpi label="Marka/Model Eksik" value={d.missing_brand_model} tone="warn" />
        <Kpi label="SEO Slug Eksik" value={d.missing_seo_slug} tone="warn" />
        <Kpi label="Duplicate Başlık" value={d.duplicate_title_groups} tone={d.duplicate_title_groups > 0 ? "warn" : "ok"} />
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-3 flex items-start gap-2">
        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
        <span>
          Stoğu 0 olan ilanlar otomatik olarak <code className="text-foreground">noindex,follow</code> ile servis edilir;
          arama indeksinden çıkar ancak iç linkleme korunur. Eksik alanları doldurmak Rich Results uygunluğunu artırır.
        </span>
      </div>
    </Card>
  );
}

function Kpi({ label, value, tone, sub }: { label: string; value: number; tone: "ok" | "warn" | "neutral"; sub?: string }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display ${color} flex items-center gap-1.5`}>
        {tone === "ok" && value > 0 && <CheckCircle2 className="size-4" />}
        {value.toLocaleString("tr-TR")}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
