import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Loader2, Trash2, Upload, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  autoDetectColumns,
  splitAlternativeOems,
  CATALOG_FIELD_LABEL,
  type CatalogField,
} from "@/lib/catalog-match";
import {
  catalogDeleteRecord,
  catalogDeleteSource,
  catalogImportChunk,
  catalogList,
  catalogSearchByName,
  catalogStats,
  type CatalogRow,
  type CatalogStats,
} from "@/lib/oem-catalog.functions";

const FIELDS: CatalogField[] = ["part_name", "oem_no", "brand", "vehicle_model", "vehicle_year", "alternative_oems"];
const CHUNK = 400;
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("tr-TR");
const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function OemCatalogPanel() {
  const getStats = useServerFn(catalogStats);
  const importChunk = useServerFn(catalogImportChunk);
  const listRows = useServerFn(catalogList);
  const delRecord = useServerFn(catalogDeleteRecord);
  const delSource = useServerFn(catalogDeleteSource);
  const searchByName = useServerFn(catalogSearchByName);

  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<CatalogField, number>>>({});
  const [sourceName, setSourceName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [listQ, setListQ] = useState("");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(0);

  const [testQ, setTestQ] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ matches: CatalogRow[]; weakMatches: CatalogRow[]; oems: string[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([getStats(), listRows({ data: { q: listQ || undefined, limit: 50, offset: 0 } })]);
      setStats(s);
      setRows(l.rows);
      setTotal(l.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Katalog verisi alınamadı");
    } finally {
      setLoading(false);
    }
  }, [getStats, listRows, listQ]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("Dosyada sayfa bulunamadı");
      const sheet = wb.Sheets[sheetName]!;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
      if (matrix.length < 2) throw new Error("Dosyada veri satırı yok");
      const head = (matrix[0] ?? []).map((h) => String(h ?? "").trim());
      setHeaders(head);
      setRawRows(matrix.slice(1));
      setMapping(autoDetectColumns(head));
      setSourceName(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`${matrix.length - 1} satır okundu`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dosya okunamadı");
    }
  }

  const parsedRows = useMemo(() => {
    const iName = mapping.part_name;
    const iOem = mapping.oem_no;
    if (iName === undefined || iOem === undefined) return [];
    const cell = (r: unknown[], i: number | undefined) =>
      i === undefined ? "" : String(r[i] ?? "").trim();
    return rawRows
      .map((r) => ({
        part_name: cell(r, iName),
        oem_no: cell(r, iOem),
        brand: cell(r, mapping.brand) || null,
        vehicle_model: cell(r, mapping.vehicle_model) || null,
        vehicle_year: cell(r, mapping.vehicle_year) || null,
        alternative_oems: splitAlternativeOems(cell(r, mapping.alternative_oems)),
      }))
      .filter((r) => r.part_name.length >= 2 && r.oem_no.length >= 2);
  }, [rawRows, mapping]);

  async function runImport() {
    if (!parsedRows.length) return toast.error("Geçerli satır yok");
    if (!sourceName.trim()) return toast.error("Katalog adı gerekli");
    setImporting(true);
    setProgress(0);
    let imported = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < parsedRows.length; i += CHUNK) {
        const slice = parsedRows.slice(i, i + CHUNK);
        const res = await importChunk({ data: { source_catalog: sourceName.trim(), rows: slice } });
        imported += res.imported;
        skipped += res.skipped;
        setProgress(Math.round(((i + slice.length) / parsedRows.length) * 100));
      }
      toast.success(`${num(imported)} kayıt aktarıldı · ${num(skipped)} atlandı`);
      setRawRows([]);
      setHeaders([]);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İçe aktarma başarısız");
    } finally {
      setImporting(false);
    }
  }

  async function runTest() {
    if (testQ.trim().length < 2) return;
    setTesting(true);
    try {
      const res = await searchByName({ data: { query: testQ.trim(), limit: 30, min_score: 0.2 } });
      setTestResult({ matches: res.matches, weakMatches: res.weakMatches ?? [], oems: res.oems });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Arama başarısız");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* İstatistikler */}
      <section className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">📚 OEM Kataloğu</h2>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[
            ["Kayıt", num(stats?.total_records)],
            ["OEM", num(stats?.total_oems)],
            ["Marka", num(stats?.total_brands)],
            ["Ürünle eşleşen", num(stats?.matched_in_parts)],
            ["Son yükleme", dt(stats?.last_upload ?? null)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-border bg-background/50 p-2">
              <div className="text-[10px] text-muted-foreground">{k}</div>
              <div className="text-sm font-bold">{v}</div>
            </div>
          ))}
        </div>

        {!!stats?.catalogs?.length && (
          <div className="mt-3 space-y-1">
            {stats.catalogs.map((c) => (
              <div key={c.source_catalog} className="flex items-center justify-between text-xs rounded-md border border-border px-2 py-1.5">
                <span className="truncate">
                  <b>{c.source_catalog}</b> · {num(c.records)} kayıt · {dt(c.last_upload)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive h-7"
                  onClick={async () => {
                    if (!confirm(`"${c.source_catalog}" kataloğundaki tüm kayıtlar silinsin mi?`)) return;
                    try {
                      const r = await delSource({ data: { source_catalog: c.source_catalog } });
                      toast.success(`${num(r.deleted)} kayıt silindi`);
                      await refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Silinemedi");
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Yükleme */}
      <section className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
        <h3 className="text-sm font-bold">Katalog Yükle (Excel / CSV)</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="block w-full text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />

        {headers.length > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f} className="text-xs flex items-center gap-2">
                  <span className="w-28 shrink-0 text-muted-foreground">{CATALOG_FIELD_LABEL[f]}</span>
                  <select
                    className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs"
                    value={mapping[f] ?? -1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMapping((m) => ({ ...m, [f]: v < 0 ? undefined : v }));
                    }}
                  >
                    <option value={-1}>— yok —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `Kolon ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="Katalog adı"
                className="h-8 text-xs max-w-[220px]"
              />
              <span className="text-xs text-muted-foreground">
                {num(parsedRows.length)} geçerli / {num(rawRows.length)} satır
              </span>
              <Button size="sm" onClick={() => void runImport()} disabled={importing || !parsedRows.length}>
                {importing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                İçe Aktar
              </Button>
            </div>

            {importing && <Progress value={progress} className="h-2" />}

            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    {FIELDS.map((f) => (
                      <th key={f} className="text-left px-2 py-1">{CATALOG_FIELD_LABEL[f]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{r.part_name}</td>
                      <td className="px-2 py-1 font-mono">{r.oem_no}</td>
                      <td className="px-2 py-1">{r.brand ?? "—"}</td>
                      <td className="px-2 py-1">{r.vehicle_model ?? "—"}</td>
                      <td className="px-2 py-1">{r.vehicle_year ?? "—"}</td>
                      <td className="px-2 py-1 font-mono">{r.alternative_oems.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Arama testi */}
      <section className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
        <h3 className="text-sm font-bold">Arama Testi (Parça adı → OEM)</h3>
        <div className="flex gap-2">
          <Input
            value={testQ}
            onChange={(e) => setTestQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runTest()}
            placeholder="örn. hilux ön fren balatası"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => void runTest()} disabled={testing}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {testResult && (
          <div className="space-y-2">
            <div className="text-xs">
              <b>Bulunan OEM'ler ({testResult.oems.length}):</b>{" "}
              <span className="font-mono">{testResult.oems.join(", ") || "—"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1">Parça</th>
                    <th className="text-left px-2 py-1">OEM</th>
                    <th className="text-left px-2 py-1">Marka / Model</th>
                    <th className="text-left px-2 py-1">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {testResult.matches.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-2 py-1">{m.part_name}</td>
                      <td className="px-2 py-1 font-mono">{m.oem_no}</td>
                      <td className="px-2 py-1">{[m.brand, m.vehicle_model].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-2 py-1">{Number(m.score ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(testResult.weakMatches?.length ?? 0) > 0 && (
              <div className="rounded-md border border-dashed border-border p-2 space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  Yakın ama düşük güvenli eşleşmeler (OEM aramasına gönderilmez):
                </div>
                {testResult.weakMatches.map((m) => (
                  <div key={m.id} className="text-[11px] flex gap-2">
                    <span className="flex-1">{m.part_name}</span>
                    <span className="font-mono">{m.oem_no}</span>
                    <span className="text-muted-foreground">{Number(m.score ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </section>

      {/* Kayıtlar */}
      <section className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
        <div className="flex gap-2 items-center">
          <h3 className="text-sm font-bold shrink-0">Kayıtlar ({num(total)})</h3>
          <Input
            value={listQ}
            onChange={(e) => setListQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void refresh()}
            placeholder="parça adı veya OEM ara"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => void refresh()}>Ara</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">Parça</th>
                <th className="text-left px-2 py-1">OEM</th>
                <th className="text-left px-2 py-1">Marka / Model</th>
                <th className="text-left px-2 py-1">Katalog</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1">{r.part_name}</td>
                  <td className="px-2 py-1 font-mono">{r.oem_no}</td>
                  <td className="px-2 py-1">{[r.brand, r.vehicle_model].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="px-2 py-1">{r.source_catalog}</td>
                  <td className="px-2 py-1 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-destructive"
                      onClick={async () => {
                        try {
                          await delRecord({ data: { id: r.id } });
                          await refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Silinemedi");
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">Kayıt yok</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
