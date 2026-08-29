// SEO Faz 7 — Tur 4
// Admin Growth Panel: landing_page_registry + ai_content_cache üzerinden
// büyüme, kalite dağılımı ve thin content oranını gösterir.
import { useEffect, useState } from "react";
import { getSeoGrowthOverview, type SeoGrowthOverview } from "@/lib/model-seo.functions";
import { Loader2, TrendingUp, ShieldAlert, Sparkles, LineChart } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  brand: "Marka",
  brand_model: "Marka × Model",
  brand_model_category: "Marka × Model × Kategori",
  oem: "OEM",
  category: "Kategori",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>{children}</div>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

export function SeoGrowthPanel() {
  const [data, setData] = useState<SeoGrowthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSeoGrowthOverview();
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> SEO büyüme özeti yükleniyor…
      </Card>
    );
  }
  if (error || !data) {
    return <Card className="text-sm text-destructive">SEO Growth özeti yüklenemedi: {error}</Card>;
  }

  const indexRate = data.total_pages > 0 ? Math.round((data.indexable_pages / data.total_pages) * 100) : 0;
  const thinRate = data.total_pages > 0 ? Math.round((data.thin_pages / data.total_pages) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-gold" />
        <h2 className="font-display text-lg">SEO Growth Panel</h2>
        <span className="text-xs text-muted-foreground">
          Kalite eşiği: {data.threshold}/100
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Toplam Landing" value={data.total_pages.toLocaleString("tr-TR")} />
        <Stat label="Indexlenebilir" value={data.indexable_pages.toLocaleString("tr-TR")} hint={`%${indexRate} sitemap'e girer`} />
        <Stat label="Thin Content" value={data.thin_pages.toLocaleString("tr-TR")} hint={`%${thinRate} noindex,follow`} />
        <Stat label="Ortalama Kalite" value={`${data.avg_quality}/100`} />
        <Stat label="AI İçerik Cache" value={data.ai_cache_size.toLocaleString("tr-TR")} hint="cache'lenmiş ürün açıklaması" />
        <Stat label="Sitemap Kapsamı" value={`${data.indexable_pages}`} hint="yalnız indexable landing" />
        <Stat label="Iç Linkleme" value={`${data.indexable_pages > 0 ? "Aktif" : "Bekliyor"}`} hint="HubLinks + SmartInternalLinks" />
        <Stat label="Bekleyen İyileştirme" value={data.thin_pages.toLocaleString("tr-TR")} hint="thin content sayfaları" />
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <LineChart className="size-4 text-gold" />
          <h3 className="font-semibold text-sm">Sayfa Türlerine Göre Dağılım</h3>
        </div>
        {data.by_kind.length === 0 ? (
          <div className="text-xs text-muted-foreground">Henüz landing kaydı yok.</div>
        ) : (
          <div className="space-y-2">
            {data.by_kind.map((k) => (
              <div key={k.kind} className="flex items-center justify-between text-xs">
                <span className="font-mono">{KIND_LABELS[k.kind] ?? k.kind}</span>
                <span className="text-muted-foreground">
                  {k.total} sayfa • {k.indexable} indexable • ort. {k.avg_quality}/100
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <h3 className="font-semibold text-sm mb-2">En Güçlü Markalar</h3>
          {data.top_brands.length === 0 ? (
            <div className="text-xs text-muted-foreground">Veri yok.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {data.top_brands.map((b) => (
                <li key={b.brand} className="flex justify-between">
                  <span>{b.brand}</span>
                  <span className="text-muted-foreground">{b.pages} sayfa / {b.indexable} idx</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-sm mb-2">En Güçlü Modeller</h3>
          {data.top_models.length === 0 ? (
            <div className="text-xs text-muted-foreground">Veri yok.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {data.top_models.map((m) => (
                <li key={`${m.brand}-${m.model}`} className="flex justify-between">
                  <span>{m.brand} {m.model}</span>
                  <span className="text-muted-foreground">{m.pages}s • {m.quality}/100</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-sm mb-2">En Güçlü Kategoriler</h3>
          {data.top_categories.length === 0 ? (
            <div className="text-xs text-muted-foreground">Veri yok.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {data.top_categories.map((c) => (
                <li key={c.category} className="flex justify-between">
                  <span>{c.category}</span>
                  <span className="text-muted-foreground">{c.pages} sayfa</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-gold" />
          <h3 className="font-semibold text-sm">Son Skorlanan Landing Sayfalar</h3>
        </div>
        {data.recent_pages.length === 0 ? (
          <div className="text-xs text-muted-foreground">Henüz kayıt yok. Bir marka/model landing sayfasını ziyaret ettikçe otomatik oluşur.</div>
        ) : (
          <div className="space-y-1">
            {data.recent_pages.map((p) => (
              <div key={p.slug} className="flex items-center justify-between text-xs border-b border-border/50 pb-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block size-1.5 rounded-full ${p.indexable ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="font-mono">/marka/{p.slug}</span>
                  <span className="text-muted-foreground">[{KIND_LABELS[p.kind] ?? p.kind}]</span>
                </div>
                <span className="text-muted-foreground">{p.quality_score}/100</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.thin_pages > 0 && (
        <Card className="border-amber-500/40">
          <div className="flex items-start gap-2">
            <ShieldAlert className="size-4 text-amber-500 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-amber-500">Thin Content Uyarısı</div>
              <div className="text-muted-foreground mt-0.5">
                {data.thin_pages} landing sayfası kalite eşiğinin altında ve <code>noindex,follow</code> olarak yayınlanıyor.
                Bu sayfalar sitemap'e dahil edilmez. Kalite arttıkça (yeni ilan, OEM, açıklama) otomatik olarak indexable olur.
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
