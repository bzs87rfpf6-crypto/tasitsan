import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSystemHealth } from "@/lib/system-health.functions";
import { Database, HardDrive, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Health = Awaited<ReturnType<typeof getSystemHealth>>;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export function SystemHealthPanel() {
  const fetchHealth = useServerFn(getSystemHealth);
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchHealth();
      setData(res);
    } catch (e: any) {
      setErr(e?.message ?? "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg">Yedekleme & Sistem Sağlığı</h2>
          <p className="text-xs text-muted-foreground">
            {data?.selfhost ? "Self-host yedekleme durumu" : "Otomatik yedekleme"} + kritik veri özeti
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {/* Backup status card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">Otomatik Yedekleme</h3>
              {data?.selfhost ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-semibold">
                  <AlertTriangle className="w-3 h-3" /> Operatör sorumluluğunda
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Aktif
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.backup.note ?? "Yedekleme durumu yükleniyor…"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
          <Field label="Sağlayıcı" value={data?.backup.provider ?? "—"} />
          <Field label="Sıklık" value={data ? (data.backup.frequency === "daily" ? "Günlük" : "Manuel") : "—"} />
          <Field
            label="Saklama"
            value={data ? (data.backup.retentionDays > 0 ? `${data.backup.retentionDays} gün` : "Operatör tanımlı") : "—"}
          />
          <Field label="Lokasyon" value={data ? (data.backup.offsite ? "Farklı bölge" : "Sunucu tanımlı") : "—"} />
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t border-border flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>RPO ~24 sa</strong> (en fazla 1 günlük veri kaybı) ·{" "}
            <strong>RTO ~1 sa</strong> (geri yükleme süresi).{" "}
            {data?.selfhost
              ? "Self-host'ta geri yükleme, Supabase proje yedeklerinden veya sunucudaki pg_dump arşivinden yapılır."
              : "Geri yükleme talebi için yönetilen bulut panelini kullanın."}
          </span>
        </div>
      </div>

      {/* Latest write */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Son veritabanı yazımı</p>
            <p className="font-semibold">
              {data?.latestWrite ? `${timeAgo(data.latestWrite)} · ${fmtDate(data.latestWrite)}` : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">Dosya Depolama</p>
            <p className="text-xs text-muted-foreground">
              {data?.selfhost ? "Supabase Storage (self-host yapılandırması)" : "Otomatik replikalı"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parça fotoğrafları (ilk 1000)" value={data ? `${data.storage.partPhotos}` : "—"} />
          <Field label="Avatarlar (ilk 1000)" value={data ? `${data.storage.avatars}` : "—"} />
        </div>
      </div>

      {/* Critical tables */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Kritik Tablolar</h3>
          <p className="text-xs text-muted-foreground">
            Toplam {data?.totals.rows.toLocaleString("tr-TR") ?? "—"} kayıt yedekleme kapsamında
          </p>
        </div>
        <div className="divide-y divide-border">
          {data?.tables.map((t) => (
            <div key={t.table} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.label}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{t.table}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums">{t.count.toLocaleString("tr-TR")}</p>
                <p className="text-[11px] text-muted-foreground">son: {timeAgo(t.latest)}</p>
              </div>
            </div>
          ))}
          {!data && (
            <div className="p-6 text-center text-sm text-muted-foreground">Yükleniyor…</div>
          )}
        </div>
      </div>

      {data && !data.serviceRole && (
        <p className="text-[11px] text-amber-500 text-center">
          Yönetici (service-role) anahtarı tanımlı değil — sayımlar RLS kurallarıyla sınırlı olabilir.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Son güncelleme: {data ? fmtDate(data.generatedAt) : "—"}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-0.5 truncate">{value}</p>
    </div>
  );
}
