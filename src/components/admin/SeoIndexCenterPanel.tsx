import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Loader2, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { getSeoIndexCenter, type SeoIndexCenter } from "@/lib/seo-index-center.functions";

function Kpi({ label, value, tone = "neutral", sub }: { label: string; value: string | number; tone?: "ok" | "warn" | "neutral"; sub?: string }) {
  const color = tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-xl ${color}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function SeoIndexCenterPanel() {
  const q = useQuery({
    queryKey: ["admin:seo-index-center"],
    queryFn: () => getSeoIndexCenter(),
    refetchInterval: 120_000,
  });

  if (q.isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> SEO indeks durumu hesaplanıyor…
        </div>
      </Card>
    );
  }
  if (q.isError || !q.data) {
    return <Card className="p-4 text-sm text-destructive">SEO indeks merkezi yüklenemedi.</Card>;
  }
  const d: SeoIndexCenter = q.data;

  return (
    <Card className="p-4 space-y-4">
      <header className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-widest text-gold flex items-center gap-1">
          <Search className="size-3" /> SEO İndeks Merkezi
        </div>
        <h2 className="font-display text-lg">Google İndeksleme Durumu</h2>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Toplam Ürün" value={d.total_products.toLocaleString("tr-TR")} />
        <Kpi label="İndekslenebilir" value={d.indexable.toLocaleString("tr-TR")} tone="ok" sub={`%${d.index_rate} index rate`} />
        <Kpi label="Noindex (onaysız)" value={d.noindex.toLocaleString("tr-TR")} tone={d.noindex > 0 ? "warn" : "ok"} />
        <Kpi label="Canonical" value={d.canonical_ok.toLocaleString("tr-TR")} tone="ok" sub="self-canonical" />
        <Kpi label="Meta Eksik" value={d.missing_meta.toLocaleString("tr-TR")} tone={d.missing_meta > 0 ? "warn" : "ok"} />
        <Kpi label="Slug Eksik" value={d.missing_slug.toLocaleString("tr-TR")} tone={d.missing_slug > 0 ? "warn" : "ok"} />
        <Kpi label="301 Yönlendirme" value={d.redirects_301.toLocaleString("tr-TR")} tone="ok" />
        <Kpi label="5xx (24s)" value={d.server_errors_24h} tone={d.server_errors_24h > 0 ? "warn" : "ok"} />
        <Kpi label="Landing Sayfa" value={d.landing_total.toLocaleString("tr-TR")} sub={`${d.landing_indexable} indekslenebilir`} />
        <Kpi label="Ortalama SEO Puanı" value={d.avg_score ?? "—"} tone={(d.avg_score ?? 0) >= 70 ? "ok" : "warn"} />
        <Kpi label="Düşük Puan (<55)" value={d.low_score.toLocaleString("tr-TR")} tone={d.low_score > 0 ? "warn" : "ok"} />
        <Kpi
          label="IndexNow Kuyruğu"
          value={d.indexnow_pending.toLocaleString("tr-TR")}
          sub={d.last_indexnow_at ? new Date(d.last_indexnow_at).toLocaleString("tr-TR") : "—"}
        />
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          <span>
            Sitemap: <a className="underline" href={d.sitemap_url} target="_blank" rel="noreferrer">{d.sitemap_url}</a>
          </span>
        </div>
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            robots.txt yalnızca şunları engeller: <code className="text-foreground">{d.robots_blocked.join(", ")}</code>.
            Ürün, OEM, marka, model, kategori ve talep sayfaları tamamen indekslenebilir.
          </span>
        </div>
      </div>
    </Card>
  );
}
