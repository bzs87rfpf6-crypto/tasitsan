import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { listExternalSuppliers, updateExternalSupplier } from "@/lib/external-supplier.functions";
import { recalcSupplierPrices } from "@/lib/external-oem.functions";

import { calcSupplierSalePrice } from "@/lib/external-supplier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { translateError } from "@/lib/error-messages";

interface Row {
  id: string;
  name: string;
  active: boolean;
  default_margin: number;
  last_scan_at: string | null;
  last_connected_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  product_count: number;
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("tr-TR") : "—");
const money = (n: number) => `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ExternalSuppliersPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [recalcing, setRecalcing] = useState<string | null>(null);
  const [margins, setMargins] = useState<Record<string, string>>({});

  const list = useServerFn(listExternalSuppliers);
  const update = useServerFn(updateExternalSupplier);
  const recalc = useServerFn(recalcSupplierPrices);

  const doRecalc = async (row: Row) => {
    setRecalcing(row.id);
    try {
      const res = (await recalc({ data: { supplierId: row.id } })) as { updated?: number };
      toast.success(`${res?.updated ?? 0} ürünün satış fiyatı güncellendi`);
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setRecalcing(null);
    }
  };


  const load = async () => {
    setLoading(true);
    try {
      const data = (await list()) as Row[];
      setRows(data);
      setMargins(Object.fromEntries(data.map((r) => [r.id, String(r.default_margin ?? 0)])));
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (row: Row, patch: { active?: boolean; margin?: number }) => {
    setSaving(row.id);
    try {
      await update({ data: { supplierId: row.id, ...patch } });
      toast.success("Kaydedildi");
      setRows((prev) => prev.map((r) => (r.id === row.id
        ? { ...r, active: patch.active ?? r.active, default_margin: patch.margin ?? r.default_margin }
        : r)));
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg">🌐 Harici Tedarikçiler</h2>
          <p className="text-xs text-muted-foreground">Harici Tedarikçi Fiyatlandırması — kâr oranı buradan yönetilir.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tedarikçi kaydı yok.</p>
      ) : (
        rows.map((r) => {
          const margin = Number(margins[r.id] ?? r.default_margin) || 0;
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">{r.name}</div>
                <button
                  onClick={() => void save(r, { active: !r.active })}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    r.active ? "border-emerald-500/50 text-emerald-500" : "border-border text-muted-foreground"
                  }`}
                >
                  {r.active ? "Aktif" : "Pasif"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Son sorgulama: {dt(r.last_scan_at ?? r.last_connected_at)}</div>
                <div>Son başarılı sorgu: {dt(r.last_success_at)}</div>
                <div>Tedarikçi ürün sayısı: <span className="text-foreground font-semibold">{r.product_count}</span></div>
                <div className="truncate">Son hata: {r.last_error ? `${r.last_error} (${dt(r.last_error_at)})` : "—"}</div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Kâr oranı (%)</label>
                  <Input
                    type="number" min={0} max={500} step="0.1"
                    value={margins[r.id] ?? ""}
                    onChange={(e) => setMargins((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                </div>
                <Button size="sm" disabled={saving === r.id} onClick={() => void save(r, { margin })}>
                  {saving === r.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span className="ml-1.5">Kaydet</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recalcing === r.id}
                  onClick={() => void doRecalc(r)}
                  title="Kâr oranına göre tüm harici ürün satış fiyatlarını yeniden hesapla"
                >
                  {recalcing === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  <span className="ml-1.5">Fiyatları Güncelle</span>
                </Button>
              </div>


              <p className="text-[11px] text-muted-foreground">
                Örnek: alış {money(512.18)} × (1 + %{margin} / 100) = satış{" "}
                <span className="text-gold font-semibold">{money(calcSupplierSalePrice(512.18, margin))}</span> (KDV hariç,
                KDV sepette eklenir)
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
