import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildPartParam } from "@/lib/part-slug";
import { Link2 } from "lucide-react";

interface RelatedPart {
  id: string;
  title: string;
  seo_slug: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  price: number | null;
  city: string | null;
}

export function RelatedLinks({ partId }: { partId: string }) {
  const [items, setItems] = useState<RelatedPart[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("related_parts_for", { _id: partId, _limit: 12 }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn("[related] failed", error); return; }
      setItems((data ?? []) as RelatedPart[]);
    });
    return () => { cancelled = true; };
  }, [partId]);

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-gold" />
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">İlgili Ürünler ve Bağlantılar</h2>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              to="/parts/$id"
              params={{ id: buildPartParam(p) }}
              className="flex items-baseline justify-between gap-3 px-2 py-1.5 rounded hover:bg-background/60 transition"
            >
              <span className="truncate">
                {p.oem_code && <span className="font-mono text-xs text-gold mr-1.5">{p.oem_code}</span>}
                <span className="hover:text-gold">{p.title}</span>
                {(p.brand || p.model) && (
                  <span className="text-muted-foreground text-xs ml-1">
                    — {[p.brand, p.model, p.year].filter(Boolean).join(" ")}
                  </span>
                )}
              </span>
              {p.price != null && (
                <span className="font-display text-xs text-gold whitespace-nowrap">
                  ₺{Number(p.price).toLocaleString("tr-TR")}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
