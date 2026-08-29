import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Eye, Globe, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import {
  previewBayramotoImport,
  runBayramotoImport,
  getOemLibraryStats,
} from "@/lib/bayramoto-importer.functions";


type ItemStatus = "accept" | "reject_score" | "reject_oem" | "reject_no_image";

type Item = {
  oem: string;
  brand: string | null;
  title: string;
  url: string;
  main_image: string | null;
  main_score: number;
  extra_images: number;
  oem_valid: boolean;
  status: ItemStatus;
};

type PreviewResp = {
  domain: string;
  min_score: number;
  duration_ms: number;
  pages_scanned: number;
  products_seen: number;
  products_with_oem: number;
  products_with_image: number;
  products_with_oem_and_image: number;
  total_images_found: number;
  score_buckets: { s80: number; s60: number; s40: number; s0: number };
  true_success_count: number;
  true_success_rate: number;
  importable_count: number;
  items: Item[];
};

type ImportResp = {
  domain: string;
  duration_ms: number;
  pages_scanned: number;
  products_seen: number;
  products_processed: number;
  rows_saved: number;
  images_mirrored: number;
  images_mirror_failed: number;
  products_skipped_no_image: number;
  products_skipped_invalid_oem: number;
  products_skipped_low_score: number;
  images_skipped_bad: number;
  min_score: number;
  errors: string[];
  next_page: number;
};

type LibStats = {
  total_images: number;
  verified_images: number;
  distinct_oem: number;
  parts_with_oem: number;
  parts_without_photo: number;
  matched_parts: number | null;
  bucket: string;
};


type Filter = "all" | "high" | "low" | "no_image" | "pending";

export function BayramotoImporterPanel() {
  const previewFn = useServerFn(previewBayramotoImport);
  const runFn = useServerFn(runBayramotoImport);
  const statsFn = useServerFn(getOemLibraryStats);

  const [limit, setLimit] = useState(100);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [imp, setImp] = useState<ImportResp | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [stats, setStats] = useState<LibStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = (await statsFn()) as LibStats;
      setStats(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İstatistik alınamadı");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handlePreview = async () => {
    setLoading("preview");
    setPreview(null);
    setImp(null);
    try {
      const res = (await previewFn({ data: { limit, page } })) as PreviewResp;
      setPreview(res);
      toast.success(
        `${res.products_seen} ürün · ${res.importable_count}/${res.products_with_oem} içe aktarılabilir (skor ≥ ${(res.min_score * 100).toFixed(0)}%)`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Önizleme başarısız");
    } finally {
      setLoading(null);
    }
  };

  const handleImport = async () => {
    if (!preview) {
      toast.error("Önce önizleme yapın.");
      return;
    }
    if (preview.importable_count === 0) {
      toast.error("İçe aktarılabilir kayıt yok (skor < %50).");
      return;
    }
    if (!confirm(
      `${preview.importable_count} kayıt OEM havuzuna aktarılacak (skor ≥ ${(preview.min_score * 100).toFixed(0)}%). Devam?`,
    )) return;
    setLoading("import");
    setImp(null);
    try {
      const res = (await runFn({ data: { limit, page } })) as ImportResp;
      setImp(res);
      loadStats();

      toast.success(
        `${res.rows_saved} görsel kaydedildi · ${res.products_processed} ürün işlendi`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İçe aktarma başarısız");
    } finally {
      setLoading(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (!preview) return [];
    switch (filter) {
      case "high":
        return preview.items.filter((i) => i.status === "accept");
      case "low":
        return preview.items.filter((i) => i.status === "reject_score");
      case "no_image":
        return preview.items.filter((i) => i.status === "reject_no_image");
      case "pending":
        return preview.items.filter((i) => i.status !== "accept");
      default:
        return preview.items;
    }
  }, [preview, filter]);

  const importDisabled =
    loading !== null || !preview || preview.importable_count === 0;

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4" /> Bayramoto Importer
          <Badge variant="outline" className="ml-2">bayramoto.com.tr</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="size-4" /> OEM Havuz İstatistikleri
            </div>
            <Button
              type="button" variant="ghost" size="sm" onClick={loadStats} disabled={statsLoading}
            >
              {statsLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              <span className="ml-1 text-xs">Yenile</span>
            </Button>
          </div>
          {stats ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <Stat label="Toplam görsel" value={stats.total_images.toLocaleString("tr-TR")} />
              <Stat label="Benzersiz OEM" value={stats.distinct_oem.toLocaleString("tr-TR")} />
              <Stat label="Doğrulanmış" value={stats.verified_images.toLocaleString("tr-TR")} />
              <Stat label="Taşıtsan OEM'li ürün" value={stats.parts_with_oem.toLocaleString("tr-TR")} />
              <Stat
                label="Eşleşen Taşıtsan ürünü"
                value={stats.matched_parts == null ? "—" : stats.matched_parts.toLocaleString("tr-TR")}
              />
              <Stat label="Görselsiz OEM'li ürün" value={stats.parts_without_photo.toLocaleString("tr-TR")} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Yükleniyor…</div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Depo: <code>{stats?.bucket ?? "oem-image-library"}</code> · Görseller bucket'a indirilip kalıcı public URL ile saklanır.
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Sadece <code>bayramoto.com.tr</code> taranır. İçe aktarma yalnızca
          <strong> geçerli OEM + eşleşme skoru ≥ %50</strong> olan kayıtları
          kabul eder. Önce önizle, dağılımı incele, sonra aktar.
        </div>



        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <Label htmlFor="bm-limit" className="text-xs">Ürün sayısı</Label>
            <Input
              id="bm-limit" type="number" min={1} max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            />
          </div>
          <div>
            <Label htmlFor="bm-page" className="text-xs">Başlangıç sayfası</Label>
            <Input
              id="bm-page" type="number" min={1} max={1000}
              value={page}
              onChange={(e) => setPage(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePreview} disabled={loading !== null} variant="outline" size="sm">
            {loading === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            <span className="ml-1">Önizle ({limit} ürün)</span>
          </Button>
          <Button onClick={handleImport} disabled={importDisabled} size="sm">
            {loading === "import" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="ml-1">
              OEM Havuzuna Aktar{preview ? ` (${preview.importable_count})` : ""}
            </span>
          </Button>
        </div>

        {preview && (
          <div className="space-y-3 pt-2 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Süre" value={`${(preview.duration_ms / 1000).toFixed(1)} sn`} />
              <Stat label="Toplam ürün" value={preview.products_seen} />
              <Stat label="OEM bulunan" value={preview.products_with_oem} />
              <Stat label="Görsel bulunan" value={preview.products_with_image} />
              <Stat label="OEM + Görsel" value={preview.products_with_oem_and_image} />
              <Stat label="Toplam görsel" value={preview.total_images_found} />
              <Stat
                label="İçe aktarılabilir"
                value={`${preview.importable_count} / ${preview.products_with_oem}`}
              />
              <Stat
                label="Gerçek başarı"
                value={`${(preview.true_success_rate * 100).toFixed(1)}%`}
              />
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Eşleşme skoru dağılımı (görseli olanlar)</div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <BucketStat label="%80+" value={preview.score_buckets.s80} tone="green" />
                <BucketStat label="%60-79" value={preview.score_buckets.s60} tone="emerald" />
                <BucketStat label="%40-59" value={preview.score_buckets.s40} tone="amber" />
                <BucketStat label="%0-39" value={preview.score_buckets.s0} tone="red" />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              <FilterChip current={filter} value="all" onClick={setFilter}>
                Tümü ({preview.items.length})
              </FilterChip>
              <FilterChip current={filter} value="high" onClick={setFilter}>
                Yüksek güven ({preview.items.filter((i) => i.status === "accept").length})
              </FilterChip>
              <FilterChip current={filter} value="low" onClick={setFilter}>
                Düşük güven ({preview.items.filter((i) => i.status === "reject_score").length})
              </FilterChip>
              <FilterChip current={filter} value="no_image" onClick={setFilter}>
                Görselsiz ({preview.items.filter((i) => i.status === "reject_no_image").length})
              </FilterChip>
              <FilterChip current={filter} value="pending" onClick={setFilter}>
                Onay bekleyen ({preview.items.filter((i) => i.status !== "accept").length})
              </FilterChip>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-1">Görsel</th>
                    <th className="p-1">OEM</th>
                    <th className="p-1">Başlık</th>
                    <th className="p-1">Skor</th>
                    <th className="p-1">Durum</th>
                    <th className="p-1">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((r, i) => {
                    const score = r.main_score ?? 0;
                    const scoreColor =
                      score >= 0.8 ? "text-green-600"
                      : score >= 0.5 ? "text-emerald-600"
                      : score > 0 ? "text-amber-600"
                      : "text-destructive";
                    return (
                      <tr key={i} className="border-t align-top">
                        <td className="p-1">
                          {r.main_image ? (
                            <a href={r.main_image} target="_blank" rel="noreferrer">
                              <img
                                src={r.main_image} alt="" loading="lazy"
                                className="size-14 object-cover rounded border"
                              />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-1 font-mono">
                          {r.oem}
                          {!r.oem_valid && <span className="ml-1 text-destructive">✗</span>}
                          {r.brand && <div className="text-muted-foreground">{r.brand}</div>}
                        </td>
                        <td className="p-1 max-w-[220px]">
                          <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {r.title}
                          </a>
                        </td>
                        <td className={`p-1 font-mono ${scoreColor}`}>
                          {(score * 100).toFixed(0)}%
                        </td>
                        <td className="p-1">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-1 max-w-[240px] truncate">
                          {r.main_image ? (
                            <a
                              href={r.main_image}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:underline break-all"
                            >
                              {r.main_image.split("/").slice(-1)[0]}
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-3 text-center text-muted-foreground">
                        Bu filtrede kayıt yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {imp && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm pt-2 border-t">
            <Stat label="Süre" value={`${(imp.duration_ms / 1000).toFixed(1)} sn`} />
            <Stat label="İşlenen ürün" value={imp.products_processed} />
            <Stat label="Kaydedilen görsel" value={imp.rows_saved} />
            <Stat label="Storage'a indirilen" value={imp.images_mirrored} />
            <Stat label="Storage hata" value={imp.images_mirror_failed} />

            <Stat label="Geçersiz OEM" value={imp.products_skipped_invalid_oem} />
            <Stat label="Görselsiz ürün" value={imp.products_skipped_no_image} />
            <Stat label="Düşük skor (atlandı)" value={imp.products_skipped_low_score} />
            <Stat label="Reddedilen görsel" value={imp.images_skipped_bad} />
            <Stat label="Sonraki sayfa" value={imp.next_page} />
            {imp.errors.length > 0 && (
              <div className="col-span-full text-xs text-destructive">
                Hatalar: {imp.errors.join("; ")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function BucketStat({
  label, value, tone,
}: { label: string; value: number; tone: "green" | "emerald" | "amber" | "red" }) {
  const cls =
    tone === "green" ? "border-green-500/40 text-green-700 dark:text-green-400"
    : tone === "emerald" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
    : tone === "amber" ? "border-amber-500/40 text-amber-700 dark:text-amber-500"
    : "border-destructive/40 text-destructive";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="text-[11px] opacity-75">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function FilterChip({
  current, value, onClick, children,
}: {
  current: Filter; value: Filter;
  onClick: (v: Filter) => void; children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`text-xs rounded-full border px-3 py-1 transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  if (status === "accept") {
    return <Badge className="bg-green-600 hover:bg-green-600">Kabul</Badge>;
  }
  if (status === "reject_score") {
    return <Badge variant="destructive">RED · skor</Badge>;
  }
  if (status === "reject_oem") {
    return <Badge variant="destructive">RED · OEM</Badge>;
  }
  return <Badge variant="outline">Görselsiz</Badge>;
}
