import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOnlineParcaPerf } from "@/lib/onlineparca-metrics.functions";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Admin: OnlineParça canlı arama gecikme ve önbellek ölçümleri. */
export function OnlineParcaPerfPanel() {
  const run = useServerFn(getOnlineParcaPerf);
  const q = useQuery({
    queryKey: ["admin", "onlineparca-perf"],
    queryFn: () => run(),
    refetchInterval: 15_000,
  });
  const m = q.data;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-gold" /> OnlineParça Performansı
        </h3>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`size-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Yenile
        </Button>
      </div>

      {q.isPending ? (
        <p className="text-xs text-muted-foreground">Ölçümler yükleniyor…</p>
      ) : !m ? (
        <p className="text-xs text-muted-foreground">Ölçüm verisi yok.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Ortalama Toplam" value={`${m.avgTotalMs} ms`} hint={`p50 ${m.p50TotalMs} / p95 ${m.p95TotalMs} ms`} />
            <Stat label="Arama İsteği" value={`${m.avgSearchMs} ms`} />
            <Stat label="Ayrıştırma" value={`${m.avgParseMs} ms`} />
            <Stat label="Detay İsteği" value={`${m.avgDetailMs} ms`} />
            <Stat label="Cache Hit" value={`%${m.cacheHitRate}`} hint={`${m.cacheHits} hit / ${m.cacheMisses} miss`} />
            <Stat label="Eşzamanlı Birleştirme" value={String(m.inflightJoins)} />
            <Stat label="Timeout" value={String(m.timeouts)} />
            <Stat label="Sonuç Bulma" value={`%${m.foundRate}`} hint={`${m.sampleCount} örnek`} />
          </div>

          {m.recent.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">OEM</th>
                    <th className="p-2 text-right">Arama</th>
                    <th className="p-2 text-right">Parse</th>
                    <th className="p-2 text-right">Detay</th>
                    <th className="p-2 text-right">Toplam</th>
                    <th className="p-2 text-right">Timeout</th>
                    <th className="p-2 text-right">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((s, i) => (
                    <tr key={`${s.oem}-${s.at}-${i}`} className="border-t border-border">
                      <td className="p-2 font-mono">{s.oem}</td>
                      <td className="p-2 text-right">{s.searchMs}</td>
                      <td className="p-2 text-right">{s.parseMs}</td>
                      <td className="p-2 text-right">{s.detailMs}</td>
                      <td className="p-2 text-right font-semibold">{s.totalMs}</td>
                      <td className="p-2 text-right">{s.timeouts}</td>
                      <td className="p-2 text-right">{s.found ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
