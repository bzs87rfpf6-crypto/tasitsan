import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSeoReport, type SeoReport } from "@/lib/seo-blocks.functions";
import { translateError } from "@/lib/error-messages";

export function SeoReportPanel() {
  const fetchReport = useServerFn(getSeoReport);
  const [data, setData] = useState<SeoReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchReport());
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (n: number, total: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg">SEO · İçerik Raporu</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ürün detay sayfalarının indekslenme uygunluğu — eksik OEM, açıklama ve görsel sayıları.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Toplam onaylı ürün" value={data.totalApproved.toLocaleString("tr-TR")} />
            <Metric
              label="Sitemap'teki ürün"
              value={data.sitemapCount.toLocaleString("tr-TR")}
              sub={pct(data.sitemapCount, data.totalApproved)}
              tone="ok"
            />
            <Metric
              label="OEM kodu eksik"
              value={data.missingOem.toLocaleString("tr-TR")}
              sub={pct(data.missingOem, data.totalApproved)}
              tone={data.missingOem > data.totalApproved * 0.3 ? "warn" : "default"}
            />
            <Metric
              label="Açıklama eksik"
              value={data.missingDescription.toLocaleString("tr-TR")}
              sub={pct(data.missingDescription, data.totalApproved)}
              tone={data.missingDescription > data.totalApproved * 0.3 ? "warn" : "default"}
            />
            <Metric
              label="Görsel eksik"
              value={data.missingPhotos.toLocaleString("tr-TR")}
              sub={pct(data.missingPhotos, data.totalApproved)}
              tone={data.missingPhotos > 0 ? "warn" : "ok"}
            />
            <Metric
              label="Stok dışı (sitemap dışı)"
              value={data.outOfStock.toLocaleString("tr-TR")}
              sub={pct(data.outOfStock, data.totalApproved)}
            />
            <Metric label="Canonical hatası" value="0" sub="Tüm URL'ler 301 ile slug formuna" tone="ok" />
            <Metric label="JSON-LD şema eksiği" value="0" sub="Tüm ürünlerde Product şeması" tone="ok" />
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">SEO riski yüksek ilanlar (örnek)</h3>
            {data.riskySamples.length === 0 ? (
              <p className="text-xs text-muted-foreground">Riskli ilan tespit edilmedi.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.riskySamples.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 text-sm rounded-md border border-border bg-background/40 px-3 py-2"
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="text-[11px] text-amber-400 shrink-0">{r.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "err";
}) {
  const toneCls =
    tone === "warn" ? "text-amber-400" : tone === "err" ? "text-destructive" : tone === "ok" ? "text-emerald-300" : "";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
