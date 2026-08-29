import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSpreadsheet, Trash2, Eye, RefreshCw, ChevronDown } from "lucide-react";
import { translateError } from "@/lib/error-messages";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import { formatDeleteResult } from "@/lib/bulk-delete";
import {
  listMyImportBatches,
  listBatchParts,
  bulkDeleteParts,
  type ImportBatchRow,
} from "@/lib/bulk-delete.functions";

const MODE_LABEL: Record<string, string> = {
  insert: "Yeni İlan",
  update: "Toplu Güncelle",
  stock: "Stok Güncelle",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" });
}

interface Props {
  onChanged?: () => void;
}

export function ImportBatchesPanel({ onChanged }: Props) {
  const fetchBatches = useServerFn(listMyImportBatches);
  const fetchParts = useServerFn(listBatchParts);
  const runDelete = useServerFn(bulkDeleteParts);

  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [target, setTarget] = useState<ImportBatchRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchBatches({ data: undefined as never })
      .then((r) => setBatches(r as ImportBatchRow[]))
      .catch((e) => toast.error(translateError(e, "Yükleme geçmişi alınamadı")))
      .finally(() => setLoading(false));
  }, [fetchBatches]);

  useEffect(() => { load(); }, [load]);

  const openBatch = async (b: ImportBatchRow) => {
    if (openId === b.id) { setOpenId(null); return; }
    setOpenId(b.id);
    setParts([]);
    try {
      const rows = await fetchParts({ data: { batchId: b.id } });
      setParts(rows as any[]);
    } catch (e: any) {
      toast.error(translateError(e, "Ürünler alınamadı"));
    }
  };

  const confirmDelete = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await runDelete({ data: { batchId: target.id } });
      toast.success(formatDeleteResult(res as any));
      setTarget(null);
      setOpenId(null);
      load();
      onChanged?.();
    } catch (e: any) {
      toast.error(translateError(e, "Toplu silme başarısız"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">Yükleme geçmişi yükleniyor...</p>;
  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Henüz toplu yükleme yapmadınız.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Son {batches.length} toplu yükleme</p>
        <button type="button" onClick={load} className="h-8 px-2.5 rounded-md border border-border text-[11px] font-semibold inline-flex items-center gap-1 hover:border-gold">
          <RefreshCw className="size-3" /> Yenile
        </button>
      </div>

      {batches.map((b) => (
        <div key={b.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <FileSpreadsheet className="size-4 text-gold" /> {fmtDate(b.created_at)}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {MODE_LABEL[b.mode] ?? b.mode} • {b.file_name ?? "dosya"} •{" "}
                <span className="text-foreground font-semibold">{b.live_count.toLocaleString("tr-TR")}</span> ürün
                {b.inserted_count !== b.live_count && ` (${b.inserted_count.toLocaleString("tr-TR")} eklendi)`}
                {b.fail_count > 0 && ` • ${b.fail_count} hatalı`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openBatch(b)}
                className="h-8 px-2.5 rounded-md border border-border text-[11px] font-semibold inline-flex items-center gap-1 hover:border-gold">
                <Eye className="size-3" /> Ürünleri Gör
                <ChevronDown className={`size-3 transition ${openId === b.id ? "rotate-180" : ""}`} />
              </button>
              <button type="button" disabled={b.live_count === 0} onClick={() => setTarget(b)}
                className="h-8 px-2.5 rounded-md text-[11px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40 inline-flex items-center gap-1">
                <Trash2 className="size-3" /> Toplu Sil
              </button>
            </div>
          </div>

          {openId === b.id && (
            <div className="border-t border-border max-h-72 overflow-auto">
              {parts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground p-3">Bu yüklemede silinmemiş ürün yok.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {parts.slice(0, 300).map((p) => (
                    <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate">{p.title}</span>
                      <span className="text-gold font-semibold whitespace-nowrap">
                        {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "—"}
                      </span>
                    </li>
                  ))}
                  {parts.length > 300 && (
                    <li className="px-3 py-2 text-[11px] text-muted-foreground">
                      ...ve {(parts.length - 300).toLocaleString("tr-TR")} ürün daha
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}

      <BulkDeleteDialog
        open={!!target}
        onOpenChange={(v) => { if (!v) setTarget(null); }}
        count={target?.live_count ?? 0}
        context={target ? `${fmtDate(target.created_at)} yüklemesi — yalnızca bu yüklemede eklenen ürünler silinir.` : undefined}
        busy={busy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
