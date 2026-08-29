import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Gauge, AlertTriangle, FileWarning, Link2Off, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  getSeoProgressReport, getSeoPendingPages, getSeoDuplicateTitles,
  getSeoThinContent, getSeoUrlConflicts,
} from "@/lib/seo31.functions";

interface Progress {
  total: number;
  with_seo_slug: number;
  with_oem: number;
  with_photo: number;
  with_description: number;
  avg_score: number;
  updated_30d: number;
  distinct_oems: number;
  history_redirects: number;
}

export function Seo31Panel() {
  const callProgress = useServerFn(getSeoProgressReport);
  const callPending = useServerFn(getSeoPendingPages);
  const callDupTitles = useServerFn(getSeoDuplicateTitles);
  const callThin = useServerFn(getSeoThinContent);
  const callConflicts = useServerFn(getSeoUrlConflicts);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [dupTitles, setDupTitles] = useState<any[]>([]);
  const [thin, setThin] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, pe, dt, th, cf] = await Promise.all([
        callProgress(),
        callPending({ data: { limit: 50 } }),
        callDupTitles({ data: { limit: 20 } }),
        callThin({ data: { limit: 30 } }),
        callConflicts({ data: { limit: 20 } }),
      ]);
      setProgress(pr as unknown as Progress);
      setPending(pe);
      setDupTitles(dt);
      setThin(th);
      setConflicts(cf);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pct = (n: number) =>
    progress && progress.total > 0 ? `%${Math.round((n / progress.total) * 100)}` : "%0";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-5 text-gold" />
          <div>
            <h2 className="font-display text-xl">SEO 3.1 Analiz Paneli</h2>
            <p className="text-xs text-muted-foreground">URL optimizasyonu, içerik kapsama, yapılandırılmış veri ve indekslenme raporları.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="ml-1.5">Yenile</span>
        </Button>
      </div>

      {progress && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">İlerleme Raporu</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Metric label="Toplam Aktif Ürün" value={progress.total.toLocaleString("tr-TR")} />
            <Metric label="Ortalama SEO Puanı" value={`${progress.avg_score} / 100`} tone="good" />
            <Metric label="SEO Slug" value={`${progress.with_seo_slug.toLocaleString("tr-TR")} (${pct(progress.with_seo_slug)})`} tone="good" />
            <Metric label="OEM'li Ürün" value={`${progress.with_oem.toLocaleString("tr-TR")} (${pct(progress.with_oem)})`} tone="good" />
            <Metric label="Görselli Ürün" value={`${progress.with_photo.toLocaleString("tr-TR")} (${pct(progress.with_photo)})`} />
            <Metric label="Açıklamalı Ürün" value={`${progress.with_description.toLocaleString("tr-TR")} (${pct(progress.with_description)})`} />
            <Metric label="30 Günde Güncellenen" value={progress.updated_30d.toLocaleString("tr-TR")} />
            <Metric label="Benzersiz OEM" value={progress.distinct_oems.toLocaleString("tr-TR")} />
            <Metric label="301 Yönlendirme" value={progress.history_redirects.toLocaleString("tr-TR")} />
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileWarning className="size-4 text-amber-500" />
          <h3 className="text-sm font-semibold">İndekslenmeyi Bekleyen Sayfalar (Düşük SEO Puanı)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground uppercase tracking-wider">
              <tr><th className="text-left p-1">URL</th><th className="text-left p-1">OEM</th><th className="text-left p-1">Puan</th><th className="text-left p-1">Açıklama</th><th className="text-left p-1">Görsel</th></tr>
            </thead>
            <tbody>
              {pending.slice(0, 25).map((r) => (
                <tr key={r.part_id} className="border-t border-border/60">
                  <td className="p-1 font-mono truncate max-w-[260px]">
                    {r.seo_slug ? (
                      <a href={`/parts/${r.seo_slug}`} className="text-gold hover:underline">{r.seo_slug}</a>
                    ) : (
                      <span className="text-muted-foreground">Slug bekleniyor</span>
                    )}
                  </td>
                  <td className="p-1 font-mono">{r.oem_code ?? "—"}</td>
                  <td className="p-1"><span className={`${r.score < 50 ? "text-destructive" : r.score < 75 ? "text-amber-500" : "text-emerald-500"} font-semibold`}>{r.score}</span></td>
                  <td className="p-1">{r.description_length} kar.</td>
                  <td className="p-1">{r.photo_count} adet</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">İnce İçerik (&lt;80 karakter)</h3>
          </div>
          <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
            {thin.length === 0 && <li className="text-muted-foreground">Yok 🎉</li>}
            {thin.map((r) => (
              <li key={r.part_id} className="flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className="text-amber-500 font-mono">{r.description_length}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Yinelenen Başlıklar</h3>
          </div>
          <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
            {dupTitles.length === 0 && <li className="text-muted-foreground">Yok 🎉</li>}
            {dupTitles.map((r) => (
              <li key={r.title} className="flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className="text-muted-foreground">{r.count}×</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link2Off className="size-4 text-destructive" />
          <h3 className="text-sm font-semibold">URL Çakışmaları</h3>
        </div>
        {conflicts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Çakışma yok 🎉 Her slug benzersiz.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {conflicts.map((c) => (
              <li key={c.slug} className="flex justify-between">
                <code className="text-destructive">{c.slug}</code>
                <span className="text-muted-foreground">{c.part_ids.length} ürün</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 space-y-2 bg-emerald-500/5 border-emerald-500/20">
        <h3 className="text-sm font-semibold text-emerald-500">SEO 3.1 Tamamlanma Raporu</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>UUID URL'den kaldırıldı — yeni format: <code>/parts/{`{oem}`}-{`{seo-slug}`}</code></li>
          <li>Eski tüm URL'ler 301 ile yeni slug'a yönlendiriliyor (history tablosu)</li>
          <li>Canonical sadece yeni slug'ı gösterir</li>
          <li>Sitemap yalnızca indekslenebilir, slug'lı ürünleri içerir</li>
          <li>Her ürün için OEM bilgi kutusu, uyumluluk tablosu, FAQ ve Product+FAQ+Breadcrumb JSON-LD üretilir</li>
          <li>İlgili ürün dahili linkleme aktif (RPC: related_parts_for)</li>
          <li>SEO kalite puanı + ilerleme + ince içerik + yinelenen + çakışma raporları admin'de</li>
        </ul>
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
