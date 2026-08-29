import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  RefreshCw,
  Play,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { translateError } from "@/lib/error-messages";
import {
  getImageJobsProgress,
  enqueueMissingImages,
  retryFailedImages,
  recentImageJobs,
  runImageWorkerNow,
  topImageDomains,
  type DomainStat,
} from "@/lib/oem-image-jobs.functions";

interface Prog {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  skipped: number;
  total: number;
  avg_ms: number;
  done_1h: number;
  done_24h: number;
  failed_24h: number;
  success_rate: number;
  eta_seconds: number | null;
  total_products: number;
  missing_photos: number;
}
interface Job {
  id: string;
  part_id: string;
  oem_code: string;
  status: string;
  attempts: number;
  last_error: string | null;
  image_url: string | null;
  source: string | null;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  confidence: number | null;
  confidence_band: "low" | "medium" | "high" | "very_high" | null;
  score_breakdown: {
    oem: number;
    brand: number;
    title: number;
    visual: number;
    total: number;
  } | null;
  rejected: boolean;
  rejection_reason: string | null;
}

function fmtSec(s: number | null | undefined) {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} dk`;
  return `${(s / 3600).toFixed(1)} sa`;
}

export function OemImageJobsPanel() {
  const progressFn = useServerFn(getImageJobsProgress);
  const enqueueFn = useServerFn(enqueueMissingImages);
  const retryFn = useServerFn(retryFailedImages);
  const jobsFn = useServerFn(recentImageJobs);
  const runFn = useServerFn(runImageWorkerNow);
  const domainsFn = useServerFn(topImageDomains);

  const [prog, setProg] = useState<Prog | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [domains, setDomains] = useState<DomainStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState<number>(70); // admin varsayılan: 70+
  const [includeRejected, setIncludeRejected] = useState<boolean>(true);

  async function refresh() {
    setLoading(true);
    try {
      const [p, j, d] = await Promise.all([
        progressFn(),
        jobsFn({ data: { minConfidence, includeRejected, limit: 50 } }),
        domainsFn(),
      ]);
      setProg(p.progress as unknown as Prog);
      setJobs(j.jobs as unknown as Job[]);
      setDomains(d.rows);
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minConfidence, includeRejected]);

  async function doEnqueue() {
    setBusy("enqueue");
    try {
      const r = await enqueueFn({ data: { limit: 5000 } });
      toast.success(`${r.enqueued} ürün kuyruğa alındı.`);
      await refresh();
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setBusy(null);
    }
  }
  async function doRetry() {
    setBusy("retry");
    try {
      const r = await retryFn({ data: { maxAttempts: 3 } });
      toast.success(`${r.reset} başarısız iş yeniden kuyruğa alındı.`);
      await refresh();
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setBusy(null);
    }
  }
  async function doRunNow() {
    setBusy("run");
    try {
      const r = await runFn();
      if (r.ok) toast.success("Worker tetiklendi.");
      else toast.error(`Worker yanıtı: ${r.status}`);
      setTimeout(() => {
        void refresh();
      }, 1500);
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setBusy(null);
    }
  }

  const pct = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
  const photoPct =
    prog && prog.total_products > 0
      ? Math.round(((prog.total_products - prog.missing_photos) / prog.total_products) * 100)
      : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-base inline-flex items-center gap-2">
            <ImageIcon className="size-4 text-gold" /> OEM Görsel Bulucu
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Eksik fotoğraflar arka planda OEM kodundan bulunur, Storage'a yazılır ve bir daha
            aranmaz.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Yenile
        </button>
      </header>

      {prog && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card label="Toplam Ürün" value={prog.total_products.toLocaleString("tr-TR")} />
            <Card
              label="Fotoğrafsız"
              value={prog.missing_photos.toLocaleString("tr-TR")}
              cls="text-amber-400"
            />
            <Card
              label="Kuyrukta"
              value={(prog.pending + prog.processing).toLocaleString("tr-TR")}
              cls="text-gold"
            />
            <Card label="Başarı Oranı" value={`%${prog.success_rate}`} cls="text-emerald-400" />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Görsel kapsama: {photoPct}%</span>
              <span>
                {(prog.total_products - prog.missing_photos).toLocaleString("tr-TR")} /{" "}
                {prog.total_products.toLocaleString("tr-TR")}
              </span>
            </div>
            <Progress value={photoPct} className="h-1.5" />
          </div>

          {prog.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Job ilerlemesi: {pct}%</span>
                <span>
                  Tamam: {prog.done} · Hata: {prog.failed} · Bekliyor: {prog.pending} · İşleniyor:{" "}
                  {prog.processing}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <Mini
              label="Ort. süre"
              value={`${(prog.avg_ms / 1000).toFixed(1)}s`}
              icon={<Clock className="size-3" />}
            />
            <Mini
              label="Son 1 saat"
              value={`${prog.done_1h} ✓`}
              icon={<CheckCircle2 className="size-3 text-emerald-400" />}
            />
            <Mini
              label="Son 24 saat"
              value={`${prog.done_24h} ✓ / ${prog.failed_24h} ✕`}
              icon={<CheckCircle2 className="size-3 text-emerald-400" />}
            />
            <Mini
              label="Tahmini bitiş"
              value={fmtSec(prog.eta_seconds)}
              icon={<Clock className="size-3" />}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={doEnqueue}
          disabled={busy !== null}
          className="h-8 px-3 rounded-md text-xs bg-gold-gradient text-gold-foreground font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Eksik fotoları kuyruğa al
        </button>
        <button
          onClick={doRetry}
          disabled={busy !== null}
          className="h-8 px-3 rounded-md text-xs border border-border inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" /> Başarısızları yeniden dene
        </button>
        <button
          onClick={doRunNow}
          disabled={busy !== null}
          className="h-8 px-3 rounded-md text-xs border border-border inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Play className="size-3.5" /> Worker'ı şimdi çalıştır
        </button>
      </div>

      <div className="border-t border-border pt-2 space-y-2">
        <h3 className="font-display text-sm">🏆 En Başarılı Domainler</h3>
        {domains.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Henüz başarılı görsel kaydı yok. Worker ilk başarılı eşleşmeden sonra burada
            listelenecek.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-left border-b border-border text-muted-foreground">
                  <th className="py-1 pr-2">Domain</th>
                  <th className="py-1 pr-2 text-right">Deneme</th>
                  <th className="py-1 pr-2 text-right">Başarı</th>
                  <th className="py-1 pr-2 text-right">Kullanıcıya</th>
                  <th className="py-1 pr-2 text-right">Ort. Güven</th>
                  <th className="py-1 pr-2 text-right">Oran</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.domain} className="border-b border-border/30">
                    <td className="py-1 pr-2 font-mono">{d.domain}</td>
                    <td className="py-1 pr-2 text-right">{d.attempts}</td>
                    <td className="py-1 pr-2 text-right text-emerald-400">{d.successes}</td>
                    <td className="py-1 pr-2 text-right">{d.user_visible}</td>
                    <td className="py-1 pr-2 text-right">
                      {d.avg_confidence != null ? `%${d.avg_confidence}` : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right font-semibold">%{d.success_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Eşik:</span>
          {[
            { v: 0, label: "Tümü" },
            { v: 50, label: "%50+" },
            { v: 70, label: "%70+ (Admin)" },
            { v: 80, label: "%80+ (Kullanıcı)" },
            { v: 90, label: "%90+" },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setMinConfidence(opt.v)}
              className={`px-2 py-0.5 rounded border ${minConfidence === opt.v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {opt.label}
            </button>
          ))}
          <label className="ml-auto inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRejected}
              onChange={(e) => setIncludeRejected(e.target.checked)}
              className="size-3 accent-gold"
            />
            <span className="text-muted-foreground">Reddedilenleri göster</span>
          </label>
        </div>

        <div className="space-y-1 max-h-96 overflow-y-auto">
          {jobs.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              Bu eşikte kayıt yok.
            </p>
          )}
          {jobs.map((j) => (
            <div
              key={j.id}
              className="text-[11px] flex flex-wrap gap-x-2 gap-y-1 border-b border-border/30 pb-1.5 items-center"
            >
              <StatusBadge status={j.status} />
              <ConfidenceBadge
                confidence={j.confidence}
                band={j.confidence_band}
                rejected={j.rejected}
              />
              <span className="font-mono">{j.oem_code}</span>
              {j.score_breakdown && (
                <span
                  className="text-muted-foreground text-[10px]"
                  title="OEM / Marka / Ad / Görsel"
                >
                  ({j.score_breakdown.oem}+{j.score_breakdown.brand}+{j.score_breakdown.title}+
                  {j.score_breakdown.visual})
                </span>
              )}
              <span className="text-muted-foreground">{j.attempts}× deneme</span>
              {j.duration_ms != null && (
                <span className="text-muted-foreground">{(j.duration_ms / 1000).toFixed(1)}s</span>
              )}
              {j.source && <span className="text-muted-foreground">[{j.source}]</span>}
              {j.rejected && j.rejection_reason && (
                <span className="text-amber-400 inline-flex items-center gap-1">
                  <AlertCircle className="size-3" /> {j.rejection_reason.slice(0, 80)}
                </span>
              )}
              {!j.rejected && j.last_error && (
                <span className="text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="size-3" /> {j.last_error.slice(0, 80)}
                </span>
              )}
              {j.image_url && (
                <a
                  href={j.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold underline"
                >
                  görsel
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2 text-center">
      <div className={`font-display text-lg ${cls ?? "text-foreground"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
function Mini({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/30 px-2 py-1.5 inline-flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    done: {
      cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
      icon: <CheckCircle2 className="size-3" />,
    },
    failed: {
      cls: "text-destructive border-destructive/40 bg-destructive/10",
      icon: <XCircle className="size-3" />,
    },
    pending: {
      cls: "text-amber-400 border-amber-500/40 bg-amber-500/10",
      icon: <Clock className="size-3" />,
    },
    processing: {
      cls: "text-gold border-gold/40 bg-gold/10",
      icon: <RefreshCw className="size-3 animate-spin" />,
    },
    skipped: { cls: "text-muted-foreground border-border", icon: null },
  };
  const c = map[status] ?? { cls: "text-muted-foreground border-border", icon: null };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${c.cls}`}
    >
      {c.icon}
      {status}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
  band,
  rejected,
}: {
  confidence: number | null;
  band: "low" | "medium" | "high" | "very_high" | null;
  rejected: boolean;
}) {
  if (confidence == null) {
    return (
      <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground text-[10px]">
        —
      </span>
    );
  }
  const map = {
    very_high: {
      cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
      label: "Çok Yüksek",
    },
    high: { cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5", label: "Yüksek" },
    medium: { cls: "text-amber-400 border-amber-500/40 bg-amber-500/10", label: "Orta" },
    low: { cls: "text-destructive border-destructive/40 bg-destructive/10", label: "Düşük" },
  } as const;
  const c = map[band ?? "low"];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${c.cls} ${rejected ? "line-through opacity-80" : ""}`}
      title={rejected ? "Kullanıcılara gösterilmiyor" : "Güven skoru"}
    >
      %{Math.round(confidence)} · {c.label}
    </span>
  );
}
