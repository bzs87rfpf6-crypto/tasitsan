import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runEmbeddingBackfill, embeddingStats } from "@/lib/embedding-backfill.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Stats = { total: number; with_embedding: number; needs_update: number; model: string; dims: number };
type BatchResult = { processed: number; updated: number; skipped: number; errors: number; model?: string };

export function SemanticEmbeddingPanel() {
  const runFn = useServerFn(runEmbeddingBackfill);
  const statsFn = useServerFn(embeddingStats);

  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState({ updated: 0, skipped: 0, errors: 0 });
  const [lastBatch, setLastBatch] = useState<BatchResult | null>(null);

  const loadStats = async () => {
    try { setStats(await statsFn()); } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yüklenemedi");
    }
  };

  useEffect(() => { loadStats(); }, []);

  const start = async (force = false) => {
    setRunning(true);
    setTotals({ updated: 0, skipped: 0, errors: 0 });
    let batches = 0;
    while (running || batches === 0) {
      batches++;
      try {
        const res = (await runFn({ data: { limit: 20, force } })) as BatchResult;
        setLastBatch(res);
        setTotals((t) => ({
          updated: t.updated + res.updated,
          skipped: t.skipped + res.skipped,
          errors: t.errors + res.errors,
        }));
        if (res.processed === 0) break;
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Hata");
        break;
      }
      if (batches > 500) break; // güvenlik
    }
    setRunning(false);
    await loadStats();
    toast.success("Embedding backfill tamamlandı");
  };

  const runOneBatch = async () => {
    setRunning(true);
    try {
      const res = (await runFn({ data: { limit: 20, force: false } })) as BatchResult;
      setLastBatch(res);
      setTotals((t) => ({
        updated: t.updated + res.updated,
        skipped: t.skipped + res.skipped,
        errors: t.errors + res.errors,
      }));
      await loadStats();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Hata"); }
    setRunning(false);
  };

  const coverage = stats && stats.total > 0 ? Math.round((stats.with_embedding / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Semantik Arama — pgvector Backfill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Ürünleri {stats?.model ?? "openai/text-embedding-3-small"} ({stats?.dims ?? 1536} boyut) ile vektörlüyor.
          Semantik arama, AI asistanının fallback katmanı olarak devrede.
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Toplam onaylı ürün" value={stats.total} />
            <Stat label="Embedding'i olan" value={stats.with_embedding} />
            <Stat label="Güncelleme bekleyen" value={stats.needs_update} />
          </div>
        )}

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Kapsam</span><span>{coverage}%</span>
          </div>
          <Progress value={coverage} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => start(false)} disabled={running}>
            {running ? "Çalışıyor..." : "Tümünü Vektörle (eksik olanlar)"}
          </Button>
          <Button variant="secondary" onClick={runOneBatch} disabled={running}>
            Tek Batch (20 ürün)
          </Button>
          <Button variant="outline" onClick={loadStats} disabled={running}>
            İstatistikleri Yenile
          </Button>
        </div>

        {(totals.updated > 0 || totals.errors > 0) && (
          <div className="text-sm bg-muted/50 rounded p-3">
            Oturum: <b>{totals.updated}</b> güncellendi · <b>{totals.skipped}</b> atlandı · <b>{totals.errors}</b> hata
            {lastBatch && <div className="text-xs text-muted-foreground mt-1">Son batch: {lastBatch.processed} işlendi</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value.toLocaleString("tr-TR")}</div>
    </div>
  );
}
