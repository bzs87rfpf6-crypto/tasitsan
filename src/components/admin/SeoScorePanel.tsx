import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { processSeoEnrichmentBatch, getSeoScoreDashboard } from "@/lib/seo-turn3.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buildPartParam } from "@/lib/part-slug";

const ISSUE_LABEL: Record<string, string> = {
  title_too_short: "Başlık çok kısa",
  title_too_long: "Başlık çok uzun",
  desc_too_short: "Açıklama çok kısa",
  desc_too_long: "Açıklama çok uzun",
  duplicate_content: "Yinelenen içerik",
  no_faqs: "SSS eksik",
  missing_oem: "OEM eksik",
  missing_vehicle: "Marka/Model eksik",
  no_internal_links: "İç link yok",
  few_internal_links: "İç link az",
  no_photos: "Fotoğraf yok",
  missing_alt_text: "Alt metin eksik",
  noindex: "Dizinlenemez",
  canonical_mismatch: "Canonical hatası",
  missing_year: "Yıl eksik",
};

export function SeoScorePanel() {
  const qc = useQueryClient();
  const runBatch = useServerFn(processSeoEnrichmentBatch);
  const dashboardFn = useServerFn(getSeoScoreDashboard);
  const [running, setRunning] = useState(false);
  const [lastBatch, setLastBatch] = useState<{ processed: number; remaining: number } | null>(null);

  const dash = useQuery({
    queryKey: ["seo-score-dashboard"],
    queryFn: () => dashboardFn({}),
    refetchInterval: running ? 3000 : false,
  });

  const batchMut = useMutation({
    mutationFn: () => runBatch({ data: { batchSize: 25 } }),
    onSuccess: (r) => {
      setLastBatch({ processed: r.processed, remaining: r.remaining });
      qc.invalidateQueries({ queryKey: ["seo-score-dashboard"] });
      if (running && r.remaining > 0) setTimeout(() => batchMut.mutate(), 800);
      else setRunning(false);
    },
    onError: () => setRunning(false),
  });

  const start = () => {
    setRunning(true);
    batchMut.mutate();
  };

  const d = dash.data;
  const totalScored = d ? d.buckets.excellent + d.buckets.good + d.buckets.fair + d.buckets.poor + d.buckets.critical : 0;
  const enrichPct = d && d.totalMeta > 0 ? Math.round((d.enriched / d.totalMeta) * 100) : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>🎯 SEO Skor & Öznitelik Motoru (Tur 3)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Öznitelik normalizasyonu · iç link ağı · 0-100 skor · yinelenen küme tespiti
            </p>
          </div>
          <Button onClick={start} disabled={running || batchMut.isPending}>
            {running ? "Çalışıyor…" : "Zenginleştirmeyi Başlat"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Metric label="Onaylı Parça" value={d.totalParts} />
              <Metric label="SEO Meta" value={d.totalMeta} />
              <Metric label="Zenginleştirildi" value={`${d.enriched} (${enrichPct}%)`} />
              <Metric label="Ort. Skor" value={d.avgScore ?? "-"} />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">Zenginleştirme Kapsamı</span>
                <span className="text-muted-foreground">{enrichPct}%</span>
              </div>
              <Progress value={enrichPct} className="h-2" />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Skor Dağılımı ({totalScored})</h4>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <Bucket label="Mükemmel 85+" value={d.buckets.excellent} tone="bg-green-500" />
                <Bucket label="İyi 70-84" value={d.buckets.good} tone="bg-emerald-500" />
                <Bucket label="Orta 55-69" value={d.buckets.fair} tone="bg-amber-500" />
                <Bucket label="Zayıf 40-54" value={d.buckets.poor} tone="bg-orange-500" />
                <Bucket label="Kritik <40" value={d.buckets.critical} tone="bg-red-500" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-2">En Sık Sorunlar</h4>
                <div className="space-y-1">
                  {d.topIssues.length === 0 && <p className="text-xs text-muted-foreground">Henüz veri yok.</p>}
                  {d.topIssues.map((i) => (
                    <div key={i.code} className="flex items-center justify-between text-sm border-b py-1">
                      <span>{ISSUE_LABEL[i.code] ?? i.code}</span>
                      <Badge variant="secondary">{i.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Yapısal Eksikler</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between border-b py-1">
                    <span>Eksik öznitelik (OEM/marka/model)</span>
                    <Badge variant="secondary">{d.missingAttributes}</Badge>
                  </div>
                  <div className="flex justify-between border-b py-1">
                    <span>Yetersiz iç link (&lt;6)</span>
                    <Badge variant="secondary">{d.missingInternalLinks}</Badge>
                  </div>
                  <div className="flex justify-between border-b py-1">
                    <span>Yinelenen içerik kümesi</span>
                    <Badge variant="secondary">{d.duplicateClusterCount}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">En Düşük Skorlu Ürünler</h4>
              <div className="max-h-64 overflow-y-auto border rounded">
                {d.lowestScoring.length === 0 && <p className="text-xs text-muted-foreground p-3">Henüz veri yok.</p>}
                {d.lowestScoring.map((p) => (
                  <a
                    key={p.part_id}
                    href={`/parts/${buildPartParam({ id: p.part_id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code, oem_codes: p.oem_codes })}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between text-sm px-3 py-1.5 border-b hover:bg-muted"
                  >
                    <span className="truncate max-w-md">{p.title}</span>
                    <Badge variant={p.score < 40 ? "destructive" : "secondary"}>{p.score}</Badge>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {lastBatch && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Son parti: {lastBatch.processed} işlendi · kalan: {lastBatch.remaining}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Bucket({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={`${tone} h-2 rounded mb-1`} />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
