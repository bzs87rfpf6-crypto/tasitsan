import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Square, RefreshCw, Globe, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPartmanStats,
  fetchCandidateOems,
  runPartmanImport,
} from "@/lib/partman-importer.functions";

type Stats = {
  today_count: number;
  total_count: number;
  daily_limit: number;
  remaining_today: number;
  parts_without_photo: number;
  cross_refs_total: number;
  bucket: string;
  batch_size: number;
};

type RunItem = {
  oem: string;
  oem_normalized: string;
  status:
    | "saved" | "in_library" | "not_found" | "invalid_oem"
    | "no_image" | "mirror_failed" | "db_failed";
  product_url?: string;
  image_url?: string;
  product_name?: string | null;
  brand?: string | null;
  model?: string | null;
  year_range?: string | null;
  category?: string | null;
  alt_codes?: string[];
  cross_refs_saved?: number;
  error?: string;
};

type Counters = {
  processed: number;
  saved: number;
  in_library: number;
  not_found: number;
  no_image: number;
  invalid_oem: number;
  mirror_failed: number;
  db_failed: number;
  cross_refs: number;
};

const EMPTY: Counters = {
  processed: 0, saved: 0, in_library: 0, not_found: 0,
  no_image: 0, invalid_oem: 0, mirror_failed: 0, db_failed: 0, cross_refs: 0,
};

export function PartmanImporterPanel() {
  const statsFn = useServerFn(getPartmanStats);
  const fetchFn = useServerFn(fetchCandidateOems);
  const runFn = useServerFn(runPartmanImport);

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [oemText, setOemText] = useState("");
  const [target, setTarget] = useState(500);
  const [running, setRunning] = useState(false);
  const [counters, setCounters] = useState<Counters>(EMPTY);
  const [recent, setRecent] = useState<RunItem[]>([]);
  const stopRef = useRef(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try { setStats((await statsFn()) as Stats); }
    catch (e) { toast.error(e instanceof Error ? e.message : "İstatistik alınamadı"); }
    finally { setStatsLoading(false); }
  };

  useEffect(() => { loadStats(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function parseOems(text: string): string[] {
    return Array.from(new Set(
      text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 4),
    ));
  }

  async function nextBatch(remainingTarget: number, queue: string[]): Promise<string[]> {
    if (queue.length > 0) return queue.splice(0, Math.min(25, remainingTarget));
    // Auto-mode: parts'tan aday çek
    const res = (await fetchFn({ data: { limit: 25 } })) as { oems: string[] };
    return res.oems.slice(0, remainingTarget);
  }

  const handleStart = async () => {
    if (!stats) { toast.error("İstatistikler henüz yüklenmedi."); return; }
    if (stats.remaining_today <= 0) { toast.error("Günlük limit doldu."); return; }
    const cap = Math.min(target, stats.remaining_today);
    const manualQueue = parseOems(oemText);
    const mode = manualQueue.length > 0 ? "manuel" : "otomatik";
    if (!confirm(`${cap} OEM (${mode}) işlenecek. Devam?`)) return;

    setRunning(true);
    stopRef.current = false;
    setCounters(EMPTY);
    setRecent([]);

    let totalProcessed = 0;
    let totalSaved = 0;
    const local = { ...EMPTY };

    try {
      while (!stopRef.current && totalProcessed < cap) {
        const remaining = cap - totalProcessed;
        const batch = await nextBatch(remaining, manualQueue);
        if (batch.length === 0) {
          toast.info("İşlenecek aday OEM kalmadı.");
          break;
        }
        const res = (await runFn({ data: { oems: batch } })) as {
          ok: boolean; saved: number; processed: number; items: RunItem[];
          remaining: number; cross_refs_saved?: number; error?: string;
        };
        if (res.ok === false) {
          toast.error(res.error ?? "Limit doldu");
          break;
        }
        totalProcessed += res.processed;
        totalSaved += res.saved;
        for (const it of res.items) {
          local.processed++;
          local[it.status as keyof Counters] = (local[it.status as keyof Counters] ?? 0) + 1;
          local.cross_refs += it.cross_refs_saved ?? 0;
        }
        setCounters({ ...local });
        setRecent((prev) => [...res.items, ...prev].slice(0, 100));
        if (res.remaining <= 0) {
          toast.warning("Günlük limit doldu.");
          break;
        }
      }
      toast.success(`Bitti: ${totalSaved} görsel + ${local.cross_refs} çapraz ref. (${totalProcessed} OEM)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Çalışma hatası");
    } finally {
      setRunning(false);
      loadStats();
    }
  };

  const progressPct = useMemo(() => {
    if (!stats) return 0;
    return Math.min(100, Math.round((stats.today_count / stats.daily_limit) * 100));
  }, [stats]);

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4" /> Partman.gr OEM Görsel Aktarıcı
          <Badge variant="outline" className="ml-2">partman.gr</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Günlük Kullanım</div>
            <Button type="button" variant="ghost" size="sm" onClick={loadStats} disabled={statsLoading}>
              {statsLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              <span className="ml-1 text-xs">Yenile</span>
            </Button>
          </div>
          {stats ? (
            <>
              <Progress value={progressPct} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <Stat label="Bugün eklenen" value={stats.today_count.toLocaleString("tr-TR")} />
                <Stat label="Günlük limit" value={stats.daily_limit.toLocaleString("tr-TR")} />
                <Stat label="Kalan" value={stats.remaining_today.toLocaleString("tr-TR")} />
                <Stat label="Toplam (partman)" value={stats.total_count.toLocaleString("tr-TR")} />
                <Stat label="Görselsiz OEM'li parça" value={stats.parts_without_photo.toLocaleString("tr-TR")} />
                <Stat label="Çapraz ref. toplam" value={stats.cross_refs_total.toLocaleString("tr-TR")} />
                <Stat label="Batch" value={stats.batch_size} />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Yükleniyor…</div>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Kaynak önceliği: <strong>1) OEM Havuzu</strong> → <strong>2) Partman.gr</strong>.
          Havuzda olan OEM tekrar indirilmez. (Bayram Oto / İnternet araması ayrı panellerden çalışır.)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">OEM listesi (boşsa otomatik mod: parts tablosundan görselsiz OEM'ler)</Label>
            <Textarea
              rows={4}
              placeholder={"Her satıra bir OEM\n8200416836\nA1648200185\n..."}
              value={oemText}
              onChange={(e) => setOemText(e.target.value)}
              disabled={running}
            />
          </div>
          <div>
            <Label htmlFor="pm-target" className="text-xs">Hedef OEM sayısı (≤ 5000)</Label>
            <Input
              id="pm-target" type="number" min={1} max={5000}
              value={target}
              onChange={(e) => setTarget(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
              disabled={running}
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              {oemText.trim().length > 0 ? `Manuel: ${parseOems(oemText).length} OEM` : "Otomatik mod"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!running ? (
            <Button onClick={handleStart} size="sm">
              <Play className="size-4" /><span className="ml-1">Başlat</span>
            </Button>
          ) : (
            <Button onClick={() => { stopRef.current = true; }} variant="destructive" size="sm">
              <Square className="size-4" /><span className="ml-1">Durdur</span>
            </Button>
          )}
          <Button
            variant="outline" size="sm" disabled={running}
            onClick={async () => {
              const res = (await fetchFn({ data: { limit: 25 } })) as { oems: string[] };
              setOemText(res.oems.join("\n"));
              toast.success(`${res.oems.length} aday OEM yüklendi`);
            }}
          >
            <Wand2 className="size-4" /><span className="ml-1">Aday OEM'leri Doldur</span>
          </Button>
        </div>

        {(counters.processed > 0 || running) && (
          <div className="pt-2 border-t space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="İşlenen" value={counters.processed} />
              <Stat label="Kaydedildi" value={counters.saved} />
              <Stat label="Havuzda" value={counters.in_library} />
              <Stat label="Bulunamadı" value={counters.not_found} />
              <Stat label="Görsel yok" value={counters.no_image} />
              <Stat label="Geçersiz OEM" value={counters.invalid_oem} />
              <Stat label="Mirror hata" value={counters.mirror_failed} />
              <Stat label="DB hata" value={counters.db_failed} />
              <Stat label="Çapraz ref." value={counters.cross_refs} />
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs font-medium mb-1">Son sonuçlar</div>
            <div className="max-h-64 overflow-y-auto rounded border divide-y text-xs">
              {recent.slice(0, 50).map((it, i) => (
                <div key={i} className="p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        it.status === "saved" ? "default" :
                        it.status === "in_library" ? "secondary" :
                        it.status === "not_found" ? "outline" : "destructive"
                      }
                      className="shrink-0"
                    >
                      {it.status}
                    </Badge>
                    <code className="shrink-0 font-mono">{it.oem}</code>
                    {it.product_url && (
                      <a href={it.product_url} target="_blank" rel="noopener noreferrer"
                        className="truncate text-muted-foreground hover:underline">
                        {it.product_url.replace("https://partman.gr", "")}
                      </a>
                    )}
                    {it.image_url && (
                      <img src={it.image_url} alt="" className="ml-auto h-8 w-8 object-cover rounded" loading="lazy" />
                    )}
                  </div>
                  {(it.product_name || it.brand || it.model || it.year_range || it.category) && (
                    <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                      {it.product_name && <span className="truncate max-w-[280px]">📦 {it.product_name}</span>}
                      {it.brand && <Badge variant="outline" className="text-[10px] py-0">🏷 {it.brand}</Badge>}
                      {it.model && <Badge variant="outline" className="text-[10px] py-0">🚗 {it.model}</Badge>}
                      {it.year_range && <Badge variant="outline" className="text-[10px] py-0">📅 {it.year_range}</Badge>}
                      {it.category && <Badge variant="outline" className="text-[10px] py-0">📂 {it.category}</Badge>}
                    </div>
                  )}
                  {it.alt_codes && it.alt_codes.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      <span className="text-muted-foreground">↔ {it.cross_refs_saved ?? 0} eşdeğer:</span>
                      {it.alt_codes.slice(0, 6).map((c) => (
                        <code key={c} className="px-1 rounded bg-muted font-mono">{c}</code>
                      ))}
                      {it.alt_codes.length > 6 && <span className="text-muted-foreground">+{it.alt_codes.length - 6}</span>}
                    </div>
                  )}
                  {it.error && <div className="text-destructive truncate text-[11px]">{it.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
