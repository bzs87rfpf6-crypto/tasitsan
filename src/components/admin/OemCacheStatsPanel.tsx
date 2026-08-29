import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, TrendingUp, Clock, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getOemCacheStats } from "@/lib/oem-image-cache.functions";

interface TopRow {
  id: string;
  oem: string;
  brand: string | null;
  image_url: string;
  use_count: number;
  last_used_at: string | null;
}

interface Stats {
  total: number;
  added_24h: number;
  total_hits: number;
  hit_rate: number;
  top_used: TopRow[];
}

export function OemCacheStatsPanel() {
  const fn = useServerFn(getOemCacheStats);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fn({});
      setStats(res.stats as unknown as Stats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İstatistik yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4" /> OEM Cache İstatistikleri
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile icon={<ImageIcon className="size-4" />} label="Toplam OEM Görsel" value={stats?.total ?? "-"} />
          <Tile icon={<Clock className="size-4" />} label="Son 24 Saat" value={stats?.added_24h ?? "-"} />
          <Tile icon={<TrendingUp className="size-4" />} label="Toplam Cache Hit" value={stats?.total_hits ?? "-"} />
          <Tile icon={<TrendingUp className="size-4" />} label="Cache Hit Oranı" value={stats ? `%${stats.hit_rate}` : "-"} />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">En çok kullanılan OEM görselleri</h4>
          {!stats || stats.top_used.length === 0 ? (
            <p className="text-xs text-muted-foreground">Henüz kullanım yok.</p>
          ) : (
            <div className="space-y-2">
              {stats.top_used.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded border border-border bg-muted/30">
                  <img
                    src={r.image_url}
                    alt={r.oem}
                    className="size-12 object-cover rounded bg-background flex-shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm truncate">{r.oem}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.brand ?? "—"} · {r.last_used_at ? new Date(r.last_used_at).toLocaleString("tr-TR") : "—"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-gold">{r.use_count}</p>
                    <p className="text-[10px] text-muted-foreground">kullanım</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          OEM görselleri toplu taranmaz. Ürün sayfası açıldığında havuzda varsa cache'ten gösterilir,
          yoksa Firecrawl ile aranıp havuza eklenir. Aynı OEM tekrar görüntülendiğinde internete çıkılmaz.
        </p>
      </CardContent>
    </Card>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}
