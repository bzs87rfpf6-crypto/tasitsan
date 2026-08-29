import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Eye, Wand2, History, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  previewMatchFromBayramoto,
  matchAndUpdateFromBayramoto,
  listMatchLogs,
} from "@/lib/bayramoto-matcher.functions";

type Mode = "missing_only" | "incomplete" | "all";
type Status =
  | "would_update"
  | "skipped_no_oem_match"
  | "skipped_brand"
  | "skipped_low_score"
  | "skipped_no_image"
  | "skipped_has_photos"
  | "error"
  | "updated";

type Item = {
  part_id: string;
  oem: string | null;
  title_part: string;
  brand_part: string | null;
  title_source: string | null;
  brand_source: string | null;
  source_url: string | null;
  main_image: string | null;
  extra_count: number;
  similarity: number;
  status: Status;
  reason: string | null;
};

type PreviewResp = {
  duration_ms: number;
  mode: Mode;
  overwrite: boolean;
  min_similarity: number;
  total: number;
  oem_matched: number;
  brand_matched: number;
  similarity_passed: number;
  image_found: number;
  updatable: number;
  by_status: Record<string, number>;
  items: Item[];
};

type RunResp = {
  duration_ms: number;
  total: number;
  updatable: number;
  updated: number;
  errors: number;
  by_status: Record<string, number>;
  error_messages: string[];
};

type LogRow = {
  id: string;
  part_id: string;
  oem: string;
  brand_part: string | null;
  brand_source: string | null;
  title_part: string | null;
  title_source: string | null;
  similarity: number | null;
  old_image_url: string | null;
  new_image_url: string | null;
  source_url: string | null;
  status: string;
  reason: string | null;
  created_at: string;
};

type Filter = "all" | "updatable" | "low_score" | "brand" | "no_image" | "has_photos" | "no_oem";

export function BayramotoMatcherPanel() {
  const previewFn = useServerFn(previewMatchFromBayramoto);
  const runFn = useServerFn(matchAndUpdateFromBayramoto);
  const logsFn = useServerFn(listMatchLogs);

  const [mode, setMode] = useState<Mode>("missing_only");
  const [limit, setLimit] = useState(100);
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState<"preview" | "run" | "logs" | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [runResult, setRunResult] = useState<RunResp | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const handlePreview = async () => {
    setLoading("preview");
    setPreview(null);
    setRunResult(null);
    try {
      const res = (await previewFn({ data: { mode, limit, overwrite } })) as PreviewResp;
      setPreview(res);
      toast.success(
        `${res.total} parça · ${res.oem_matched} OEM eşleşti · ${res.updatable} güncellenebilir`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Önizleme başarısız");
    } finally {
      setLoading(null);
    }
  };

  const handleRun = async () => {
    if (!preview) {
      toast.error("Önce önizleme yapın.");
      return;
    }
    if (preview.updatable === 0) {
      toast.error("Güncellenebilir kayıt yok.");
      return;
    }
    if (!confirm(`${preview.updatable} ürünün fotoğrafı Bayram Oto görselleriyle güncellenecek. Devam?`)) return;
    setLoading("run");
    setRunResult(null);
    try {
      const res = (await runFn({ data: { mode, limit, overwrite, log_skipped: false } })) as RunResp;
      setRunResult(res);
      toast.success(`${res.updated} ürün güncellendi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Güncelleme başarısız");
    } finally {
      setLoading(null);
    }
  };

  const handleLoadLogs = async () => {
    setLoading("logs");
    try {
      const res = (await logsFn({ data: { limit: 50 } })) as { rows: LogRow[] };
      setLogs(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Log yüklenemedi");
    } finally {
      setLoading(null);
    }
  };

  const filtered = useMemo(() => {
    if (!preview) return [];
    const items = preview.items;
    switch (filter) {
      case "updatable": return items.filter((i) => i.status === "would_update");
      case "low_score": return items.filter((i) => i.status === "skipped_low_score");
      case "brand": return items.filter((i) => i.status === "skipped_brand");
      case "no_image": return items.filter((i) => i.status === "skipped_no_image");
      case "has_photos": return items.filter((i) => i.status === "skipped_has_photos");
      case "no_oem": return items.filter((i) => i.status === "skipped_no_oem_match");
      default: return items;
    }
  }, [preview, filter]);

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="size-4" /> OEM Eşleşme & Görsel Güncelleme
          <Badge variant="outline" className="ml-2">Bayram Oto ↔ Taşıtsan</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Her parça için: <strong>OEM eşleşti + marka uyumlu + başlık benzerliği ≥ %60 + geçerli görsel</strong>
          {" "}olursa <code>parts.photos</code> güncellenir. Aksi halde atlanır ve denetim kaydına yazılır.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Mod</Label>
            <div className="flex gap-1 flex-wrap mt-1">
              {(["missing_only","incomplete","all"] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`text-xs rounded-full border px-3 py-1 ${mode===m?"bg-primary text-primary-foreground border-primary":"hover:bg-muted"}`}>
                  {m === "missing_only" ? "Görselsiz" : m === "incomplete" ? "Eksik görselli" : "Tüm OEM ürünleri"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="bm-match-limit" className="text-xs">Limit</Label>
            <Input id="bm-match-limit" type="number" min={1} max={500} value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </div>
          <div className="flex items-end gap-2">
            <Switch id="bm-overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
            <Label htmlFor="bm-overwrite" className="text-xs">
              Mevcut fotoğrafları da değiştir
            </Label>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handlePreview} disabled={loading !== null} variant="outline" size="sm" className="w-full">
              {loading === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              <span className="ml-1">Önizle</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleRun} disabled={loading !== null || !preview || preview.updatable === 0} size="sm">
            {loading === "run" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            <span className="ml-1">Otomatik Güncelle{preview ? ` (${preview.updatable})` : ""}</span>
          </Button>
          <Button onClick={handleLoadLogs} disabled={loading !== null} variant="ghost" size="sm">
            {loading === "logs" ? <Loader2 className="size-4 animate-spin" /> : <History className="size-4" />}
            <span className="ml-1">Son güncelleme kayıtları</span>
          </Button>
        </div>

        {preview && (
          <div className="space-y-3 pt-2 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Süre" value={`${(preview.duration_ms / 1000).toFixed(1)} sn`} />
              <Stat label="Toplam parça" value={preview.total} />
              <Stat label="OEM eşleşen" value={preview.oem_matched} />
              <Stat label="Marka eşleşen" value={preview.brand_matched} />
              <Stat label={`Skor ≥ %${(preview.min_similarity*100).toFixed(0)}`} value={preview.similarity_passed} />
              <Stat label="Görsel bulunan" value={preview.image_found} />
              <Stat label="Güncellenebilir" value={preview.updatable} />
              <Stat label="Başarı oranı"
                value={`${preview.total ? ((preview.updatable / preview.total) * 100).toFixed(1) : 0}%`} />
            </div>

            <div className="flex flex-wrap gap-1">
              <Chip current={filter} value="all" onClick={setFilter}>Tümü ({preview.items.length})</Chip>
              <Chip current={filter} value="updatable" onClick={setFilter}>
                Güncellenebilir ({preview.by_status.would_update ?? 0})
              </Chip>
              <Chip current={filter} value="low_score" onClick={setFilter}>
                Düşük skor ({preview.by_status.skipped_low_score ?? 0})
              </Chip>
              <Chip current={filter} value="brand" onClick={setFilter}>
                Marka uyuşmazlığı ({preview.by_status.skipped_brand ?? 0})
              </Chip>
              <Chip current={filter} value="no_image" onClick={setFilter}>
                Görselsiz ({preview.by_status.skipped_no_image ?? 0})
              </Chip>
              <Chip current={filter} value="has_photos" onClick={setFilter}>
                Foto'su var ({preview.by_status.skipped_has_photos ?? 0})
              </Chip>
              <Chip current={filter} value="no_oem" onClick={setFilter}>
                OEM yok ({preview.by_status.skipped_no_oem_match ?? 0})
              </Chip>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-1">Görsel</th>
                    <th className="p-1">OEM</th>
                    <th className="p-1">Taşıtsan</th>
                    <th className="p-1">Bayram Oto</th>
                    <th className="p-1">Skor</th>
                    <th className="p-1">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.part_id} className="border-t align-top">
                      <td className="p-1">
                        {r.main_image ? (
                          <a href={r.main_image} target="_blank" rel="noreferrer">
                            <img src={r.main_image} alt="" loading="lazy"
                              className="size-14 object-cover rounded border" />
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-1 font-mono">{r.oem ?? "—"}</td>
                      <td className="p-1 max-w-[200px]">
                        <div className="truncate">{r.title_part}</div>
                        <div className="text-muted-foreground">{r.brand_part ?? "—"}</div>
                      </td>
                      <td className="p-1 max-w-[200px]">
                        <div className="truncate">{r.title_source ?? "—"}</div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          {r.brand_source ?? "—"}
                          {r.source_url && (
                            <a href={r.source_url} target="_blank" rel="noreferrer"
                              className="hover:underline"><Link2 className="size-3" /></a>
                          )}
                        </div>
                      </td>
                      <td className={`p-1 font-mono ${r.similarity>=0.6?"text-green-600":r.similarity>0?"text-amber-600":"text-muted-foreground"}`}>
                        {(r.similarity * 100).toFixed(0)}%
                      </td>
                      <td className="p-1">
                        <StatusBadge status={r.status} />
                        {r.reason && <div className="text-[10px] text-muted-foreground mt-0.5">{r.reason}</div>}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Bu filtrede kayıt yok.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {runResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm pt-2 border-t">
            <Stat label="Süre" value={`${(runResult.duration_ms/1000).toFixed(1)} sn`} />
            <Stat label="Toplam" value={runResult.total} />
            <Stat label="Güncellenen" value={runResult.updated} />
            <Stat label="Hata" value={runResult.errors} />
            {runResult.error_messages.length > 0 && (
              <div className="col-span-full text-xs text-destructive">
                {runResult.error_messages.join("; ")}
              </div>
            )}
          </div>
        )}

        {logs && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground mb-1">Son {logs.length} güncelleme kaydı</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-1">Tarih</th>
                    <th className="p-1">OEM</th>
                    <th className="p-1">Eski</th>
                    <th className="p-1">Yeni</th>
                    <th className="p-1">Skor</th>
                    <th className="p-1">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t align-top">
                      <td className="p-1 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="p-1 font-mono">{l.oem}</td>
                      <td className="p-1">
                        {l.old_image_url ? <img src={l.old_image_url} alt="" className="size-10 object-cover rounded border" /> : "—"}
                      </td>
                      <td className="p-1">
                        {l.new_image_url ? <img src={l.new_image_url} alt="" className="size-10 object-cover rounded border" /> : "—"}
                      </td>
                      <td className="p-1 font-mono">{l.similarity != null ? `${(l.similarity*100).toFixed(0)}%` : "—"}</td>
                      <td className="p-1"><StatusBadge status={l.status as Status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function Chip({ current, value, onClick, children }: {
  current: Filter; value: Filter; onClick: (v: Filter) => void; children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button type="button" onClick={() => onClick(value)}
      className={`text-xs rounded-full border px-3 py-1 transition ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
      }`}>{children}</button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  switch (status) {
    case "updated": return <Badge className="bg-green-600 hover:bg-green-600">Güncellendi</Badge>;
    case "would_update": return <Badge className="bg-emerald-600 hover:bg-emerald-600">Hazır</Badge>;
    case "skipped_low_score": return <Badge variant="destructive">Düşük skor</Badge>;
    case "skipped_brand": return <Badge variant="destructive">Marka</Badge>;
    case "skipped_no_image": return <Badge variant="outline">Görselsiz</Badge>;
    case "skipped_has_photos": return <Badge variant="secondary">Foto'lu</Badge>;
    case "skipped_no_oem_match": return <Badge variant="outline">OEM yok</Badge>;
    case "error": return <Badge variant="destructive">Hata</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}
