import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  listSuppliers,
  saveSupplierSettings,
  testSupplierConnection,
  startSupplierScan,
  scanSupplierChunk,
  finishSupplierScan,
  listSupplierScanJobs,
  sampleTasitsanOems,
  probeSupplierOem,
  runSupplierOemRegression,
  runOnlineParcaPipelineTest,
  runOnlineParcaOemReport,
  type ScanResultRow,
} from "@/lib/supplier-scan.functions";

interface SupplierRow {
  id: string;
  name: string;
  supplier_type: string;
  product_type: string;
  active: boolean;
  login_url: string | null;
  search_url_template: string | null;
  username: string | null;
  default_margin: number;
  min_stock: number;
  last_connected_at: string | null;
  last_scan_at: string | null;
  has_password: boolean;
}

interface JobRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  total_oems: number;
  in_stock_count: number;
  out_of_stock_count: number;
  not_found_count: number;
  error_count: number;
  status: string;
}

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  IN_STOCK: { label: "🟢 STOKTA", cls: "text-emerald-500" },
  OUT_OF_STOCK: { label: "🟡 STOK YOK", cls: "text-amber-500" },
  NOT_FOUND: { label: "🔴 BULUNAMADI", cls: "text-red-500" },
  ERROR: { label: "⚠️ HATA", cls: "text-muted-foreground" },
};

const SPEEDS = [
  { label: "Yavaş (güvenli)", chunk: 3, delay: 1500 },
  { label: "Normal", chunk: 5, delay: 800 },
  { label: "Hızlı", chunk: 8, delay: 300 },
];

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
}

export function SupplierScanPanel() {
  const fetchSuppliers = useServerFn(listSuppliers);
  const saveSettings = useServerFn(saveSupplierSettings);
  const testConn = useServerFn(testSupplierConnection);
  const startScan = useServerFn(startSupplierScan);
  const scanChunk = useServerFn(scanSupplierChunk);
  const finishScan = useServerFn(finishSupplierScan);
  const fetchJobs = useServerFn(listSupplierScanJobs);
  const fetchSampleOems = useServerFn(sampleTasitsanOems);
  const probeOem = useServerFn(probeSupplierOem);
  const runRegression = useServerFn(runSupplierOemRegression);
  const runPipeline = useServerFn(runOnlineParcaPipelineTest);
  const runReport = useServerFn(runOnlineParcaOemReport);

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [view, setView] = useState<"settings" | "scan" | "history" | "probe">("probe");

  // OEM arama teknik testi
  const [probeOemCode, setProbeOemCode] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<Awaited<
    ReturnType<typeof probeSupplierOem>
  > | null>(null);
  const [requiredOemVerified, setRequiredOemVerified] = useState(false);
  const [regressionRunning, setRegressionRunning] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipeline, setPipeline] = useState<Awaited<
    ReturnType<typeof runOnlineParcaPipelineTest>
  > | null>(null);
  const [reportRunning, setReportRunning] = useState(false);
  const [reportOems, setReportOems] = useState("5193124050\n8531502540");
  const [reportRows, setReportRows] = useState<
    Awaited<ReturnType<typeof runOnlineParcaOemReport>>["rows"]
  >([]);
  const [regressionRows, setRegressionRows] = useState<Array<{
    oem: string; normalizedOem: string; search: string; product: string; detail: string;
    stock: string; price: number | null; finalResult: string; classification: string; message: string;
  }>>([]);

  // ayarlar formu
  const [loginUrl, setLoginUrl] = useState("");
  const [searchTpl, setSearchTpl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);

  // tarama formu
  const [oemText, setOemText] = useState("");
  const [margin, setMargin] = useState(25);
  const [minStock, setMinStock] = useState(1);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ScanResultRow[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef(false);

  const oems = useMemo(
    () => [
      ...new Set(
        oemText
          .split(/[\n,;\t]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2),
      ),
    ],
    [oemText],
  );

  const load = useCallback(async () => {
    try {
      const rows = (await fetchSuppliers()) as unknown as SupplierRow[];
      setSuppliers(rows);
      const op = rows.find((r) => r.name.toLowerCase().startsWith("onlinepar")) ?? rows[0] ?? null;
      setSupplier(op ?? null);
      if (op) {
        setLoginUrl(op.login_url ?? "");
        setSearchTpl(op.search_url_template ?? "");
        setUsername(op.username ?? "");
        setActive(op.active);
        setMargin(Number(op.default_margin ?? 25));
        setMinStock(Number(op.min_stock ?? 1));
        const js = (await fetchJobs({ data: { supplierId: op.id } })) as unknown as JobRow[];
        setJobs(js);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tedarikçiler yüklenemedi");
    }
  }, [fetchSuppliers, fetchJobs]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveSettings() {
    if (!supplier) return;
    setSavingSettings(true);
    try {
      await saveSettings({
        data: {
          supplierId: supplier.id,
          login_url: loginUrl || null,
          search_url_template: searchTpl || null,
          username: username || null,
          ...(password ? { password } : {}),
          active,
          default_margin: margin,
          min_stock: minStock,
        },
      });
      setPassword("");
      toast.success("Ayarlar kaydedildi");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSavingSettings(false);
    }
  }

  async function onProbe() {
    if (!supplier || probeOemCode.trim().length < 2) {
      toast.error("Bir OEM kodu girin");
      return;
    }
    setProbing(true);
    setProbeResult(null);
    setRequiredOemVerified(false);
    try {
      const res = await probeOem({ data: { supplierId: supplier.id, oem: probeOemCode.trim() } });
      setProbeResult(res);
      const requiredOemOk =
        res.found &&
        res.hit?.product_name &&
        res.hit?.supplier_price != null;
      setRequiredOemVerified(!!requiredOemOk);
      if (requiredOemOk) toast.success("OEM doğrulandı — toplu tarama açıldı");
      else if (res.found) toast.success("Ürün bulundu");
      else if (res.error) toast.error(res.error);
      else toast.warning("İstek tamamlandı ancak ürün bulunamadı");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test başarısız");
    } finally {
      setProbing(false);
    }
  }

  async function onReport() {
    const oems = reportOems
      .split(/[\n,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!oems.length) return;
    setReportRunning(true);
    try {
      const res = await runReport({ data: { oems } });
      setReportRows(res.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rapor alınamadı");
    } finally {
      setReportRunning(false);
    }
  }

  async function onPipeline(save: boolean) {
    if (!supplier || probeOemCode.trim().length < 2) {
      toast.error("Bir OEM kodu girin");
      return;
    }
    setPipelineRunning(true);
    setPipeline(null);
    try {
      const res = await runPipeline({
        data: { supplierId: supplier.id, oem: probeOemCode.trim(), save },
      });
      setPipeline(res);
      if (res.errorCode) toast.warning(res.message);
      else toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline testi başarısız");
    } finally {
      setPipelineRunning(false);
    }
  }

  async function onRegression() {
    if (!supplier) return;
    setRegressionRunning(true);
    try {
      const response = await runRegression({ data: { supplierId: supplier.id, limit: 12 } });
      setRegressionRows(response.results);
      toast.success(`${response.results.length} OEM gerçek akışta test edildi.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regresyon testi çalıştırılamadı");
    } finally {
      setRegressionRunning(false);
    }
  }

  async function onTest() {
    if (!supplier) return;
    setTesting(true);
    try {
      const res = await testConn({ data: { supplierId: supplier.id } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setTesting(false);
    }
  }

  function onExcelUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error("Sayfa yok");
        const sheet = wb.Sheets[sheetName];
        if (!sheet) throw new Error("Sayfa okunamadı");
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: false,
        });
        const codes: string[] = [];
        for (const r of rows) {
          const key =
            Object.keys(r).find((k) => /oem|kod|code|parça/i.test(k)) ?? Object.keys(r)[0];
          const val = key ? String(r[key] ?? "").trim() : "";
          if (val.length >= 2) codes.push(val);
        }
        setOemText(codes.join("\n"));
        toast.success(`${codes.length} OEM yüklendi`);
      } catch {
        toast.error("Excel okunamadı");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function onLoadFromTasitsan(limit: number) {
    try {
      const list = (await fetchSampleOems({ data: { limit } })) as unknown as string[];
      setOemText(list.join("\n"));
      toast.success(`${list.length} OEM listelendi`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OEM listesi alınamadı");
    }
  }

  async function onStart() {
    if (!supplier) return;
    if (!requiredOemVerified) {
      toast.error("Önce teknik testte bir OEM'i ürün URL, ad ve fiyat ile doğrulayın");
      return;
    }
    if (oems.length === 0) {
      toast.error("Önce OEM listesi girin");
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: oems.length });
    const t0 = Date.now();
    setElapsed(0);
    const speed = SPEEDS[speedIdx] ?? SPEEDS[1]!;
    let jobId = "";
    try {
      const started = await startScan({
        data: { supplierId: supplier.id, oems, margin, minStock },
      });
      jobId = started.jobId;
      const list = started.oems;
      setProgress({ done: 0, total: list.length });

      for (let i = 0; i < list.length; i += speed.chunk) {
        if (cancelRef.current) break;
        const slice = list.slice(i, i + speed.chunk);
        const res = await scanChunk({ data: { jobId, oems: slice } });
        setResults((prev) => [...prev, ...(res.results as ScanResultRow[])]);
        setProgress({ done: Math.min(i + slice.length, list.length), total: list.length });
        setElapsed(Math.round((Date.now() - t0) / 1000));
        if (res.halted) {
          toast.error(res.message || "Tarama durduruldu");
          setRunning(false);
          await load();
          return;
        }
        if (i + speed.chunk < list.length) await new Promise((r) => setTimeout(r, speed.delay));
      }
      await finishScan({ data: { jobId, status: cancelRef.current ? "cancelled" : "completed" } });
      setElapsed(Math.round((Date.now() - t0) / 1000));
      toast.success(cancelRef.current ? "Tarama iptal edildi" : "Tarama tamamlandı");
      await load();
    } catch (err) {
      if (jobId) await finishScan({ data: { jobId, status: "cancelled" } }).catch(() => undefined);
      toast.error(err instanceof Error ? err.message : "Tarama hatası");
    } finally {
      setRunning(false);
    }
  }

  const summary = useMemo(() => {
    const s = { inStock: 0, outOfStock: 0, notFound: 0, error: 0 };
    for (const r of results) {
      if (r.status === "IN_STOCK") s.inStock++;
      else if (r.status === "OUT_OF_STOCK") s.outOfStock++;
      else if (r.status === "NOT_FOUND") s.notFound++;
      else s.error++;
    }
    return s;
  }, [results]);

  function downloadExcel() {
    const aoa: (string | number | null)[][] = [
      [
        "OEM",
        "Ürün Adı",
        "Marka",
        "Stok Kodu",
        "Stok",
        "OnlineParça Fiyatı",
        "Kâr %",
        "Taşıtsan Fiyatı",
        "Durum",
        "Ürün URL",
        "GTIN",
      ],
      ...results.map((r) => [
        r.oem,
        r.product_name ?? "",
        r.brand ?? "",
        r.supplier_product_code ?? "",
        r.stock_quantity ?? "",
        r.supplier_price ?? "",
        margin,
        r.sale_price ?? "",
        STATUS_UI[r.status]?.label ?? r.status,
        r.product_url ?? "",
        r.gtin ?? "",
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Tarama");
    XLSX.writeFile(wb, `onlineparca-tarama-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadUploadTemplate() {
    const inStock = results.filter((r) => r.status === "IN_STOCK");
    const aoa: (string | number)[][] = [
      [
        "Başlık",
        "Marka",
        "OEM Kodu",
        "Fiyat",
        "Stok",
        "Kategori",
        "Açıklama",
        "Görsel URL",
        "Ürün Kalitesi",
      ],
      ...inStock.map((r) => [
        r.product_name ?? r.oem,
        r.brand ?? "",
        r.oem,
        r.sale_price ?? "",
        r.stock_quantity ?? 1,
        "",
        `OnlineParça orijinal ürün. OEM: ${r.oem}`,
        r.image_url ?? "",
        "Orijinal",
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Parçalar");
    XLSX.writeFile(
      wb,
      `tasitsan-yukleme-onlineparca-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  if (!supplier) {
    return <div className="p-6 text-sm text-muted-foreground">Tedarikçi bulunamadı.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-bold">🏭 OnlineParça Tedarikçi + OEM Tarama</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Tedarikçi: <strong>{supplier.name}</strong> · Tip: {supplier.product_type} ·{" "}
          {supplier.active ? "Aktif" : "Pasif"} · Son bağlantı:{" "}
          {supplier.last_connected_at
            ? new Date(supplier.last_connected_at).toLocaleString("tr-TR")
            : "—"}{" "}
          · Son tarama:{" "}
          {supplier.last_scan_at ? new Date(supplier.last_scan_at).toLocaleString("tr-TR") : "—"}
        </p>
        <div className="flex gap-2 mt-3">
          {(
            [
              ["probe", "🔎 OEM Arama Teknik Testi"],
              ["scan", "OEM Tarama"],
              ["settings", "Ayarlar"],
              ["history", "Tarama Geçmişi"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                view === v ? "border-gold text-gold" : "border-border text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "probe" && (
        <div className="rounded-xl border border-border p-4 space-y-3 max-w-3xl">
          <h3 className="font-semibold text-sm">🔎 OEM Arama Teknik Testi</h3>
          <p className="text-xs text-muted-foreground">
            Bağlantı testinden bağımsızdır. Giriş yapılır, gerçek arama formu/endpoint keşfedilir ve
            tek OEM sorgulanır. Şifre, çerez ve oturum bilgisi hiçbir zaman gösterilmez veya
            loglanmaz.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              value={probeOemCode}
              onChange={(e) => setProbeOemCode(e.target.value)}
              placeholder="OEM kodu (örn. 5NA945095B)"
              className="max-w-xs"
            />
            <Button size="sm" onClick={onProbe} disabled={probing}>
              {probing ? "Test ediliyor…" : "TEST ET"}
            </Button>
            <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
              {testing ? "Deneniyor…" : "Sadece Bağlantı Testi"}
            </Button>
            <Button size="sm" variant="outline" onClick={onRegression} disabled={regressionRunning}>
              {regressionRunning ? "Regresyon çalışıyor…" : "Çoklu Regresyon Testi"}
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            <Button size="sm" variant="secondary" onClick={() => void onPipeline(false)} disabled={pipelineRunning}>
              {pipelineRunning ? "Pipeline çalışıyor…" : "🧪 Uçtan Uca Pipeline (kayıtsız)"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void onPipeline(true)} disabled={pipelineRunning}>
              Pipeline + Harici Tedarikçi Kaydı
            </Button>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm font-semibold">OEM Karşılaştırma Raporu (teknik test ↔ müşteri araması)</p>
            <textarea
              value={reportOems}
              onChange={(e) => setReportOems(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-2 text-xs font-mono"
              placeholder="Her satıra bir OEM"
            />
            <Button size="sm" onClick={() => void onReport()} disabled={reportRunning}>
              {reportRunning ? "Rapor çalışıyor…" : "RAPORU ÇALIŞTIR"}
            </Button>
            {reportRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pr-3">OEM</th>
                      <th className="pr-3">TAŞITSAN SONUCU</th>
                      <th className="pr-3">ONLINEPARÇA SONUCU</th>
                      <th className="pr-3">OEM MATCH</th>
                      <th className="pr-3">DETAIL</th>
                      <th className="pr-3">STOCK</th>
                      <th className="pr-3">PRICE</th>
                      <th className="pr-3">FRONTEND RESULT</th>
                      <th className="pr-3">FINAL STATUS</th>
                      <th>NEDEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((r) => (
                      <tr key={r.oem} className="border-t border-border/50 align-top">
                        <td className="pr-3 py-1">{r.oem}</td>
                        <td className="pr-3 py-1">{r.tasitsanCount} ürün</td>
                        <td className="pr-3 py-1 max-w-[200px] truncate">
                          {r.onlineparcaProduct ?? "—"}
                          {r.brand ? ` · ${r.brand}` : ""}
                        </td>
                        <td className="pr-3 py-1">{r.oemMatch}</td>
                        <td className="pr-3 py-1">
                          {r.detail} ({r.detailHttpStatus ?? "—"})
                        </td>
                        <td className="pr-3 py-1">
                          {r.stock}
                          {r.stockQuantity != null ? ` (${r.stockQuantity})` : ""}
                        </td>
                        <td className="pr-3 py-1">
                          {r.priceStatus === "OK" ? `₺${r.price}` : "UNAVAILABLE"}
                        </td>
                        <td className="pr-3 py-1">{r.frontendResultCount}</td>
                        <td className={r.finalStatus === "SUCCESS" ? "pr-3 py-1 text-emerald-500" : "pr-3 py-1 text-amber-500"}>
                          {r.finalStatus}
                        </td>
                        <td className="py-1 text-muted-foreground">{r.failureReason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pipeline && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2 font-mono overflow-x-auto">
              <div className="font-semibold">
                PIPELINE — {pipeline.oem} (normalize: {pipeline.normalizedOem})
              </div>
              <table className="w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pr-3">ADIM</th>
                    <th className="pr-3">DURUM</th>
                    <th className="pr-3">HTTP</th>
                    <th className="pr-3">SÜRE</th>
                    <th className="pr-3">URL</th>
                    <th>BİLGİ / HATA</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.steps.map((s, i) => (
                    <tr key={i} className="align-top border-t border-border/50">
                      <td className="pr-3 py-1">{s.step}</td>
                      <td
                        className={`pr-3 py-1 ${
                          s.status === "PASS"
                            ? "text-emerald-500"
                            : s.status === "FAIL"
                              ? "text-red-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {s.status}
                      </td>
                      <td className="pr-3 py-1">{s.httpStatus ?? "—"}</td>
                      <td className="pr-3 py-1">{s.durationMs ? `${s.durationMs}ms` : "—"}</td>
                      <td className="pr-3 py-1 max-w-[240px] truncate">{s.url ?? "—"}</td>
                      <td className="py-1 text-muted-foreground">
                        {s.info ?? ""}
                        {s.error ? <span className="text-red-500"> {s.error}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={pipeline.errorCode ? "text-amber-500" : "text-emerald-500"}>
                SONUÇ: {pipeline.errorCode ?? "SUCCESS"} — {pipeline.message}
              </div>
              {pipeline.product && (
                <div className="space-y-0.5">
                  <div>ÜRÜN: {pipeline.product.product_name}</div>
                  <div>EŞLEŞME: {pipeline.product.match_type}</div>
                  <div>ÜRÜN KODU: {pipeline.product.product_code ?? "—"}</div>
                  <div>ÜRÜN ID: {pipeline.product.external_product_id ?? "—"}</div>
                  <div>URL: {pipeline.product.external_product_url}</div>
                  <div>
                    FİYAT: {pipeline.product.list_price ?? "—"} {pipeline.product.source_currency} (KDV hariç)
                  </div>
                  <div>STOK: {pipeline.product.stock_status}</div>
                </div>
              )}
              {pipeline.candidates.length > 1 && (
                <div className="text-muted-foreground">
                  Aday sayısı: {pipeline.candidates.length} —{" "}
                  {pipeline.candidates.map((c) => `${c.sku ?? "?"}(${c.matchType})`).join(", ")}
                </div>
              )}
              {pipeline.saved && (
                <div>
                  KAYIT: {pipeline.saved.action} · part_id={pipeline.saved.part_id ?? "—"} · satış fiyatı=
                  {pipeline.saved.sale_price ?? "—"}
                </div>
              )}
            </div>
          )}


          {probeResult && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1 font-mono">
              <div>Giriş: {probeResult.loginOk ? "BAŞARILI" : "BAŞARISIZ"}</div>
              {probeResult.steps.map((s, i) => (
                <div key={i} className="text-muted-foreground">
                  • {s}
                </div>
              ))}
              {probeResult.debug && (
                <>
                  <div className="pt-1 mt-1 border-t border-border font-semibold">OEM Arama Teşhisi</div>
                  <div>Girdi: {probeResult.debug.inputOem}</div>
                  <div>Normalize OEM: {probeResult.debug.normalizedOem}</div>
                  <div>Response Length: {probeResult.debug.responseLength}</div>
                  <div>SEARCH: {probeResult.debug.status === 200 ? "OK" : probeResult.debug.finalCode}</div>
                  <div>PRODUCT: {probeResult.debug.productFound ? "FOUND" : "NOT FOUND"}</div>
                   <div>
                     DETAIL: {probeResult.debug.detailVerified
                       ? "VERIFIED"
                       : probeResult.debug.productFound && !probeResult.hit?.product_url
                         ? "SKIP"
                         : probeResult.debug.productFound
                           ? "FAILED/PARTIAL"
                           : "—"}
                   </div>
                  <div>STOCK: {probeResult.debug.stockFound ? "OK" : "MISSING"}</div>
                  <div>PRICE: {probeResult.debug.priceFound ? "OK" : "MISSING"}</div>
                  <div className={probeResult.debug.finalCode === "SUCCESS" ? "text-emerald-500" : "text-amber-500"}>
                    FINAL: {probeResult.debug.finalCode} — {probeResult.debug.userMessage}
                  </div>
                  <div className="pt-1 mt-1 border-t border-border font-semibold">
                    1) JSON OEM ARAMA (ana yol)
                  </div>
                  {!probeResult.debug.ajax?.tried ? (
                    <div className="text-red-500">
                      JSON OEM endpoint çağrılmadı — eski scraper akışı çalışıyor.
                    </div>
                  ) : (
                    <>
                      <div className="break-all">
                        JSON OEM Request: {probeResult.debug.ajax.endpoint ?? "—"}
                      </div>
                      <div>JSON HTTP Status: {probeResult.debug.ajax.status ?? "—"}</div>
                      <div>JSON Content-Type: {probeResult.debug.ajax.contentType ?? "—"}</div>
                      <div>JSON sonuç sayısı: {probeResult.debug.ajax.itemCount}</div>
                      <div>JSON ilk label: {probeResult.debug.ajax.firstProductLabel ?? "—"}</div>
                      <div className="break-all">
                        JSON producturl: {probeResult.debug.ajax.firstProductUrl ?? "—"}
                      </div>
                      <div>
                        Ürün detay HTTP Status: {probeResult.debug.ajax.detailStatus ?? "—"}
                      </div>
                      <div className="break-all">
                        Ürün detay URL: {probeResult.debug.ajax.detailUrl ?? "—"}
                      </div>
                      <div>Ürün adı: {probeResult.debug.ajax.detailName ?? "—"}</div>
                      <div>Marka: {probeResult.debug.ajax.detailBrand ?? "—"}</div>
                      <div>SKU: {probeResult.debug.ajax.detailSku ?? "—"}</div>
                      <div>Stok: {probeResult.debug.ajax.detailStock ?? "—"}</div>
                      <div>Fiyat: {probeResult.debug.ajax.detailPrice ?? "—"}</div>
                      <div>
                        OEM eşleşmesi:{" "}
                        {probeResult.debug.ajax.oemMatch == null
                          ? "—"
                          : probeResult.debug.ajax.oemMatch
                            ? "EVET"
                            : "HAYIR"}
                      </div>
                      {probeResult.debug.ajax.rawPreview && (
                        <div className="break-all text-muted-foreground">
                          JSON önizleme: {probeResult.debug.ajax.rawPreview}
                        </div>
                      )}
                      {probeResult.debug.ajax.note && (
                        <div className="text-amber-500">! {probeResult.debug.ajax.note}</div>
                      )}
                    </>
                  )}

                  <div>
                    Gerçek aramaya devam:{" "}
                    {probeResult.debug.ajax.continuedToSearch ? "EVET" : "HAYIR"}
                  </div>

                  <div className="pt-1 mt-1 border-t border-border font-semibold">
                    2) GERÇEK ÜRÜN SEARCH REQUEST
                  </div>
                  <div>
                    Search Request: {probeResult.debug.method} {probeResult.debug.requestUrl}
                  </div>
                  <div>Search HTTP Status: {probeResult.debug.status}</div>
                  <div>Yönlendirme: {probeResult.debug.redirected ? "EVET" : "HAYIR"}</div>
                  <div>Son URL: {probeResult.debug.finalUrl}</div>
                  <div>Content-Type: {probeResult.debug.contentType}</div>
                  <div>Arama kaynağı: {probeResult.debug.searchSource}</div>
                  <div>
                    Search HTML ürün bulundu:{" "}
                    {probeResult.debug.serverHtmlProductFound ? "EVET" : "HAYIR"}
                  </div>
                  <div className="pt-1 mt-1 border-t border-border font-semibold">
                    /product/search zinciri
                  </div>
                  <div>REQUEST: {probeResult.debug.productSearch?.method ?? "GET"}</div>
                  <div className="break-all">URL: {probeResult.debug.productSearch?.url ?? "—"}</div>
                  <div>STATUS: {probeResult.debug.productSearch?.status ?? "—"}</div>
                  <div>CONTENT-TYPE: {probeResult.debug.productSearch?.contentType ?? "—"}</div>
                  <div>Sonuç sayısı: {probeResult.debug.productSearch?.resultCount ?? 0}</div>
                  <div className="break-all">İlk ürün URL: {probeResult.debug.productSearch?.firstProductUrl ?? "—"}</div>
                  <div>İlk ürün adı: {probeResult.debug.productSearch?.firstProductName ?? "—"}</div>
                  <div>Marka: {probeResult.debug.productSearch?.firstBrand ?? "—"}</div>
                  <div>OEM/SKU: {probeResult.debug.productSearch?.firstSku ?? "—"}</div>
                  <div>Fiyat: {money(probeResult.debug.productSearch?.firstPrice)}</div>
                  <div>Stok: {probeResult.debug.productSearch?.firstStock ?? "—"}</div>
                  <div>PRODUCT DETAIL request: {probeResult.debug.productSearch?.detailTried ? "EVET" : "HAYIR"}</div>
                  <div>PRODUCT DETAIL status: {probeResult.debug.productSearch?.detailStatus ?? "—"}</div>
                  <div>PRODUCT DETAIL content-type: {probeResult.debug.productSearch?.detailContentType ?? "—"}</div>
                  <div>
                    OEM VALIDATION: {probeResult.debug.productSearch?.oemMatch == null ? "—" : probeResult.debug.productSearch.oemMatch ? "MATCH" : "MISMATCH"}
                  </div>
                  {probeResult.debug.productSearch?.failureStep && (
                    <div className="text-red-500">Başarısız adım: {probeResult.debug.productSearch.failureStep}</div>
                  )}

                  {probeResult.debug.parse && (
                    <div className="pt-1 mt-1 border-t border-border">
                      <div>
                        Ürün kartı bulundu: {probeResult.debug.parse.cardFound ? "EVET" : "HAYIR"}
                      </div>
                      <div>
                        Kart selector: {probeResult.debug.parse.cardSelector ?? "—"} (
                        {probeResult.debug.parse.cardCount} kart)
                      </div>
                      <div className="break-all">
                        Ürün URL: {probeResult.debug.parse.productUrl ?? "—"}
                      </div>
                      <div>Ürün adı: {probeResult.debug.parse.productName ?? "—"}</div>
                      <div>Fiyat selector: {probeResult.debug.parse.priceSelector ?? "—"}</div>
                      <div>Stok selector: {probeResult.debug.parse.stockSelector ?? "—"}</div>
                      <div>Marka selector: {probeResult.debug.parse.brandSelector ?? "—"}</div>
                      <div>SKU selector: {probeResult.debug.parse.skuSelector ?? "—"}</div>
                      <div>
                        Detay sayfası okundu:{" "}
                        {probeResult.debug.parse.detailFetched ? "EVET" : "HAYIR"}
                      </div>
                      {probeResult.debug.parse.rejectReason && (
                        <div className="text-red-500">
                          Red nedeni: {probeResult.debug.parse.rejectReason}
                        </div>
                      )}
                      {probeResult.debug.parse.candidates?.length > 0 && (
                        <div className="pt-1 mt-1 border-t border-border space-y-1">
                          <div className="font-medium">Adaylar</div>
                          {probeResult.debug.parse.candidates.map((c) => (
                            <div key={c.index} className="pl-2 border-l border-border">
                              <div>Aday {c.index}:</div>
                              <div className="break-all">URL: {c.url ?? "—"}</div>
                              <div>Başlık: {c.title ?? "—"}</div>
                              <div>Ürün adayı: {c.isProduct ? "EVET" : "HAYIR"}</div>
                              <div>OEM eşleşmesi: {c.oemMatch ? "EVET" : "HAYIR"}</div>
                              <div>Fiyat bulundu: {c.priceFound ? "EVET" : "HAYIR"}</div>
                              <div>Stok bulundu: {c.stockFound ? "EVET" : "HAYIR"}</div>
                              <div>
                                SKU: {c.sku ?? "—"} · Marka: {c.brand ?? "—"}
                              </div>
                              <div>Sinyaller: {c.signals.join(", ") || "—"}</div>
                              <div
                                className={
                                  c.result === "ACCEPTED" ? "text-emerald-500" : "text-amber-500"
                                }
                              >
                                Sonuç: {c.result}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {probeResult.debug.parse.notes.map((n, i) => (
                        <div key={i} className="text-amber-500">
                          ! {n}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap break-all text-muted-foreground">
                    Yanıt (ilk 500 karakter): {probeResult.debug.bodyPreview}
                  </div>
                </>
              )}
              <div>Ürün bulundu: {probeResult.found ? "EVET" : "HAYIR"}</div>
              {probeResult.hit && (
                <div className="pt-1 border-t border-border mt-1">
                  <div>Ürün adı: {probeResult.hit.product_name ?? "—"}</div>
                  <div>Marka: {probeResult.hit.brand ?? "—"}</div>
                  <div>Durum: {probeResult.hit.status}</div>
                  <div>Stok: {probeResult.hit.stock_quantity ?? "—"}</div>
                  <div>Fiyat: {money(probeResult.hit.supplier_price)}</div>
                  <div className="break-all">URL: {probeResult.hit.product_url ?? "—"}</div>
                </div>
              )}
              {probeResult.error && <div className="text-red-500">Hata: {probeResult.error}</div>}
            </div>
          )}
          {regressionRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    {['OEM', 'Search', 'Product', 'Detail', 'Stock', 'Price', 'Final Result'].map((label) => (
                      <th key={label} className="p-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regressionRows.map((row) => (
                    <tr key={`${row.oem}-${row.normalizedOem}`} className="border-t border-border align-top">
                      <td className="p-2"><div>{row.oem}</div><div className="text-muted-foreground">{row.normalizedOem}</div></td>
                      <td className="p-2">{row.search}</td>
                      <td className="p-2 max-w-48 truncate" title={row.product}>{row.product}</td>
                      <td className="p-2">{row.detail}</td>
                      <td className="p-2">{row.stock}</td>
                      <td className="p-2">{money(row.price)}</td>
                      <td className="p-2"><div>{row.finalResult}</div><div className="text-muted-foreground">Sınıf {row.classification}: {row.message}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "settings" && (
        <div className="rounded-xl border border-border p-4 space-y-3 max-w-xl">
          <h3 className="font-semibold text-sm">Hesap Ayarları</h3>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">OnlineParça giriş URL'si</label>
            <Input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://.../giris"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              OEM arama URL şablonu (<code>{"{OEM}"}</code> yer tutucusu ile)
            </label>
            <Input
              value={searchTpl}
              onChange={(e) => setSearchTpl(e.target.value)}
              placeholder="https://.../arama?q={OEM}"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Kullanıcı adı</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Şifre{" "}
              {supplier.has_password ? "(kayıtlı — değiştirmek için yazın)" : "(kayıtlı değil)"}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
            <p className="text-[11px] text-muted-foreground">
              Şifre sunucu tarafındaki güvenli gizli anahtar deposunda saklanır; hiçbir arayüz
              yanıtında geri dönmez ve loglanmaz.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Aktif
          </label>
          <div className="flex gap-2">
            <Button onClick={onSaveSettings} disabled={savingSettings} size="sm">
              {savingSettings ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <Button onClick={onTest} disabled={testing} size="sm" variant="outline">
              {testing ? "Deneniyor…" : "Bağlantıyı Test Et"}
            </Button>
          </div>
        </div>
      )}

      {view === "scan" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4 space-y-3">
            <h3 className="font-semibold text-sm">OnlineParça OEM Tarayıcı</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs font-semibold cursor-pointer px-3 py-1.5 rounded-lg border border-border">
                OEM Excel Yükle
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onExcelUpload(f);
                  }}
                />
              </label>
              <Button size="sm" variant="outline" onClick={() => onLoadFromTasitsan(50)}>
                Taşıtsan listesinden 50 OEM
              </Button>
              <Button size="sm" variant="outline" onClick={() => onLoadFromTasitsan(500)}>
                500 OEM
              </Button>
            </div>
            <Textarea
              value={oemText}
              onChange={(e) => setOemText(e.target.value)}
              rows={6}
              placeholder="Her satıra bir OEM kodu"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Kâr oranı (%)</label>
                <Input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Minimum stok</label>
                <Input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tarama hızı</label>
                <select
                  value={speedIdx}
                  onChange={(e) => setSpeedIdx(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {SPEEDS.map((s, i) => (
                    <option key={s.label} value={i}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <div className="text-xs text-muted-foreground">
                  OEM Listesi: <strong>{oems.length}</strong>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onStart}
                disabled={running || oems.length === 0 || !requiredOemVerified}
              >
                {running ? "Taranıyor…" : "TARAMAYI BAŞLAT"}
              </Button>
              {!requiredOemVerified && !running && (
                <p className="text-xs text-amber-600">
                  Toplu tarama kilitli: önce Teknik Test bölümünde bir OEM doğrulanmalı.
                </p>
              )}
              {running && (
                <Button variant="outline" onClick={() => (cancelRef.current = true)}>
                  Durdur
                </Button>
              )}
            </div>
            {oems.length > 50 && !running && (
              <p className="text-[11px] text-amber-500">
                İlk aşamada 50 OEM ile test yapmanız önerilir. Büyük listelerde yavaş hız seçin.
              </p>
            )}
          </div>

          {(running || results.length > 0) && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span>
                  {progress.done} / {progress.total} OEM işleniyor — %
                  {progress.total ? Math.round((progress.done / progress.total) * 100) : 0}
                </span>
                <span>{elapsed} sn</span>
              </div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <div className="flex flex-wrap gap-3 text-xs">
                <span>
                  Toplam OEM: <strong>{progress.total}</strong>
                </span>
                <span className="text-emerald-500">Stokta: {summary.inStock}</span>
                <span className="text-amber-500">Stok yok: {summary.outOfStock}</span>
                <span className="text-red-500">Bulunamadı: {summary.notFound}</span>
                <span className="text-muted-foreground">Hata: {summary.error}</span>
              </div>
              {!running && results.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={downloadExcel}>
                    EXCEL İNDİR
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadUploadTemplate}>
                    TAŞITSAN YÜKLEME EXCEL'İ OLUŞTUR
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1.5 pr-3">OEM</th>
                      <th className="py-1.5 pr-3">Ürün</th>
                      <th className="py-1.5 pr-3">Marka</th>
                      <th className="py-1.5 pr-3">Stok</th>
                      <th className="py-1.5 pr-3">OnlineParça Fiyatı</th>
                      <th className="py-1.5 pr-3">Taşıtsan Fiyatı</th>
                      <th className="py-1.5">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={`${r.oem}-${i}`} className="border-t border-border/60">
                        <td className="py-1.5 pr-3 font-mono">{r.oem}</td>
                        <td className="py-1.5 pr-3 max-w-[220px] truncate">
                          {r.product_name ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">{r.brand ?? "—"}</td>
                        <td className="py-1.5 pr-3">{r.stock_quantity ?? "—"}</td>
                        <td className="py-1.5 pr-3">{money(r.supplier_price)}</td>
                        <td className="py-1.5 pr-3 font-semibold">{money(r.sale_price)}</td>
                        <td className={`py-1.5 ${STATUS_UI[r.status]?.cls ?? ""}`}>
                          {STATUS_UI[r.status]?.label ?? r.status}
                          {r.error_message ? ` — ${r.error_message}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "history" && (
        <div className="rounded-xl border border-border p-4 overflow-x-auto">
          <h3 className="font-semibold text-sm mb-3">Tarama Geçmişi</h3>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="py-1.5 pr-3">Başlangıç</th>
                <th className="py-1.5 pr-3">Bitiş</th>
                <th className="py-1.5 pr-3">Toplam</th>
                <th className="py-1.5 pr-3">Stokta</th>
                <th className="py-1.5 pr-3">Stok yok</th>
                <th className="py-1.5 pr-3">Bulunamadı</th>
                <th className="py-1.5 pr-3">Hata</th>
                <th className="py-1.5">Durum</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3">{new Date(j.started_at).toLocaleString("tr-TR")}</td>
                  <td className="py-1.5 pr-3">
                    {j.completed_at ? new Date(j.completed_at).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="py-1.5 pr-3">{j.total_oems}</td>
                  <td className="py-1.5 pr-3 text-emerald-500">{j.in_stock_count}</td>
                  <td className="py-1.5 pr-3 text-amber-500">{j.out_of_stock_count}</td>
                  <td className="py-1.5 pr-3 text-red-500">{j.not_found_count}</td>
                  <td className="py-1.5 pr-3">{j.error_count}</td>
                  <td className="py-1.5">{j.status}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-muted-foreground">
                    Henüz tarama yapılmadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {suppliers.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Kayıtlı tedarikçiler: {suppliers.map((s) => s.name).join(", ")}
        </p>
      )}
    </div>
  );
}
