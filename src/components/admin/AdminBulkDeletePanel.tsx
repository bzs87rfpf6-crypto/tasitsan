import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, Search, RefreshCw, History, FileSpreadsheet } from "lucide-react";
import { translateError } from "@/lib/error-messages";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import { deleteInChunks, formatDeleteResult } from "@/lib/bulk-delete";
import {
  adminListImportBatches,
  adminSearchParts,
  adminListDeleteLog,
  bulkDeleteParts,
  type ImportBatchRow,
} from "@/lib/bulk-delete.functions";

interface PartRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  status: string;
  created_at: string;
  seller_id: string;
  seller_name: string | null;
}

const STATUSES = ["", "pending", "approved", "rejected", "inactive"] as const;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function AdminBulkDeletePanel() {
  const search = useServerFn(adminSearchParts);
  const listBatches = useServerFn(adminListImportBatches);
  const listLog = useServerFn(adminListDeleteLog);
  const runDelete = useServerFn(bulkDeleteParts);

  const [filters, setFilters] = useState({ brand: "", model: "", status: "", batchId: "", dateFrom: "", dateTo: "" });
  const [rows, setRows] = useState<PartRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [confirmSel, setConfirmSel] = useState(false);
  const [batchTarget, setBatchTarget] = useState<ImportBatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  const loadAux = useCallback(() => {
    listBatches({ data: undefined as never }).then((b) => setBatches(b as ImportBatchRow[])).catch(() => {});
    listLog({ data: undefined as never }).then((l) => setLog(l as any[])).catch(() => {});
  }, [listBatches, listLog]);

  useEffect(() => { loadAux(); }, [loadAux]);

  const runSearch = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await search({
        data: {
          brand: filters.brand || undefined,
          model: filters.model || undefined,
          status: filters.status || undefined,
          batchId: filters.batchId || undefined,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : undefined,
          dateTo: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).toISOString() : undefined,
          limit: 1000,
        },
      });
      setRows(res as PartRow[]);
      if ((res as PartRow[]).length === 0) toast.info("Filtreye uyan ürün bulunamadı.");
    } catch (e: any) {
      toast.error(translateError(e, "Arama başarısız"));
    } finally {
      setLoading(false);
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const deleteSelected = async () => {
    setBusy(true);
    setProgress({ processed: 0, total: selected.size });
    try {
      const res = await deleteInChunks(
        (args) => runDelete(args) as any,
        Array.from(selected),
        (processed, total) => setProgress({ processed, total }),
      );
      toast.success(formatDeleteResult(res));
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      setConfirmSel(false);
      loadAux();
    } catch (e: any) {
      toast.error(translateError(e, "Silme başarısız"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const deleteBatch = async () => {
    if (!batchTarget) return;
    setBusy(true);
    try {
      const res = await runDelete({ data: { batchId: batchTarget.id } });
      toast.success(formatDeleteResult(res as any));
      setBatchTarget(null);
      setRows([]);
      loadAux();
    } catch (e: any) {
      toast.error(translateError(e, "Silme başarısız"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filtreler */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-destructive font-semibold flex items-center gap-1.5">
          <Trash2 className="size-4" /> Toplu Ürün Sil
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Input placeholder="Marka" value={filters.brand} onChange={(e) => setFilters({ ...filters, brand: e.target.value })} className="h-9" />
          <Input placeholder="Model" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} className="h-9" />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="h-9 px-2 rounded-md bg-background border border-border text-xs">
            {STATUSES.map((s) => <option key={s} value={s}>{s === "" ? "Tüm durumlar" : s}</option>)}
          </select>
          <select value={filters.batchId} onChange={(e) => setFilters({ ...filters, batchId: e.target.value })}
            className="h-9 px-2 rounded-md bg-background border border-border text-xs">
            <option value="">Tüm yüklemeler</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {fmtDate(b.created_at)} — {b.seller_name ?? "?"} ({b.live_count})
              </option>
            ))}
          </select>
          <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="h-9" />
          <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="h-9" />
        </div>
        <Button onClick={runSearch} disabled={loading} className="h-9 bg-gold-gradient text-gold-foreground font-semibold">
          <Search className="size-4 mr-1.5" /> {loading ? "Aranıyor..." : "Ürünleri Getir"}
        </Button>
      </section>

      {/* Sonuçlar */}
      {rows.length > 0 && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-border">
            <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Tümünü Seç ({rows.length.toLocaleString("tr-TR")})
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-destructive font-semibold">{selected.size.toLocaleString("tr-TR")} ürün seçildi</span>
              <Button variant="destructive" size="sm" disabled={selected.size === 0} onClick={() => setConfirmSel(true)}>
                <Trash2 className="size-3.5 mr-1" /> Seçilenleri Sil
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border max-h-[28rem] overflow-auto">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center gap-2 text-[11px]">
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-muted-foreground truncate max-w-28 hidden sm:block">{r.seller_name ?? "—"}</span>
                <span className="text-muted-foreground hidden sm:block">{r.status}</span>
                <span className="text-gold font-semibold">{r.price != null ? `₺${Number(r.price).toLocaleString("tr-TR")}` : "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Yükleme geçmişi */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <FileSpreadsheet className="size-4" /> Toplu Yükleme Geçmişi
          </h3>
          <button type="button" onClick={loadAux} className="h-8 px-2.5 rounded-md border border-border text-[11px] font-semibold inline-flex items-center gap-1">
            <RefreshCw className="size-3" /> Yenile
          </button>
        </div>
        {batches.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Kayıt yok.</p>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-auto">
            {batches.map((b) => (
              <li key={b.id} className="py-2 flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{b.seller_name ?? b.user_id.slice(0, 8)}</p>
                  <p className="text-muted-foreground truncate">
                    {fmtDate(b.created_at)} • {b.file_name ?? "—"} • {b.live_count.toLocaleString("tr-TR")} ürün
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={b.live_count === 0} onClick={() => setBatchTarget(b)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10">
                  Bu Yüklemenin Tümünü Sil
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Silme logu */}
      <section className="bg-card border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <History className="size-4" /> Silme İşlem Geçmişi
        </h3>
        {log.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Henüz silme kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-auto">
            {log.map((l) => (
              <li key={l.id} className="py-2 text-[11px]">
                <span className="font-semibold">{l.actor_name ?? "?"}</span>{" "}
                <span className="text-muted-foreground">{fmtDate(l.created_at)}</span> —{" "}
                <span className="text-destructive font-semibold">{Number(l.deleted_count ?? 0).toLocaleString("tr-TR")} ürün silindi</span>
                {l.owner_names?.length > 0 && <span className="text-muted-foreground"> • Satıcı: {l.owner_names.join(", ")}</span>}
                {l.batch_id && <span className="text-muted-foreground"> • Batch: {String(l.batch_id).slice(0, 8)}…</span>}
                {l.operation && <span className="text-muted-foreground"> • {l.operation}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <BulkDeleteDialog open={confirmSel} onOpenChange={setConfirmSel} count={selected.size}
        busy={busy} progress={progress} onConfirm={deleteSelected} />
      <BulkDeleteDialog open={!!batchTarget} onOpenChange={(v) => { if (!v) setBatchTarget(null); }}
        count={batchTarget?.live_count ?? 0}
        context={batchTarget ? `${fmtDate(batchTarget.created_at)} — ${batchTarget.seller_name ?? ""} yüklemesi` : undefined}
        busy={busy} onConfirm={deleteBatch} />
    </div>
  );
}
