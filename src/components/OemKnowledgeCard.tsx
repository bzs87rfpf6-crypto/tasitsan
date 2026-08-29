// Faz 4/2 — OEM Bilgi Kartı UI
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOemCard, type OemCard } from "@/lib/oem-card.functions";
import { Cpu, Car, Layers, ShieldCheck, Package, Copy } from "lucide-react";
import { toast } from "sonner";

export function OemKnowledgeCard({ oem }: { oem: string }) {
  const run = useServerFn(getOemCard);
  const [d, setD] = useState<OemCard | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    run({ data: { oem } }).then((r) => { if (!cancelled) setD(r); })
      .catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true };
  }, [oem, run]);

  if (loading) return <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">OEM bilgi kartı yükleniyor…</div>;
  if (!d) return null;

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-card p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-2 flex-wrap">
        <Cpu className="size-4 text-primary mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { navigator.clipboard?.writeText(d.oem); toast.success("OEM kopyalandı"); }}
              className="font-mono text-sm font-bold text-primary hover:underline inline-flex items-center gap-1"
              title="Kopyala"
            >
              {d.oem} <Copy className="size-3" />
            </button>
            {d.verified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                <ShieldCheck className="size-3" /> Doğrulanmış
              </span>
            )}
            {d.available_products > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                <Package className="size-3" /> {d.available_products} ürün
              </span>
            )}
          </div>
          {d.part_name && <div className="text-sm mt-0.5">{d.part_name}</div>}
          {d.category && <div className="text-[11px] text-muted-foreground">{d.category}</div>}
        </div>
      </div>

      {d.compatible_vehicles.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-1">
            <Car className="size-3" /> Uyumlu Araçlar
          </div>
          <div className="flex flex-wrap gap-1">
            {d.compatible_vehicles.slice(0, 8).map((v, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border">
                {[v.brand, v.model, v.year_from && `${v.year_from}${v.year_to ? `-${v.year_to}` : "+"}`, v.engine].filter(Boolean).join(" · ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {d.alternative_oems.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-1">
            <Layers className="size-3" /> Alternatif OEM
          </div>
          <div className="flex flex-wrap gap-1">
            {d.alternative_oems.slice(0, 12).map((o) => (
              <span key={o} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-background border border-border">{o}</span>
            ))}
          </div>
        </div>
      )}

      {d.equivalent_brands.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Eşdeğer Markalar</div>
          <div className="flex flex-wrap gap-1">
            {d.equivalent_brands.slice(0, 10).map((b) => (
              <span key={b} className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 border border-sky-500/30">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
