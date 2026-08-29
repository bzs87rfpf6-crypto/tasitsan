import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Brain, RefreshCw, TrendingUp, Database, AlertCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { invalidateOemCache } from "@/lib/oem-cache-admin.functions";
import { buildPartParam } from "@/lib/part-slug";

type TopOem = {
  oem: string;
  search_count: number;
  request_count: number;
  sample_title: string | null;
  sample_brand: string | null;
  sample_model: string | null;
  sample_part_id: string | null;
  sample_seo_slug: string | null;
};

type CacheStats = {
  total: number;
  hits_total: number;
  last_24h: number;
};

export function OemIntelligencePanel() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("7d");
  const [rows, setRows] = useState<TopOem[]>([]);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invalidating, setInvalidating] = useState<string | null>(null);
  const invalidate = useServerFn(invalidateOemCache);

  async function invalidatePrefix(prefix: string, label: string) {
    if (!confirm(`'${label}' önbelleğini geçersiz kılmak istediğine emin misin?\nSonraki kullanıcı isteklerinde sonuçlar yeniden hesaplanacak.`)) return;
    setInvalidating(prefix);
    try {
      const res = await invalidate({ data: { prefix } });
      toast.success(`${res.invalidated} kayıt geçersiz kılındı.`);
      void load();
    } catch (e) {
      toast.error(translateError(e, "Geçersiz kılma başarısız"));
    } finally {
      setInvalidating(null);
    }
  }


  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: top, error: topErr }, cacheRes, hitRes, dayRes] = await Promise.all([
        supabase.rpc("top_demand_parts", { _range: range, _limit: 25 }),
        supabase.from("oem_research_cache").select("id", { count: "exact", head: true }),
        supabase.from("oem_research_cache").select("hit_count"),
        supabase
          .from("oem_research_cache")
          .select("id", { count: "exact", head: true })
          .gte("last_hit_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      ]);
      if (topErr) throw topErr;
      setRows((top ?? []) as TopOem[]);
      const total = cacheRes.count ?? 0;
      const hits = (hitRes.data ?? []).reduce((s, r) => s + (r.hit_count ?? 0), 0);
      setStats({ total, hits_total: hits, last_24h: dayRes.count ?? 0 });
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-base inline-flex items-center gap-2">
            <Brain className="size-4 text-gold" /> OEM Zekâ Merkezi
          </h2>
          <p className="text-[11px] text-muted-foreground">
            En çok aranan OEM kodları, talep eşleşmeleri ve AI önbellek istatistikleri
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(["today", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded text-[11px] border ${
                range === r ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-muted"
              }`}
            >
              {r === "today" ? "Bugün" : r === "7d" ? "7 gün" : "30 gün"}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="ml-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive inline-flex items-center gap-1.5">
          <AlertCircle className="size-3.5" /> {err}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={<Database className="size-3.5" />} label="Cache kaydı" value={stats?.total ?? "…"} />
        <Stat icon={<TrendingUp className="size-3.5" />} label="Toplam isabet" value={stats?.hits_total ?? "…"} />
        <Stat icon={<RefreshCw className="size-3.5" />} label="Son 24s isabet" value={stats?.last_24h ?? "…"} />
      </div>

      <div className="mb-4 rounded-lg border border-border/60 bg-background/40 p-2.5 text-[11px]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-semibold text-foreground inline-flex items-center gap-1.5">
              <Trash2 className="size-3.5 text-amber-400" /> Önbellek geçersiz kılma
            </p>
            <p className="text-muted-foreground mt-0.5">
              AI eşdeğer: 30 gün TTL · Görsel arama: 60 gün TTL · Süresi geçenler haftalık otomatik silinir.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => invalidatePrefix("oem:eq:", "AI eşdeğer")}
              disabled={invalidating !== null}
              className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 text-[11px]"
            >
              {invalidating === "oem:eq:" ? "…" : "AI eşdeğer"}
            </button>
            <button
              onClick={() => invalidatePrefix("oem:img:", "Görsel arama")}
              disabled={invalidating !== null}
              className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 text-[11px]"
            >
              {invalidating === "oem:img:" ? "…" : "Görsel arama"}
            </button>
          </div>
        </div>
      </div>


      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">OEM</th>
              <th className="text-right py-2 px-2">Arama</th>
              <th className="text-right py-2 px-2">Talep</th>
              <th className="text-left py-2 px-2">Örnek ürün</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-muted-foreground">
                  Bu dönem için veri yok.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.oem} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-1.5 px-2 font-mono">{r.oem}</td>
                <td className="py-1.5 px-2 text-right font-semibold text-gold">{r.search_count}</td>
                <td className="py-1.5 px-2 text-right">{r.request_count}</td>
                <td className="py-1.5 px-2 text-muted-foreground">
                  {r.sample_part_id ? (
                    <Link to="/parts/$id" params={{ id: buildPartParam({ id: r.sample_part_id, seo_slug: r.sample_seo_slug, title: r.sample_title }) }} className="hover:text-gold truncate inline-block max-w-[280px] align-middle">
                      {r.sample_title ?? "—"}
                      {r.sample_brand && <span className="text-[10px] ml-1">({r.sample_brand} {r.sample_model})</span>}
                    </Link>
                  ) : (
                    <span className="text-amber-400">Stokta yok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 font-display text-xl text-gold">{value}</div>
    </div>
  );
}
