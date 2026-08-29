import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Star, Upload, Search, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListOemImages, verifyOemImage, rejectOemImage, setOemImagePrimary,
  addOemImage, uploadOemImageZip, getOemLibraryStats, getMissingOems,
  getOemImageCoverage, getMissingOemImages, reindexPartsOemFamilies,
} from "@/lib/oem-image-library.functions";
import {
  startOemImageZipJob, tickOemImageZipJob, getOemImageZipJob, cancelOemImageZipJob,
  listOemImageZipUploads,
  type OemImageZipJobSnapshot,
} from "@/lib/oem-zip-jobs.functions";

interface LibRow {
  id: string;
  oem: string;
  oem_normalized: string | null;
  brand: string | null;
  image_url: string;
  source_type: string;
  source_name: string | null;
  confidence: number;
  verified: boolean;
  is_primary: boolean;
  created_at: string;
}

interface Stats {
  total_images?: number;
  verified_images?: number;
  pending_images?: number;
  unique_oems?: number;
  by_brand?: Record<string, number>;
  by_source?: Record<string, number>;
}

export function OemImageCenterPanel() {
  const list = useServerFn(adminListOemImages);
  const verify = useServerFn(verifyOemImage);
  const reject = useServerFn(rejectOemImage);
  const setPrimary = useServerFn(setOemImagePrimary);
  const addOne = useServerFn(addOemImage);
  const uploadZip = useServerFn(uploadOemImageZip);
  const startJob = useServerFn(startOemImageZipJob);
  const tickJob = useServerFn(tickOemImageZipJob);
  const getJob = useServerFn(getOemImageZipJob);
  const cancelJob = useServerFn(cancelOemImageZipJob);
  const listUploadsFn = useServerFn(listOemImageZipUploads);
  const statsFn = useServerFn(getOemLibraryStats);
  const missingFn = useServerFn(getMissingOems);
  const coverageFn = useServerFn(getOemImageCoverage);
  const missingImagesFn = useServerFn(getMissingOemImages);
  const reindexFn = useServerFn(reindexPartsOemFamilies);

  const [tab, setTab] = useState("upload");

  // -------- Pool list --------
  const [rows, setRows] = useState<LibRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterVerified, setFilterVerified] = useState<"all" | "verified" | "pending">("all");
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async (verifiedFilter?: "all" | "verified" | "pending") => {
    setLoading(true);
    try {
      const res = await list({ data: { search: search || undefined, verified: verifiedFilter ?? filterVerified, limit: 50, offset: 0 } });
      setRows(res.rows as LibRow[]);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [list, search, filterVerified]);

  // -------- Stats --------
  const [stats, setStats] = useState<Stats | null>(null);
  const loadStats = useCallback(async () => {
    try {
      const res = await statsFn({});
      setStats(res.stats as Stats);
    } catch (e) {
      console.warn(e);
    }
  }, [statsFn]);

  // -------- Missing --------
  const [missing, setMissing] = useState<Array<{ oem: string; brand: string | null; part_count: number }>>([]);
  const loadMissing = useCallback(async () => {
    try {
      const res = await missingFn({ data: { limit: 200 } });
      setMissing(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eksik OEM listesi yüklenemedi");
    }
  }, [missingFn]);

  // -------- Coverage --------
  const [coverage, setCoverage] = useState<null | { total_parts: number; with_photo: number; with_oem: number; matched_in_library: number; unmatched: number; coverage_pct: number }>(null);
  const [missingFamilies, setMissingFamilies] = useState<Array<{ oem_family: string; part_count: number; sample_brand: string | null; sample_title: string | null }>>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    try {
      const [cov, miss] = await Promise.all([
        coverageFn({}),
        missingImagesFn({ data: { limit: 500 } }),
      ]);
      setCoverage(cov);
      setMissingFamilies(miss.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kapsama raporu yüklenemedi");
    } finally {
      setCoverageLoading(false);
    }
  }, [coverageFn, missingImagesFn]);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab === "pool" || tab === "pending") {
      void loadList(tab === "pending" ? "pending" : filterVerified);
    } else if (tab === "missing") {
      void loadMissing();
    } else if (tab === "coverage") {
      void loadCoverage();
    }
  }, [tab, loadList, loadMissing, loadCoverage, filterVerified]);

  // -------- ZIP upload --------
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipBrand, setZipBrand] = useState("");
  const [zipSourceType, setZipSourceType] = useState<"manufacturer_catalog" | "supplier_catalog" | "manual">("manufacturer_catalog");
  const [zipSourceName, setZipSourceName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"" | "uploading" | "processing">("");
  const [zipResult, setZipResult] = useState<{ added: number; skipped: number; errors: string[]; total_files: number } | null>(null);
  const [job, setJob] = useState<OemImageZipJobSnapshot | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const MAX_ZIP_BYTES = 500 * 1024 * 1024; // 500MB

  // Resume an in-flight job if the page is reopened.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("oemZipJobId") : null;
    if (!stored) return;
    getJob({ data: { job_id: stored } })
      .then((snap) => {
        if (snap.done) {
          localStorage.removeItem("oemZipJobId");
        } else {
          setJobId(stored);
          setJob(snap);
          setUploading(true);
          setUploadPhase("processing");
        }
      })
      .catch(() => localStorage.removeItem("oemZipJobId"));
  }, [getJob]);

  // Tick loop while a job is active.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const runTick = async () => {
      if (cancelled) return;
      try {
        const snap = await tickJob({ data: { job_id: jobId } });
        if (cancelled) return;
        setJob(snap);
        if (snap.done) {
          localStorage.removeItem("oemZipJobId");
          setUploading(false);
          setUploadPhase("");
          setJobId(null);
          if (snap.status === "completed") {
            toast.success(`✅ ${snap.added} görsel eklendi (${snap.skipped} atlandı, ${snap.failed} hata).`);
          } else if (snap.status === "failed") {
            toast.error(snap.error_message ?? "İşlem başarısız.");
          } else if (snap.status === "cancelled") {
            toast.info("İşlem iptal edildi.");
          }
          setZipResult({
            added: snap.added,
            skipped: snap.skipped,
            errors: snap.errors,
            total_files: snap.total ?? snap.processed,
          });
          void loadStats();
        } else {
          timer = setTimeout(runTick, 500);
        }
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Tick hatası");
        timer = setTimeout(runTick, 3000);
      }
    };
    runTick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, tickJob, loadStats]);

  // -------- Existing uploads (reprocess without re-uploading ZIP) --------
  const [pendingUploads, setPendingUploads] = useState<Array<{ storage_path: string; size_bytes: number | null; created_at: string | null }>>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const loadPendingUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const res = await listUploadsFn();
      setPendingUploads(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoadingUploads(false);
    }
  }, [listUploadsFn]);

  const handleReprocessExisting = async (storagePath: string) => {
    try {
      setUploading(true);
      setUploadPhase("processing");
      setZipResult(null);
      setJob(null);
      const { job_id } = await startJob({ data: {
        storage_path: storagePath,
        default_brand: zipBrand || null,
        source_type: zipSourceType,
        source_name: zipSourceName || null,
      } });
      localStorage.setItem("oemZipJobId", job_id);
      setJobId(job_id);
      toast.success("Mevcut ZIP yeniden işleniyor.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Başlatılamadı");
      setUploading(false);
      setUploadPhase("");
    }
  };

  const handleZipUpload = async () => {
    if (!zipFile) return;
    if (zipFile.size > MAX_ZIP_BYTES) { toast.error("Maksimum ZIP boyutu 500MB"); return; }
    setUploading(true);
    setZipResult(null);
    setJob(null);
    setUploadPct(0);
    setUploadPhase("uploading");
    try {
      // Small files (<6MB): keep legacy in-memory base64 path.
      if (zipFile.size <= 6 * 1024 * 1024) {
        const buf = await zipFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        setUploadPct(100);
        setUploadPhase("processing");
        const res = await uploadZip({ data: {
          zip_base64: b64,
          default_brand: zipBrand || null,
          source_type: zipSourceType,
          source_name: zipSourceName || null,
        } });
        setZipResult(res);
        toast.success(`${res.added} görsel eklendi (${res.skipped} atlandı).`);
        setUploading(false);
        setUploadPhase("");
        void loadStats();
        return;
      }

      // Large files (>6MB): XHR upload → background streaming job → poll ticks.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı.");
      const storagePath = `_uploads/${crypto.randomUUID()}.zip`;
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = `${supaUrl}/storage/v1/object/oem-image-library/${storagePath}`;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", apiKey);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.setRequestHeader("Content-Type", "application/zip");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Yükleme hatası (${xhr.status}): ${xhr.responseText?.slice(0, 200) || ""}`));
        };
        xhr.onerror = () => reject(new Error("Ağ hatası: yükleme başarısız."));
        xhr.send(zipFile);
      });

      setUploadPct(100);
      setUploadPhase("processing");
      const { job_id } = await startJob({ data: {
        storage_path: storagePath,
        default_brand: zipBrand || null,
        source_type: zipSourceType,
        source_name: zipSourceName || null,
        zip_size_bytes: zipFile.size,
      } });
      localStorage.setItem("oemZipJobId", job_id);
      setJobId(job_id);
      // Polling effect takes over from here.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP yükleme başarısız");
      setUploading(false);
      setUploadPhase("");
    }
  };

  const handleCancelJob = async () => {
    if (!jobId) return;
    try {
      await cancelJob({ data: { job_id: jobId } });
      toast.info("İptal isteği gönderildi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İptal başarısız");
    }
  };

  // -------- Manual add --------
  const [mOem, setMOem] = useState("");
  const [mBrand, setMBrand] = useState("");
  const [mUrl, setMUrl] = useState("");
  const handleManualAdd = async () => {
    if (!mOem || !mUrl) { toast.error("OEM ve URL gerekli."); return; }
    try {
      await addOne({ data: { oem: mOem, brand: mBrand || null, image_url: mUrl, source_type: "manual", verified: true } });
      toast.success("Görsel eklendi.");
      setMOem(""); setMBrand(""); setMUrl("");
      void loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eklenemedi");
    }
  };

  // -------- Row actions --------
  const handleVerify = async (id: string) => {
    try { await verify({ data: { id } }); toast.success("Doğrulandı."); void loadList(); void loadStats(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Hata"); }
  };
  const handleReject = async (id: string) => {
    try { await reject({ data: { id } }); toast.success("Reddedildi."); void loadList(); void loadStats(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Hata"); }
  };
  const handlePrimary = async (id: string) => {
    try { await setPrimary({ data: { id } }); toast.success("Ana görsel yapıldı."); void loadList(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Hata"); }
  };

  const exportMissingCsv = () => {
    const header = "oem,brand,part_count\n";
    const body = missing.map((r) => `${r.oem},${r.brand ?? ""},${r.part_count}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `eksik-oem-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="max-w-full overflow-x-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> OEM Görsel Merkezi
        </CardTitle>
      </CardHeader>
      <CardContent className="max-w-full overflow-x-hidden">
        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Toplam Görsel</div>
              <div className="text-2xl font-semibold">{stats.total_images ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Doğrulanmış</div>
              <div className="text-2xl font-semibold text-green-600">{stats.verified_images ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Onay Bekliyor</div>
              <div className="text-2xl font-semibold text-amber-600">{stats.pending_images ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Benzersiz OEM</div>
              <div className="text-2xl font-semibold">{stats.unique_oems ?? 0}</div>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <div className="-mx-2 px-2 overflow-x-auto">
            <TabsList className="inline-flex w-max min-w-full gap-1 sm:grid sm:w-full sm:grid-cols-5">
              <TabsTrigger value="upload" className="min-w-[110px] shrink-0">ZIP Yükle</TabsTrigger>
              <TabsTrigger value="pool" className="min-w-[120px] shrink-0">Görsel Havuzu</TabsTrigger>
              <TabsTrigger value="pending" className="min-w-[140px] shrink-0">Onay Bekleyenler</TabsTrigger>
              <TabsTrigger value="missing" className="min-w-[120px] shrink-0">Eksik OEM'ler</TabsTrigger>
              <TabsTrigger value="coverage" className="min-w-[140px] shrink-0">Kapsama Raporu</TabsTrigger>
              <TabsTrigger value="stats" className="min-w-[110px] shrink-0">İstatistikler</TabsTrigger>
            </TabsList>
          </div>

          {/* ZIP UPLOAD */}
          <TabsContent value="upload" className="space-y-4 pt-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Toplu ZIP Yükleme</h3>
              <p className="text-xs text-muted-foreground">
                ZIP içindeki <code>MR122305.jpg</code> dosyası otomatik olarak <strong>OEM=MR122305</strong> kabul edilir.
                Alt klasör adı marka olarak kullanılır: <code>Mitsubishi/MR122305.jpg</code>.
              </p>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>ZIP Dosyası (maks. 500MB)</Label>
                  <Input type="file" accept=".zip" onChange={(e) => setZipFile(e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <Label>Varsayılan Marka (opsiyonel)</Label>
                  <Input value={zipBrand} onChange={(e) => setZipBrand(e.target.value)} placeholder="Mitsubishi" />
                </div>
                <div>
                  <Label>Kaynak Tipi</Label>
                  <Select value={zipSourceType} onValueChange={(v) => setZipSourceType(v as typeof zipSourceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manufacturer_catalog">Üretici Kataloğu</SelectItem>
                      <SelectItem value="supplier_catalog">Tedarikçi Kataloğu</SelectItem>
                      <SelectItem value="manual">Manuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Kaynak Adı (opsiyonel)</Label>
                <Input value={zipSourceName} onChange={(e) => setZipSourceName(e.target.value)} placeholder="2024 Resmi Katalog" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleZipUpload} disabled={!zipFile || uploading}>
                  {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {uploadPhase === "processing" ? "İşleniyor..." : `Yükleniyor... %${uploadPct}`}</> : "Yükle ve İşle"}
                </Button>
                {jobId && (
                  <Button variant="outline" onClick={handleCancelJob}>İptal Et</Button>
                )}
              </div>
              {uploading && uploadPhase === "uploading" && (
                <div className="space-y-1">
                  <Progress value={uploadPct} />
                  <div className="text-xs text-muted-foreground">{uploadPct}% — {zipFile ? (zipFile.size / (1024 * 1024)).toFixed(1) : 0} MB</div>
                </div>
              )}
              {job && (uploading || job.done) && (
                <div className="rounded border p-3 space-y-3 bg-muted/40">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {job.status === "processing" && "🔄 İşleniyor (arka planda devam ediyor)"}
                      {job.status === "pending" && "⏳ Sıraya alındı"}
                      {job.status === "completed" && "✅ Tamamlandı"}
                      {job.status === "failed" && "❌ Başarısız"}
                      {job.status === "cancelled" && "🚫 İptal edildi"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {job.processed}{job.total != null ? ` / ${job.total}` : ""} dosya
                    </span>
                  </div>
                  <Progress value={job.total != null && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0} />

                  {/* DEBUG CARD — pipeline counters */}
                  <div className="rounded border bg-background p-3 space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Debug</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">📦 ZIP'teki toplam</div>
                        <div className="text-base font-semibold">{job.total ?? "?"}</div>
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">👁 İşlenen</div>
                        <div className="text-base font-semibold">{job.processed}</div>
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">🔎 OEM bulundu</div>
                        <div className="text-base font-semibold">{job.files_parsed}</div>
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">☁️ Storage'a yüklendi</div>
                        <div className="text-base font-semibold text-blue-600">{job.storage_uploaded}</div>
                        {job.storage_failed > 0 && <div className="text-[10px] text-destructive">{job.storage_failed} hata</div>}
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">💾 DB'ye kaydedildi</div>
                        <div className="text-base font-semibold text-green-600">{job.db_inserted}</div>
                        {job.db_failed > 0 && <div className="text-[10px] text-destructive">{job.db_failed} hata</div>}
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">⚠️ Toplam hata</div>
                        <div className="text-base font-semibold text-destructive">{job.failed}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t">
                      <div>✅ Eklendi: <strong className="text-green-600">{job.added}</strong></div>
                      <div>⏭ Atlandı: <strong>{job.skipped}</strong></div>
                      {job.remaining != null && <div>⏳ Kalan: <strong>{job.remaining}</strong></div>}
                    </div>
                  </div>

                  {job.error_message && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                      {job.error_message}
                    </div>
                  )}

                  {job.errors.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-destructive font-medium">
                        Son {Math.min(job.errors.length, 20)} hata (toplam {job.errors.length})
                      </summary>
                      <ul className="mt-1 list-disc pl-5 space-y-0.5 max-h-60 overflow-auto">
                        {job.errors.slice(-20).reverse().map((e, i) => (
                          <li key={i} className="font-mono text-[11px] break-all">{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {!job.done && (
                    <div className="text-[11px] text-muted-foreground">
                      Sayfayı kapatabilirsiniz; iş arka planda devam eder ve geri döndüğünüzde kaldığı yerden takip edilir.
                    </div>
                  )}
                </div>
              )}
              {zipResult && !job && (
                <div className="text-sm rounded border p-3 bg-muted/50">
                  <div>✅ {zipResult.added} eklendi · ⏭ {zipResult.skipped} atlandı · 📦 {zipResult.total_files} dosya</div>
                  {zipResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-destructive">{zipResult.errors.length} hata</summary>
                      <ul className="text-xs mt-1 list-disc pl-5">
                        {zipResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-medium">Manuel Tek Görsel Ekle</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <Input placeholder="OEM (örn. MR122305)" value={mOem} onChange={(e) => setMOem(e.target.value)} />
                <Input placeholder="Marka (opsiyonel)" value={mBrand} onChange={(e) => setMBrand(e.target.value)} />
                <Input placeholder="Görsel URL" value={mUrl} onChange={(e) => setMUrl(e.target.value)} />
              </div>
              <Button onClick={handleManualAdd}>Ekle</Button>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-medium">Mevcut Yüklemeler (Yeniden İşle)</h3>
                  <p className="text-xs text-muted-foreground">Daha önce yüklenmiş ZIP dosyalarını yeniden işlemek için kullan. ZIP yeniden yüklemeye gerek yok.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadPendingUploads} disabled={loadingUploads}>
                  {loadingUploads ? <Loader2 className="h-4 w-4 animate-spin" /> : "Listele"}
                </Button>
              </div>
              {pendingUploads.length > 0 && (
                <ul className="space-y-2">
                  {pendingUploads.map((u) => (
                    <li key={u.storage_path} className="flex items-center justify-between gap-2 text-xs rounded border p-2 bg-muted/30">
                      <div className="min-w-0">
                        <div className="font-mono truncate">{u.storage_path}</div>
                        <div className="text-muted-foreground">
                          {u.size_bytes != null ? `${(u.size_bytes / (1024 * 1024)).toFixed(1)} MB` : "—"}
                          {u.created_at ? ` · ${new Date(u.created_at).toLocaleString("tr-TR")}` : ""}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleReprocessExisting(u.storage_path)} disabled={uploading}>
                        Yeniden işle
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* POOL */}
          <TabsContent value="pool" className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="OEM ara..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadList()} className="w-full" />
              <Select value={filterVerified} onValueChange={(v) => setFilterVerified(v as typeof filterVerified)}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="verified">Doğrulanmış</SelectItem>
                  <SelectItem value="pending">Bekleyen</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => loadList()} disabled={loading} className="w-full sm:w-auto">
                <Search className="h-4 w-4 mr-2" /> Ara
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{total} sonuç</div>
            <RowGrid rows={rows} onVerify={handleVerify} onReject={handleReject} onPrimary={handlePrimary} />
          </TabsContent>

          {/* PENDING */}
          <TabsContent value="pending" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">Firecrawl ve kullanıcı yüklemelerinden gelen aday görseller. Onaylanan görseller aynı OEM'e sahip tüm ürünlerde gösterilir.</p>
            <RowGrid rows={rows} onVerify={handleVerify} onReject={handleReject} onPrimary={handlePrimary} />
          </TabsContent>

          {/* MISSING */}
          <TabsContent value="missing" className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <p className="text-sm text-muted-foreground">Havuzda görseli olmayan, sistemde en çok ürünü bulunan OEM'ler.</p>
              <Button variant="outline" size="sm" onClick={exportMissingCsv} disabled={missing.length === 0} className="w-full sm:w-auto">CSV İndir</Button>
            </div>
            <div className="rounded border max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr><th className="text-left p-2">OEM</th><th className="text-left p-2">Marka</th><th className="text-right p-2">Ürün Sayısı</th></tr>
                </thead>
                <tbody>
                  {missing.map((r) => (
                    <tr key={r.oem} className="border-t"><td className="p-2 font-mono">{r.oem}</td><td className="p-2">{r.brand ?? "-"}</td><td className="p-2 text-right">{r.part_count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* STATS */}
          <TabsContent value="stats" className="space-y-4 pt-4">
            {stats && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded border p-4">
                  <h4 className="font-medium mb-2">Marka Bazlı</h4>
                  <ul className="text-sm space-y-1">
                    {Object.entries(stats.by_brand ?? {}).map(([k, v]) => (
                      <li key={k} className="flex justify-between"><span>{k}</span><Badge variant="secondary">{v}</Badge></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded border p-4">
                  <h4 className="font-medium mb-2">Kaynak Tipi</h4>
                  <ul className="text-sm space-y-1">
                    {Object.entries(stats.by_source ?? {}).map(([k, v]) => (
                      <li key={k} className="flex justify-between"><span>{k}</span><Badge variant="secondary">{v}</Badge></li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="coverage" className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void loadCoverage()} disabled={coverageLoading}>
                {coverageLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Raporu Yenile
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!confirm("Tüm ürünlerde OEM aile kolonu yeniden hesaplanacak. Devam edilsin mi?")) return;
                  setReindexing(true);
                  try {
                    const r = await reindexFn({});
                    toast.success(`Yeniden indekslendi: ${r.updated} ürün`);
                    await loadCoverage();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Reindex başarısız");
                  } finally {
                    setReindexing(false);
                  }
                }}
                disabled={reindexing}
              >
                {reindexing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Toplu Yeniden İndeksle
              </Button>
              {missingFamilies.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const header = "oem_family,part_count,sample_brand,sample_title\n";
                    const body = missingFamilies.map((r) =>
                      [r.oem_family, r.part_count, r.sample_brand ?? "", (r.sample_title ?? "").replace(/[,\n]/g, " ")].join(",")
                    ).join("\n");
                    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `missing-oem-families.csv`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  CSV İndir
                </Button>
              )}
            </div>

            {coverage && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Toplam Aktif Ürün" value={coverage.total_parts} />
                <StatCard label="Fotoğrafı Olan" value={coverage.with_photo} />
                <StatCard label="OEM'i Olan" value={coverage.with_oem} />
                <StatCard label="Havuzda Eşleşen" value={coverage.matched_in_library} tone="success" />
                <StatCard label="Eşleşmeyen" value={coverage.unmatched} tone="warn" />
                <StatCard label="Kapsama %" value={`${coverage.coverage_pct}%`} tone="primary" />
              </div>
            )}

            <div className="rounded border">
              <div className="px-3 py-2 border-b bg-muted/30 text-sm font-medium flex justify-between">
                <span>Havuzda Eşi Olmayan OEM Aileleri</span>
                <span className="text-muted-foreground">{missingFamilies.length} aile</span>
              </div>
              <div className="max-h-[480px] overflow-auto divide-y">
                {missingFamilies.length === 0 && !coverageLoading && (
                  <div className="p-4 text-sm text-muted-foreground text-center">Eksik yok.</div>
                )}
                {missingFamilies.map((r) => (
                  <div key={r.oem_family} className="px-3 py-2 text-sm flex items-center gap-3">
                    <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{r.oem_family}</code>
                    <Badge variant="secondary">{r.part_count} ürün</Badge>
                    <span className="text-muted-foreground truncate">{r.sample_brand} — {r.sample_title}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RowGrid({ rows, onVerify, onReject, onPrimary }: {
  rows: LibRow[];
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
  onPrimary: (id: string) => void;
}) {
  if (rows.length === 0) return <div className="text-center text-muted-foreground py-8">Kayıt yok.</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {rows.map((r) => (
        <div key={r.id} className="border rounded-lg overflow-hidden flex flex-col">
          <div className="aspect-square bg-muted relative">
            <img src={r.image_url} alt={r.oem} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
            {r.is_primary && <Star className="absolute top-1 right-1 h-5 w-5 fill-yellow-400 text-yellow-500" />}
          </div>
          <div className="p-2 text-xs flex-1 space-y-1">
            <div className="font-mono font-semibold truncate">{r.oem}</div>
            <div className="flex flex-wrap gap-1">
              {r.brand && <Badge variant="outline" className="text-[10px]">{r.brand}</Badge>}
              <Badge variant={r.verified ? "default" : "secondary"} className="text-[10px]">
                {r.verified ? "✓" : "⏳"} {r.source_type}
              </Badge>
            </div>
            <div className="text-muted-foreground">{r.source_name ?? "—"}</div>
          </div>
          <div className="flex border-t">
            {!r.verified && (
              <Button size="sm" variant="ghost" className="flex-1 rounded-none h-8" onClick={() => onVerify(r.id)}>
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              </Button>
            )}
            {r.verified && !r.is_primary && (
              <Button size="sm" variant="ghost" className="flex-1 rounded-none h-8" onClick={() => onPrimary(r.id)}>
                <Star className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="flex-1 rounded-none h-8" onClick={() => onReject(r.id)}>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "warn" | "primary" }) {
  const toneCls = tone === "success" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
