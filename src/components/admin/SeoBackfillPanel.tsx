import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  startSeoBackfillRun,
  processSeoBackfillBatch,
  finalizeSeoBackfillRun,
  getSeoBackfillReport,
} from "@/lib/seo-backfill.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Run = {
  id: string;
  status: string;
  candidates_total: number;
  processed_count: number;
  skipped_count: number;
  rewritten_count: number;
  faq_generated_count: number;
  failed_count: number;
  last_error: string | null;
} | null;

export function SeoBackfillPanel() {
  const startFn = useServerFn(startSeoBackfillRun);
  const batchFn = useServerFn(processSeoBackfillBatch);
  const stopFn = useServerFn(finalizeSeoBackfillRun);
  const reportFn = useServerFn(getSeoBackfillReport);

  const [run, setRun] = useState<Run>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Awaited<ReturnType<typeof getSeoBackfillReport>> | null>(null);
  const [lastBatch, setLastBatch] = useState<Array<{ id: string; action: string; title?: string }>>([]);

  useEffect(() => {
    reportFn({ data: {} }).then((r) => { if (r) { setReport(r); setRun(r.run as Run); } });
  }, [reportFn]);

  useEffect(() => {
    if (!running || !run) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await batchFn({ data: { runId: run.id } });
        if (cancelled) return;
        setRun(res.run as Run);
        setRemaining(res.remaining);
        setLastBatch(res.batch);
        if (res.remaining === 0 || (res.run as Run)?.status !== "running") {
          setRunning(false);
          const r = await reportFn({ data: { runId: run.id } });
          if (r) setReport(r);
          toast.success("Backfill tamamlandı");
        } else {
          setTimeout(tick, 250);
        }
      } catch (e) {
        if (cancelled) return;
        setRunning(false);
        toast.error(`Batch hatası: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [running, run?.id, batchFn, reportFn]);

  const start = async () => {
    try {
      const created = await startFn({ data: {} });
      setRun(created as Run);
      setRemaining((created as unknown as { candidates_total: number }).candidates_total ?? 0);
      setRunning(true);
      toast.info("Backfill başladı");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    if (!run) return;
    await stopFn({ data: { runId: run.id, status: "cancelled" } });
    setRunning(false);
    const r = await reportFn({ data: { runId: run.id } });
    if (r) setReport(r);
    toast.info("Backfill durduruldu");
  };

  const total = run?.candidates_total ?? 0;
  const done = (run?.processed_count ?? 0) + (run?.skipped_count ?? 0) + (run?.failed_count ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>SEO Backfill</CardTitle>
          <div className="flex gap-2">
            {!running && <Button onClick={start} size="sm">Başlat</Button>}
            {running && <Button onClick={stop} size="sm" variant="destructive">Durdur</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {run && (
            <>
              <div className="text-xs text-muted-foreground">
                Durum: <b>{run.status}</b> · Kalan: {remaining} · Batch: {done} / {total}
              </div>
              <Progress value={pct} />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <Stat label="İşlenen" value={run.processed_count} />
                <Stat label="Atlanan" value={run.skipped_count} />
                <Stat label="Yeniden Yazılan" value={run.rewritten_count} />
                <Stat label="FAQ üretilen" value={run.faq_generated_count} />
                <Stat label="Hata" value={run.failed_count} />
              </div>
              {run.last_error && (
                <div className="text-xs text-destructive">Son hata: {run.last_error}</div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader><CardTitle>Rapor</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Onaylı ürün" value={report.approvedTotal} />
            <Stat label="Meta kapsamı" value={`${report.coveragePercent}%`} />
            <Stat label="Yüksek kalite" value={report.highQuality} />
            <Stat label="Dup oranı (önce)" value={`${report.duplicateRateBefore}%`} />
            <Stat label="Dup oranı (sonra)" value={`${report.duplicateRateAfter}%`} />
            <Stat label="İndex artış tah." value={`+${report.indexabilityLiftPercent}%`} />
            <Stat label="Ort. başlık uzn. (önce)" value={report.avgTitleLengthBefore ?? "—"} />
            <Stat label="Ort. başlık uzn. (sonra)" value={report.avgTitleLengthAfter ?? "—"} />
            <Stat label="Ort. açıklama (önce)" value={report.avgDescLengthBefore ?? "—"} />
            <Stat label="Ort. açıklama (sonra)" value={report.avgDescLengthAfter ?? "—"} />
          </CardContent>
        </Card>
      )}

      {lastBatch.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Son batch</CardTitle></CardHeader>
          <CardContent className="max-h-48 overflow-auto text-xs space-y-1">
            {lastBatch.map((b) => (
              <div key={b.id} className="flex justify-between gap-2">
                <span className="truncate">{b.title ?? b.id}</span>
                <span className="text-muted-foreground">{b.action}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
