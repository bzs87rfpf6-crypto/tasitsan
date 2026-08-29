import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProductStats, type ProductStats } from "@/lib/bulk-approve.functions";
import { translateError } from "@/lib/error-messages";
import { Package, CheckCircle2, Clock, XCircle, Copy, RefreshCw, Truck, Bus, Flame } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function ProductStatsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const fetchStats = useServerFn(getProductStats);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setStats(await fetchStats());
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-display text-base">Ürün İstatistikleri</h2>
          <p className="text-[11px] text-muted-foreground">
            {stats ? `Son güncelleme: ${new Date(stats.fetchedAt).toLocaleTimeString("tr-TR")}` : "Veritabanından canlı çekiliyor"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
        </button>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card icon={<Package className="size-3.5" />} label="Toplam" value={stats ? fmt(stats.total) : "…"} />
        <Card icon={<CheckCircle2 className="size-3.5" />} label="Aktif" value={stats ? fmt(stats.active) : "…"} tone="ok" />
        <Card icon={<Clock className="size-3.5" />} label="Bekleyen" value={stats ? fmt(stats.pending) : "…"} tone={stats && stats.pending ? "warn" : undefined} />
        <Card icon={<XCircle className="size-3.5" />} label="Reddedilen" value={stats ? fmt(stats.rejected) : "…"} />
        <Card
          icon={<Copy className="size-3.5" />}
          label="Mükerrer"
          value={stats ? fmt(stats.duplicates) : "…"}
          tone={stats && stats.duplicates ? "warn" : undefined}
          hint={stats ? `${fmt(stats.duplicateGroups)} OEM grubunda` : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <Card icon={<Truck className="size-3.5" />} label="Aynı Gün Kargo" value={stats ? fmt(stats.deliverySameDay) : "…"} tone="ok" />
        <Card icon={<Bus className="size-3.5" />} label="Otobüs Kargo" value={stats ? fmt(stats.deliveryBus) : "…"} tone="ok" />
        <Card icon={<Flame className="size-3.5" />} label="Acil Teslim" value={stats ? fmt(stats.urgentDelivery) : "…"} tone="warn" />
      </div>
    </section>
  );
}

function Card({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-400" : "text-gold";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
