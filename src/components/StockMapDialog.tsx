import { useState } from "react";
import { Search, Loader2, MapPin, Package, Users, Tag, TrendingDown, TrendingUp, BarChart3, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getPartTypeMeta } from "@/lib/part-type";

type Row = {
  id: string;
  price: number | null;
  city: string | null;
  stock_quantity: number | null;
  seller_id: string;
  part_type: string | null;
};

type Stats = {
  listings: number;
  totalStock: number;
  sellers: number;
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  byCity: { city: string; count: number; stock: number }[];
  byType: { type: string; count: number }[];
};

function aggregate(rows: Row[]): Stats {
  const listings = rows.length;
  const totalStock = rows.reduce((s, r) => s + (r.stock_quantity ?? 1), 0);
  const sellers = new Set(rows.map((r) => r.seller_id)).size;
  const prices = rows.map((r) => r.price).filter((p): p is number => typeof p === "number" && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  const cityMap = new Map<string, { count: number; stock: number }>();
  for (const r of rows) {
    const c = (r.city ?? "Belirtilmemiş").trim() || "Belirtilmemiş";
    const cur = cityMap.get(c) ?? { count: 0, stock: 0 };
    cur.count += 1;
    cur.stock += r.stock_quantity ?? 1;
    cityMap.set(c, cur);
  }
  const byCity = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, ...v }))
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 12);

  const typeMap = new Map<string, number>();
  for (const r of rows) {
    const t = r.part_type ?? "unknown";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
  }
  const byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { listings, totalStock, sellers, minPrice, avgPrice, maxPrice, byCity, byType };
}

const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";

export function StockMapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searched, setSearched] = useState(false);

  const reset = () => { setQ(""); setStats(null); setSearched(false); };

  const run = async () => {
    const term = q.trim();
    if (term.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const up = term.toUpperCase();
      // Try OEM normalized RPC first
      const { data: oemRows } = await supabase.rpc("search_parts_by_oem", { _oem: up });
      let rows: Row[] = ((oemRows ?? []) as any[]).map((r) => ({
        id: r.id, price: r.price, city: r.city, stock_quantity: r.stock_quantity,
        seller_id: r.seller_id, part_type: r.part_type,
      }));

      // Always also search title/description for richer results
      const s = term.replace(/,/g, " ");
      const { data: textRows } = await supabase
        .from("parts")
        .select("id,price,city,stock_quantity,seller_id,part_type")
        .eq("status", "approved")
        .or(`title.ilike.%${s}%,description.ilike.%${s}%,oem_code.ilike.%${up}%,oem_codes.cs.{${up}}`)
        .limit(500);
      const seen = new Set(rows.map((r) => r.id));
      for (const r of (textRows ?? []) as Row[]) {
        if (!seen.has(r.id)) { rows.push(r); seen.add(r.id); }
      }
      setStats(aggregate(rows));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🗺️</span> Stok Haritası
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="OEM kodu veya ürün adı"
              className="pl-9 pr-9 h-12"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full grid place-items-center hover:bg-muted">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button onClick={run} disabled={loading || q.trim().length < 2} className="w-full bg-gold-gradient text-gold-foreground font-semibold">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Stok Analizi Yap"}
          </Button>

          {searched && !loading && stats && stats.listings === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Bu sorguyla eşleşen ilan bulunamadı.
            </div>
          )}

          {stats && stats.listings > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Metric icon={<Package className="size-4" />} label="İlan" value={stats.listings} />
                <Metric icon={<BarChart3 className="size-4" />} label="Stok" value={stats.totalStock} />
                <Metric icon={<Users className="size-4" />} label="Satıcı" value={stats.sellers} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PriceCard icon={<TrendingDown className="size-4 text-emerald-400" />} label="En Düşük" value={fmt(stats.minPrice)} />
                <PriceCard icon={<Tag className="size-4 text-gold" />} label="Ortalama" value={fmt(stats.avgPrice)} />
                <PriceCard icon={<TrendingUp className="size-4 text-rose-400" />} label="En Yüksek" value={fmt(stats.maxPrice)} />
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> Şehirlere göre stok
                </p>
                <div className="space-y-1.5">
                  {stats.byCity.map((c) => {
                    const max = stats.byCity[0].stock || 1;
                    const pct = Math.max(6, (c.stock / max) * 100);
                    return (
                      <div key={c.city} className="flex items-center gap-2 text-xs">
                        <span className="w-24 truncate">{c.city}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gold-gradient" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right font-mono text-muted-foreground">
                          {c.stock} ad · {c.count} ilan
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Orijinal / Eşdeğer Dağılımı
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.byType.map((t) => {
                    const meta = getPartTypeMeta(t.type);
                    const cls = meta?.badgeClass ?? "bg-muted text-muted-foreground border-border";
                    const label = meta?.label ?? "BELİRSİZ";
                    return (
                      <span key={t.type} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${cls}`}>
                        {meta?.emoji} {label} · {t.count}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-display text-2xl text-gold mt-1">{value}</div>
    </div>
  );
}

function PriceCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-mono text-sm sm:text-base font-bold mt-1">{value}</div>
    </div>
  );
}
