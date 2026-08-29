import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Rocket, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import {
  getSeoIndexPending, getSeoIndexBoostStats, syncGscIndexStates, runSeoIndexBoost,
  type IndexPendingRow,
} from "@/lib/seo-index-boost.functions";

type Filter = "pending" | "not_indexed" | "low_score" | "indexed" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "pending", label: "Bekleyenler" },
  { id: "not_indexed", label: "Dizine Eklenmedi" },
  { id: "low_score", label: "Puan < 80" },
  { id: "indexed", label: "Dizine Eklendi" },
  { id: "all", label: "Tümü" },
];

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  indexed: { text: "Dizine eklendi", cls: "bg-emerald-500/15 text-emerald-500" },
  crawled_not_indexed: { text: "Tarandı, dizine eklenmedi", cls: "bg-amber-500/15 text-amber-500" },
  discovered_not_indexed: { text: "Keşfedildi, taranmadı", cls: "bg-amber-500/15 text-amber-500" },
  excluded: { text: "Hariç tutuldu", cls: "bg-destructive/15 text-destructive" },
  error: { text: "Hata", cls: "bg-destructive/15 text-destructive" },
  unknown: { text: "Bilinmiyor", cls: "bg-muted text-muted-foreground" },
};

function Flag({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="size-4 text-emerald-500 inline" />
    : <XCircle className="size-4 text-destructive inline" />;
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
}

function suggestion(r: IndexPendingRow): string {
  if (!r.canonical_ok) return "Slug/canonical üret, sonra IndexNow gönder";
  if (!r.has_meta) return "Meta başlık ve açıklama oluştur";
  if (r.internal_links_count < 6) return "İç link sayısını artır (OEM + benzer ürün)";
  if (!r.schema_ok) return "Product schema alanlarını (marka/OEM) tamamla";
  if (r.score < 80) return "İçeriği AI ile zenginleştir ve yeniden gönder";
  if (r.index_state !== "indexed") return "IndexNow ile yeniden tarama iste";
  return "Aksiyon gerekmiyor";
}

export function SeoIndexBoostPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");

  const stats = useQuery({ queryKey: ["seo-boost-stats"], queryFn: () => getSeoIndexBoostStats() });
  const list = useQuery({
    queryKey: ["seo-index-pending", filter],
    queryFn: () => getSeoIndexPending({ data: { filter, limit: 100, offset: 0 } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["seo-index-pending"] });
    qc.invalidateQueries({ queryKey: ["seo-boost-stats"] });
  };

  const sync = useMutation({
    mutationFn: () => syncGscIndexStates({ data: { limit: 20 } }),
    onSuccess: (r: any) => {
      if (r.selection_required) toast.error(`Birden fazla Search Console property bulundu: ${r.candidates.join(", ")}`);
      else toast.success(`${r.updated.length} ürünün indeks durumu güncellendi.`);
      invalidate();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const boost = useMutation({
    mutationFn: (partIds?: string[]) => runSeoIndexBoost({ data: partIds ? { partIds, limit: partIds.length } : { limit: 10 } }),
    onSuccess: (r) => {
      toast.success(`${r.processed} ürün güçlendirildi. Kuyrukta ${r.remaining} ürün kaldı.`);
      invalidate();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const rows = list.data?.rows ?? [];
  const s = stats.data;

  return (
    <Card className="p-4 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold">SEO Index Boost 2.0</div>
          <h2 className="font-display text-lg">Google İndeks Bekleyen Ürünler</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Google durumunu çek
          </Button>
          <Button size="sm" onClick={() => boost.mutate(undefined)} disabled={boost.isPending}>
            {boost.isPending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Kuyruğu güçlendir (10)
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          ["İyileştirme kuyruğu", s?.boost_queue],
          ["Dizine eklenmedi", s?.not_indexed],
          ["Dizine eklendi", s?.indexed],
          ["GSC kontrol edildi", s?.gsc_checked],
          ["Güçlendirilen", s?.boosted],
        ].map(([label, v]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-display text-lg">{v ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="size-4 animate-spin" /> Liste yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">Bu filtrede ürün yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-3 font-medium">Ürün</th>
                <th className="py-2 px-2 font-medium">Son crawl</th>
                <th className="py-2 px-2 font-medium">İndeks</th>
                <th className="py-2 px-2 font-medium">Puan</th>
                <th className="py-2 px-2 font-medium">İç link</th>
                <th className="py-2 px-2 font-medium">Canon.</th>
                <th className="py-2 px-2 font-medium">Schema</th>
                <th className="py-2 px-2 font-medium">Meta</th>
                <th className="py-2 px-2 font-medium">Öneri</th>
                <th className="py-2 pl-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATE_LABEL[r.index_state] ?? STATE_LABEL.unknown;
                return (
                  <tr key={r.part_id} className="border-b border-border/50 align-middle">
                    <td className="py-2 pr-3 max-w-[220px]">
                      <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline line-clamp-2">
                        {r.title}
                      </a>
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{fmt(r.last_crawl_at)}</td>
                    <td className="py-2 px-2"><Badge className={`${st.cls} border-0 whitespace-nowrap`}>{st.text}</Badge></td>
                    <td className={`py-2 px-2 font-semibold ${r.score >= 80 ? "text-emerald-500" : r.score >= 55 ? "text-amber-500" : "text-destructive"}`}>
                      {r.score}
                    </td>
                    <td className={`py-2 px-2 ${r.internal_links_count < 6 ? "text-amber-500" : ""}`}>{r.internal_links_count}</td>
                    <td className="py-2 px-2"><Flag ok={r.canonical_ok} /></td>
                    <td className="py-2 px-2"><Flag ok={r.schema_ok} /></td>
                    <td className="py-2 px-2"><Flag ok={r.has_meta} /></td>
                    <td className="py-2 px-2 text-muted-foreground max-w-[220px]">{suggestion(r)}</td>
                    <td className="py-2 pl-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => boost.mutate([r.part_id])} disabled={boost.isPending}>
                        <Rocket className="size-3.5" /> Düzelt
                      </Button>
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex p-2 text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
