import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SafePartImage } from "@/components/SafePartImage";

interface Equivalent {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  condition: string;
  oem_code: string | null;
}

export function EquivalentParts({ partId }: { partId: string }) {
  const [items, setItems] = useState<Equivalent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("find_equivalent_parts", {
        _part_id: partId,
        _limit: 12,
      });
      if (cancelled) return;
      if (error) {
        console.warn("[equivalent-parts] rpc failed:", error);
        setItems([]);
        return;
      }
      setItems((data ?? []) as Equivalent[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [partId]);

  if (items === null || items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-gold" />
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">
          Bu OEM numarasına sahip diğer parçalar
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((p) => (
          <Link
            key={p.id}
            to="/parts/$id"
            params={{ id: p.id }}
            className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-gold transition-colors"
          >
            <div className="aspect-square bg-secondary relative overflow-hidden">
              <SafePartImage
                images={p.photos}
                alt={p.title}
                width={320}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="p-2 space-y-1">
              <h3 className="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]">{p.title}</h3>
              {(p.brand || p.model) && (
                <p className="text-[10px] text-muted-foreground line-clamp-1">
                  {[p.brand, p.model, p.year].filter(Boolean).join(" • ")}
                </p>
              )}
              {p.oem_code && (
                <p className="text-[10px] text-muted-foreground/80 font-mono truncate">OEM: {p.oem_code}</p>
              )}
              <div className="text-gold font-display text-sm tracking-wider">
                {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
