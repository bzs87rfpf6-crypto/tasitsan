import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Package, MapPin } from "lucide-react";
import { listPublicStok, type PublicStokListing } from "@/lib/stok-public.functions";
import type { VehicleClass } from "@/lib/vehicle-class";

export function HomeStokShowcase({ vehicleClass }: { vehicleClass?: VehicleClass }) {
  const [rows, setRows] = useState<PublicStokListing[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    listPublicStok({ data: { limit: 6, vehicleClass: vehicleClass ?? null } })
      .then((d) => { if (alive) setRows(d); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [vehicleClass]);

  if (rows && rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-semibold">Stok Borsası</h2>
          <p className="text-xs text-muted-foreground">Toplu yedek parça stokları — son aktif ilanlar</p>
        </div>
        <Link to="/stok" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
          Tamamını Gör <ArrowRight className="size-3" />
        </Link>
      </div>

      {!rows ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {rows.slice(0, 6).map((l) => (
            <Link key={l.id} to="/stok/$id" params={{ id: l.id }}
              className="bg-card border border-border rounded-xl overflow-hidden hover:border-gold transition-colors">
              {l.cover_image ? (
                <img src={l.cover_image} alt={l.title} loading="lazy"
                  className="w-full aspect-[4/3] object-cover bg-background/40" />
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center bg-background/40">
                  <Package className="size-8 text-muted-foreground opacity-50" />
                </div>
              )}
              <div className="p-2 space-y-1">
                <p className="text-xs font-semibold truncate">{l.title}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                  {l.city && <><MapPin className="size-3 shrink-0" /> {l.city}</>}
                </p>
                {l.expected_price != null && (
                  <p className="text-[11px] text-gold font-bold">₺{Number(l.expected_price).toLocaleString("tr-TR")}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
