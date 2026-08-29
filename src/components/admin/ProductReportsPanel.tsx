import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import { RefreshCw, Eye, Store, Search as SearchIcon, CalendarClock, CalendarDays, Clock, CheckCircle2 } from "lucide-react";

interface Counts { last_24h: number; last_7d: number; pending: number; approved: number }
interface MostViewed { id: string; title: string; brand: string | null; model: string | null; view_count: number }
interface ActiveSeller { seller_id: string; display_name: string | null; active_parts: number }
interface TopOem { oem: string; search_count: number }
interface Reports { counts: Counts; most_viewed: MostViewed[]; active_sellers: ActiveSeller[]; top_oems: TopOem[] }

const fmt = (n: number) => (n ?? 0).toLocaleString("tr-TR");

export function ProductReportsPanel() {
  const [data, setData] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data: r, error } = await (supabase as any).rpc("admin_product_reports");
    if (error) setErr(translateError(error));
    else setData(r as Reports);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base">Ürün Raporları</h2>
          <p className="text-[11px] text-muted-foreground">Son ürün ekleme, görüntüleme ve OEM arama istatistikleri</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
        </button>
      </header>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card icon={<CalendarClock className="size-3.5" />} label="Son 24 Saat" value={data?.counts.last_24h} accent="text-emerald-400" />
        <Card icon={<CalendarDays className="size-3.5" />} label="Son 7 Gün" value={data?.counts.last_7d} accent="text-gold" />
        <Card icon={<Clock className="size-3.5" />} label="Bekleyen" value={data?.counts.pending} accent="text-amber-400" />
        <Card icon={<CheckCircle2 className="size-3.5" />} label="Onaylanan" value={data?.counts.approved} accent="text-emerald-300" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <List icon={<Eye className="size-3.5" />} title="En Çok Görüntülenen (30g)">
          {(data?.most_viewed ?? []).map((p) => (
            <Row key={p.id} primary={p.title} secondary={[p.brand, p.model].filter(Boolean).join(" • ")} value={fmt(p.view_count)} />
          ))}
        </List>
        <List icon={<Store className="size-3.5" />} title="En Aktif Firmalar">
          {(data?.active_sellers ?? []).map((s) => (
            <Row key={s.seller_id} primary={s.display_name ?? "—"} value={`${fmt(s.active_parts)} ürün`} />
          ))}
        </List>
        <List icon={<SearchIcon className="size-3.5" />} title="En Çok Aranan OEM (30g)">
          {(data?.top_oems ?? []).map((o) => (
            <Row key={o.oem} primary={o.oem} mono value={fmt(o.search_count)} />
          ))}
        </List>
      </div>
    </section>
  );
}

function Card({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value?: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 font-display text-2xl ${accent ?? "text-gold"}`}>{value == null ? "…" : fmt(value)}</div>
    </div>
  );
}
function List({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{icon}{title}</div>
      <ul className="divide-y divide-border/60 text-xs">{children}</ul>
    </div>
  );
}
function Row({ primary, secondary, value, mono }: { primary: string; secondary?: string; value: string; mono?: boolean }) {
  return (
    <li className="py-1.5 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className={`truncate ${mono ? "font-mono" : ""}`}>{primary}</p>
        {secondary && <p className="text-[10px] text-muted-foreground truncate">{secondary}</p>}
      </div>
      <span className="text-gold font-semibold shrink-0">{value}</span>
    </li>
  );
}
