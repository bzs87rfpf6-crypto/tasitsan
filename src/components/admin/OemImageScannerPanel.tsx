import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, Plus, Trash2, RefreshCw } from "lucide-react";
import {
  getScannerStats,
  enqueueBulkScan,
  processScanQueue,
  clearScanQueue,
  recentFailedSearches,
  recentScanJobs,
  getProviderStatus,
} from "@/lib/oem-image-scanner.functions";

export function OemImageScannerPanel() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getScannerStats);
  const enqueueFn = useServerFn(enqueueBulkScan);
  const processFn = useServerFn(processScanQueue);
  const clearFn = useServerFn(clearScanQueue);
  const failedFn = useServerFn(recentFailedSearches);
  const jobsFn = useServerFn(recentScanJobs);
  const providersFn = useServerFn(getProviderStatus);

  const stats = useQuery({
    queryKey: ["oem-scanner-stats"],
    queryFn: () => statsFn({ data: {} as never }),
    refetchInterval: 5000,
  });

  const failed = useQuery({
    queryKey: ["oem-failed-searches"],
    queryFn: () => failedFn({ data: {} as never }),
    refetchInterval: 10000,
  });

  const jobs = useQuery({
    queryKey: ["oem-recent-jobs"],
    queryFn: () => jobsFn({ data: {} as never }),
    refetchInterval: 5000,
  });

  const providers = useQuery({
    queryKey: ["oem-providers"],
    queryFn: () => providersFn({ data: {} as never }),
    refetchInterval: 60000,
  });

  const activeProviders = providers.data?.activeCount ?? 0;
  const noProviders = !providers.isLoading && activeProviders === 0;

  const [debugOpen, setDebugOpen] = useState(false);

  const [brand, setBrand] = useState("");
  const [oem, setOem] = useState("");
  const [batchSize, setBatchSize] = useState(5);

  const enqueueM = useMutation({
    mutationFn: (v: { scope: "all" | "no_images" | "brand" | "oem"; brand?: string; oem?: string }) =>
      enqueueFn({ data: v }),
    onSuccess: (r) => {
      if (r.enqueued > 0) {
        toast.success(`${r.enqueued} iş kuyruğa eklendi.`);
      } else {
        toast.warning("Hiç iş eklenmedi. Aynı OEM/marka için bekleyen iş zaten olabilir veya hiç eşleşen ürün yok.");
      }
      qc.invalidateQueries({ queryKey: ["oem-scanner-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processM = useMutation({
    mutationFn: () => processFn({ data: { batchSize } }),
    onSuccess: (r) => {
      if (r.claimed === 0) {
        toast.warning("Kuyrukta bekleyen iş yok. Önce kuyruğa ekle.");
      } else if (r.providerHardFail) {
        toast.error(`Sağlayıcı hatası: ${r.providerHardFail}. Batch durduruldu.`);
      } else {
        toast.success(
          `${r.processed}/${r.claimed} işlendi · ${r.found} bulundu · ${r.failed ?? 0} başarısız · ${r.totalUrls ?? 0} URL`
        );
      }
      qc.invalidateQueries({ queryKey: ["oem-scanner-stats"] });
      qc.invalidateQueries({ queryKey: ["oem-failed-searches"] });
      qc.invalidateQueries({ queryKey: ["oem-recent-jobs"] });
      qc.invalidateQueries({ queryKey: ["oem-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearM = useMutation({
    mutationFn: (status: "pending" | "error" | "done" | "all") => clearFn({ data: { status } }),
    onSuccess: (r) => {
      toast.success(`${r.deleted} iş silindi.`);
      qc.invalidateQueries({ queryKey: ["oem-scanner-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = stats.data ?? {};
  const cards: Array<[string, number | string]> = [
    ["Toplam OEM Ürün", s.parts_total ?? 0],
    ["Görselli", s.parts_with_photo ?? 0],
    ["Görselsiz", s.parts_without_photo ?? 0],
    ["Havuz Görseli", s.library_total ?? 0],
    ["Doğrulanmış", s.library_verified ?? 0],
    ["Tekil OEM", s.library_unique_oems ?? 0],
    ["Bugün Bulunan", s.today_found ?? 0],
    ["Başarı %", `${s.success_rate ?? 0}%`],
    ["Kuyruk (bekliyor)", s.queue_pending ?? 0],
    ["İşleniyor", s.queue_processing ?? 0],
    ["Tamamlanan", s.queue_done ?? 0],
    ["Hata", s.queue_error ?? 0],
  ];

  return (
    <Card className="max-w-full overflow-x-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="truncate">OEM Görsel Tarayıcı</span>
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { stats.refetch(); failed.refetch(); }}>
            <RefreshCw className="size-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-full overflow-x-hidden">
        {/* Provider status */}
        <div className={`rounded-lg border p-3 ${noProviders ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="font-semibold text-sm">
              Arama Sağlayıcıları · Aktif: <span className={noProviders ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>{activeProviders}</span>/{providers.data?.providers.length ?? 0}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => providers.refetch()} disabled={providers.isFetching}>
              <RefreshCw className={`size-3 ${providers.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(providers.data?.providers ?? []).map((p) => {
              const ok = p.configured && p.ok !== false;
              return (
                <span
                  key={p.id}
                  title={p.error ?? (p.configured ? "Yapılandırıldı" : "API anahtarı yok")}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                    ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                       : p.configured ? "bg-destructive/10 text-destructive border-destructive/30"
                       : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : p.configured ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                  {p.name}
                  {p.status ? ` · ${p.status}` : !p.configured ? " · anahtar yok" : ""}
                </span>
              );
            })}
          </div>
          {noProviders && (
            <p className="text-xs text-destructive mt-2">
              Hiç aktif sağlayıcı yok — tarama başlatılamaz. Firecrawl kredinizi kontrol edin veya alternatif sağlayıcı ekleyin.
            </p>
          )}
          {providers.data?.providers.find((p) => p.id === "firecrawl")?.error && (
            <p className="text-xs text-destructive mt-2 break-all">
              Firecrawl: {providers.data.providers.find((p) => p.id === "firecrawl")?.error}
            </p>
          )}
        </div>


        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>

        {/* Enqueue */}
        <div className="space-y-3">
          <h4 className="font-semibold">Kuyruğa Ekle</h4>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => enqueueM.mutate({ scope: "no_images" })}
              disabled={enqueueM.isPending}
            >
              <Plus className="size-4 mr-1" /> Sadece görselsizler
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => enqueueM.mutate({ scope: "all" })}
              disabled={enqueueM.isPending}
            >
              <Plus className="size-4 mr-1" /> Tüm OEM ürünler
            </Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Marka</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Toyota" />
              </div>
              <Button
                size="sm"
                onClick={() => brand.trim() && enqueueM.mutate({ scope: "brand", brand: brand.trim() })}
                disabled={enqueueM.isPending || !brand.trim()}
              >
                Ekle
              </Button>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">OEM</Label>
                <Input value={oem} onChange={(e) => setOem(e.target.value)} placeholder="89465-0K010" />
              </div>
              <Button
                size="sm"
                onClick={() => oem.trim() && enqueueM.mutate({ scope: "oem", oem: oem.trim() })}
                disabled={enqueueM.isPending || !oem.trim()}
              >
                Ekle
              </Button>
            </div>
          </div>
        </div>

        {/* Process */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">Kuyruğu İşle</h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              Bekleyen: {Number(s.queue_pending ?? 0)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
              İşleniyor: {Number(s.queue_processing ?? 0)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-xs font-medium">
              Biten: {Number(s.queue_done ?? 0)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
              Hata: {Number(s.queue_error ?? 0)}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="w-full sm:w-32">
              <Label className="text-xs">Batch boyutu</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
              />
            </div>
            <Button onClick={() => processM.mutate()} disabled={processM.isPending || Number(s.queue_pending ?? 0) === 0 || noProviders} className="w-full sm:w-auto" title={noProviders ? "En az bir aktif sağlayıcı gerekli" : undefined}>
              {processM.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Play className="size-4 mr-1" />}
              {batchSize} iş işle
            </Button>
            <div className="flex flex-col sm:flex-row sm:ml-auto gap-2 w-full sm:w-auto">
              <Button size="sm" variant="outline" onClick={() => clearM.mutate("error")} disabled={clearM.isPending} className="w-full sm:w-auto">
                <Trash2 className="size-4 mr-1" /> Hataları temizle
              </Button>
              <Button size="sm" variant="outline" onClick={() => clearM.mutate("done")} disabled={clearM.isPending} className="w-full sm:w-auto">
                <Trash2 className="size-4 mr-1" /> Bitenleri temizle
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sistemde olmayan bir OEM girip "Ekle" derseniz ad-hoc tarama işi oluşturulur ve havuza görsel kazandırılır.
            Her batch Firecrawl çağrısı yapar (rate-limit / kredi tüketimine dikkat).
          </p>
        </div>

        {/* Debug — Son İşlenen İşler */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold">Debug · Son İşlenen İşler ({(jobs.data ?? []).length})</h4>
            <Button size="sm" variant="ghost" onClick={() => setDebugOpen((v) => !v)}>
              {debugOpen ? "Detayları gizle" : "Detayları göster"}
            </Button>
          </div>
          <div className="border rounded-lg max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">OEM</th>
                  <th className="text-left px-3 py-2">Marka</th>
                  <th className="text-left px-3 py-2">Durum</th>
                  <th className="text-right px-3 py-2">Bulunan URL</th>
                  <th className="text-left px-3 py-2">Tamamlandı</th>
                </tr>
              </thead>
              <tbody>
                {(jobs.data ?? []).map((j) => {
                  const dbg = (j.debug_log ?? null) as null | {
                    queries?: Array<{ q: string; pages: number; hits: number }>;
                    candidates?: number;
                    saved?: number;
                    from_cache?: boolean;
                  };
                  return (
                    <>
                      <tr key={j.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{j.oem}</td>
                        <td className="px-3 py-2">{j.brand ?? "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={
                            j.status === "done" ? "text-emerald-600 dark:text-emerald-400" :
                            j.status === "error" ? "text-destructive" :
                            j.status === "skipped" ? "text-muted-foreground" :
                            "text-amber-600 dark:text-amber-400"
                          }>{j.status}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{j.found_urls ?? j.result_count ?? 0}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {j.completed_at ? new Date(j.completed_at).toLocaleString("tr-TR") : "-"}
                        </td>
                      </tr>
                      {debugOpen && dbg && (
                        <tr key={`${j.id}-dbg`} className="border-t bg-muted/30">
                          <td colSpan={5} className="px-3 py-2 text-xs">
                            {dbg.from_cache && <div className="text-muted-foreground mb-1">Havuzda zaten görsel var — atlandı.</div>}
                            {j.last_error && <div className="text-destructive mb-1">Hata: {j.last_error}</div>}
                            <div className="mb-1">
                              Aday: <span className="font-mono">{dbg.candidates ?? 0}</span> · Kaydedilen: <span className="font-mono">{dbg.saved ?? 0}</span>
                            </div>
                            {dbg.queries && dbg.queries.length > 0 && (
                              <div className="space-y-0.5">
                                <div className="text-muted-foreground">Sorgular:</div>
                                {dbg.queries.map((q, i) => (
                                  <div key={i} className="font-mono">
                                    <span className="text-muted-foreground">{i + 1}.</span> {q.q}
                                    <span className="text-muted-foreground"> → {q.pages} sayfa, {q.hits} URL</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {(jobs.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Henüz işlenen iş yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>


        {/* Failed searches */}
        <div className="space-y-2">
          <h4 className="font-semibold">Son Başarısız Aramalar ({(failed.data ?? []).length})</h4>
          <div className="border rounded-lg max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">OEM</th>
                  <th className="text-left px-3 py-2">Marka</th>
                  <th className="text-left px-3 py-2">Sebep</th>
                  <th className="text-left px-3 py-2">Deneme</th>
                  <th className="text-left px-3 py-2">Son</th>
                </tr>
              </thead>
              <tbody>
                {(failed.data ?? []).map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{f.oem}</td>
                    <td className="px-3 py-2">{f.brand ?? "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.reason}</td>
                    <td className="px-3 py-2">{f.attempt_count}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(f.last_attempt_at).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                ))}
                {(failed.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Başarısız arama yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
