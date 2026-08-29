import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  History,
  Loader2,
  Percent,
  RotateCcw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  priceBulkApply,
  priceBulkBrandStats,
  priceBulkHistory,
  priceBulkOperationItems,
  priceBulkOverview,
  priceBulkPreview,
  priceBulkUndo,
  type BrandPriceStat,
  type PriceOperationRow,
  type PricePreview,
} from "@/lib/price-bulk.functions";

const tl = (n: number | null | undefined) =>
  `₺${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("tr-TR");
const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";

type Op = "increase" | "decrease";

export function BulkPricePanel() {
  const getOverview = useServerFn(priceBulkOverview);
  const getBrands = useServerFn(priceBulkBrandStats);
  const getHistory = useServerFn(priceBulkHistory);
  const doPreview = useServerFn(priceBulkPreview);
  const doApply = useServerFn(priceBulkApply);
  const doUndo = useServerFn(priceBulkUndo);
  const getItems = useServerFn(priceBulkOperationItems);

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof priceBulkOverview>> | null>(null);
  const [brands, setBrands] = useState<BrandPriceStat[]>([]);
  const [history, setHistory] = useState<PriceOperationRow[]>([]);
  const [q, setQ] = useState("");

  const [brand, setBrand] = useState<BrandPriceStat | null>(null);
  const [op, setOp] = useState<Op>("increase");
  const [percent, setPercent] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [oem, setOem] = useState("");
  const [category, setCategory] = useState("");

  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirm2, setConfirm2] = useState(false);
  const [undoTarget, setUndoTarget] = useState<PriceOperationRow | null>(null);
  const [detail, setDetail] = useState<PriceOperationRow | null>(null);
  const [detailRows, setDetailRows] = useState<
    { part_id: string; title: string; oem_code: string | null; old_price: number; new_price: number }[]
  >([]);

  const load = async () => {
    setLoading(true);
    // Her sorgu bağımsız çalışır: biri hata verirse diğer istatistikler yine gösterilir.
    const [o, b, h] = await Promise.allSettled([getOverview({}), getBrands({}), getHistory({})]);
    const failed: string[] = [];
    if (o.status === "fulfilled") setOverview(o.value);
    else {
      console.error("[BulkPrice] overview error:", o.reason);
      failed.push("özet");
    }
    if (b.status === "fulfilled") setBrands(b.value);
    else {
      console.error("[BulkPrice] brand stats error:", b.reason);
      failed.push("marka listesi");
    }
    if (h.status === "fulfilled") setHistory(h.value);
    else {
      console.error("[BulkPrice] history error:", h.reason);
      failed.push("işlem geçmişi");
    }
    if (failed.length) toast.error(`Bazı veriler yüklenemedi: ${failed.join(", ")}`);
    setLoading(false);
  };


  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBrands = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return brands;
    return brands.filter((b) => b.brand.toLocaleLowerCase("tr-TR").includes(needle));
  }, [brands, q]);

  const filters = () => {
    const f: Record<string, unknown> = {};
    if (onlyInStock) f['in_stock'] = true;
    if (onlyWithPhotos) f['has_photos'] = true;
    if (minPrice && Number(minPrice) > 0) f['min_price'] = Number(minPrice);
    if (maxPrice && Number(maxPrice) > 0) f['max_price'] = Number(maxPrice);
    if (oem.trim()) f['oem'] = oem.trim();
    if (category.trim()) f['category'] = category.trim();
    return f;
  };

  const validPercent = () => {
    const p = Number(percent.replace(",", "."));
    if (!percent.trim() || Number.isNaN(p)) {
      toast.error("Geçerli bir yüzde giriniz");
      return null;
    }
    if (p <= 0) {
      toast.error("Yüzde 0'dan büyük olmalı");
      return null;
    }
    if (op === "decrease" && p >= 100) {
      toast.error("İndirim oranı %100 veya üzeri olamaz");
      return null;
    }
    return p;
  };

  const runPreview = async () => {
    if (!brand) return;
    const p = validPercent();
    if (p == null) return;
    setBusy(true);
    setPreview(null);
    try {
      const res = await doPreview({
        data: { brand: brand.brand, operation: op, percent: p, filters: filters() as never },
      });
      if (!res || res.count === 0) {
        toast.error("Bu filtrelerle güncellenecek ürün bulunamadı");
        return;
      }
      setPreview(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Önizleme oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!brand || !preview) return;
    const p = validPercent();
    if (p == null) return;
    setBusy(true);
    try {
      const res = await doApply({
        data: { brand: brand.brand, operation: op, percent: p, filters: filters() as never },
      });
      toast.success(`${num(res.count)} ürünün fiyatı güncellendi (${tl(res.diff_total)} fark)`);
      setConfirmOpen(false);
      setConfirm2(false);
      setPreview(null);
      setBrand(null);
      setPercent("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Güncelleme başarısız");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!undoTarget) return;
    setBusy(true);
    try {
      const res = await doUndo({ data: { operationId: undoTarget.id } });
      toast.success(`${num(res.reverted_count)} ürün eski fiyatına döndürüldü`);
      setUndoTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Geri alma başarısız");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (row: PriceOperationRow) => {
    setDetail(row);
    setDetailRows([]);
    try {
      setDetailRows(await getItems({ data: { operationId: row.id } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Detay yüklenemedi");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
      </div>
    );
  }

  /* ---------- Brand workspace ---------- */
  if (brand) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setBrand(null); setPreview(null); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Marka listesine dön
        </Button>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-display text-xl text-gold">{brand.brand} — Toplu Fiyat Güncelleme</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Info label="Ürün sayısı" value={num(brand.total_products)} />
            <Info label="Fiyatlı ürün" value={num(brand.priced_products)} />
            <Info label="Ortalama fiyat" value={tl(brand.avg_price)} />
            <Info label="Son güncelleme" value={dt(brand.last_price_update)} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={op === "increase" ? "default" : "outline"}
              size="sm"
              onClick={() => { setOp("increase"); setPreview(null); }}
            >
              <TrendingUp className="mr-1 h-4 w-4" /> Yüzde Artır
            </Button>
            <Button
              variant={op === "decrease" ? "default" : "outline"}
              size="sm"
              onClick={() => { setOp("decrease"); setPreview(null); }}
            >
              <TrendingDown className="mr-1 h-4 w-4" /> Yüzde Azalt
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Oran (%)</label>
              <div className="relative">
                <Percent className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-32 pl-8"
                  inputMode="decimal"
                  value={percent}
                  onChange={(e) => { setPercent(e.target.value); setPreview(null); }}
                  placeholder="15"
                />
              </div>
            </div>
            <Button onClick={runPreview} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Önizlemeyi Oluştur
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-3">
            <FilterField label="Min. fiyat (₺)">
              <Input inputMode="decimal" value={minPrice} onChange={(e) => { setMinPrice(e.target.value); setPreview(null); }} />
            </FilterField>
            <FilterField label="Maks. fiyat (₺)">
              <Input inputMode="decimal" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPreview(null); }} />
            </FilterField>
            <FilterField label="Kategori">
              <Input value={category} onChange={(e) => { setCategory(e.target.value); setPreview(null); }} />
            </FilterField>
            <FilterField label="OEM kodu içerir">
              <Input value={oem} onChange={(e) => { setOem(e.target.value); setPreview(null); }} />
            </FilterField>
            <label className="flex items-center gap-2 text-sm md:col-span-1 md:self-end">
              <Checkbox checked={onlyInStock} onCheckedChange={(v) => { setOnlyInStock(!!v); setPreview(null); }} />
              Sadece stokta olanlar
            </label>
            <label className="flex items-center gap-2 text-sm md:self-end">
              <Checkbox checked={onlyWithPhotos} onCheckedChange={(v) => { setOnlyWithPhotos(!!v); setPreview(null); }} />
              Sadece fotoğraflı ürünler
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Fiyatı boş veya 0 olan ürünler hiçbir zaman güncellenmez.
          </p>
        </div>

        {preview && (
          <div className="rounded-xl border border-gold/40 bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Info label="Güncellenecek ürün" value={`${num(preview.count)} ürün`} />
              <Info label="Toplam eski değer" value={tl(preview.old_total)} />
              <Info label="Toplam yeni değer" value={tl(preview.new_total)} />
              <Info label="Toplam fark" value={tl(preview.diff_total)} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Ürün</th>
                    <th className="p-2 text-left">OEM</th>
                    <th className="p-2 text-right">Mevcut Fiyat</th>
                    <th className="p-2 text-right">Değişim</th>
                    <th className="p-2 text-right">Yeni Fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">{r.title}</td>
                      <td className="p-2 text-muted-foreground">{r.oem_code ?? "—"}</td>
                      <td className="p-2 text-right">{tl(r.old_price)}</td>
                      <td className={`p-2 text-right ${op === "increase" ? "text-emerald-600" : "text-red-600"}`}>
                        {op === "increase" ? "+" : "−"}%{percent}
                      </td>
                      <td className="p-2 text-right font-semibold">{tl(r.new_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.count > preview.sample.length && (
              <p className="text-xs text-muted-foreground">
                İlk {preview.sample.length} ürün gösteriliyor; işlem {num(preview.count)} ürünü kapsar.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Vazgeç</Button>
              <Button onClick={() => { setConfirm2(false); setConfirmOpen(true); }}>
                Onayla ve Fiyatları Güncelle
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirm2(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fiyat güncellemesini onaylayın</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>{brand.brand}</strong> markasına ait <strong>{num(preview?.count ?? 0)}</strong> ürünün
                    fiyatı %{percent} {op === "increase" ? "artırılacaktır" : "azaltılacaktır"}.
                  </p>
                  <p>Eski toplam: {tl(preview?.old_total)}</p>
                  <p>Yeni toplam: {tl(preview?.new_total)}</p>
                  <p>Fark: {tl(preview?.diff_total)}</p>
                  <label className="mt-2 flex items-center gap-2">
                    <Checkbox checked={confirm2} onCheckedChange={(v) => setConfirm2(!!v)} />
                    Evet, fiyatları güncellemek istiyorum.
                  </label>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                disabled={!confirm2 || busy}
                onClick={(e) => { e.preventDefault(); void apply(); }}
              >
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Fiyatları Güncelle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  /* ---------- Overview + brand list + history ---------- */
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Info card label="Toplam ürün" value={num(overview?.totalProducts)} />
        <Info card label="Fiyatı olan ürün" value={num(overview?.pricedProducts)} />
        <Info card label="Markası olan ürün" value={num(overview?.brandedProducts)} />
        <Info card label="Son fiyat güncelleme" value={dt(overview?.lastPriceUpdate ?? null)} />
        <Info
          card
          label="Son toplu işlem"
          value={
            overview?.lastOperation
              ? `${overview.lastOperation.brand} • ${overview.lastOperation.operation_type === "increase" ? "+" : "−"}%${overview.lastOperation.percent}`
              : "—"
          }
        />
        <Info card label="Son işlemde değişen" value={overview?.lastOperation ? `${num(overview.lastOperation.affected_count)} ürün` : "—"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-gold">Markalar</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-56 pl-8" placeholder="Marka ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Marka</th>
                <th className="p-2 text-right">Ürün</th>
                <th className="p-2 text-right">Fiyatlı</th>
                <th className="p-2 text-right">Ort. fiyat</th>
                <th className="p-2 text-right">Stok değeri</th>
                <th className="p-2 text-left">Son güncelleme</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredBrands.map((b) => (
                <tr key={b.brand} className="border-t border-border">
                  <td className="p-2 font-medium">{b.brand}</td>
                  <td className="p-2 text-right">{num(b.total_products)}</td>
                  <td className="p-2 text-right">{num(b.priced_products)}</td>
                  <td className="p-2 text-right">{tl(b.avg_price)}</td>
                  <td className="p-2 text-right">{tl(b.stock_value)}</td>
                  <td className="p-2 text-muted-foreground">{dt(b.last_price_update)}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      disabled={b.priced_products === 0}
                      onClick={() => { setBrand(b); setPreview(null); setPercent(""); }}
                    >
                      Fiyat Güncelle
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredBrands.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">Marka bulunamadı</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg text-gold">
          <History className="h-4 w-4" /> Fiyat Güncelleme Geçmişi
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Tarih</th>
                <th className="p-2 text-left">Marka</th>
                <th className="p-2 text-left">İşlem</th>
                <th className="p-2 text-right">Ürün</th>
                <th className="p-2 text-right">Eski toplam</th>
                <th className="p-2 text-right">Yeni toplam</th>
                <th className="p-2 text-right">Fark</th>
                <th className="p-2 text-left">Admin</th>
                <th className="p-2 text-left">Durum</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => void openDetail(h)}>
                  <td className="p-2 whitespace-nowrap">{dt(h.created_at)}</td>
                  <td className="p-2">{h.brand}</td>
                  <td className="p-2">
                    {h.operation_type === "increase" ? "+" : "−"}%{h.percent}
                  </td>
                  <td className="p-2 text-right">{num(h.affected_count)}</td>
                  <td className="p-2 text-right">{tl(h.old_total)}</td>
                  <td className="p-2 text-right">{tl(h.new_total)}</td>
                  <td className={`p-2 text-right ${h.diff_total >= 0 ? "text-emerald-600" : "text-red-600"}`}>{tl(h.diff_total)}</td>
                  <td className="p-2 text-muted-foreground">{h.actor_email ?? "—"}</td>
                  <td className="p-2">{h.reverted_at ? "Geri alındı" : "Başarılı"}</td>
                  <td className="p-2 text-right">
                    {!h.reverted_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setUndoTarget(h); }}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Geri Al
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">Henüz toplu fiyat işlemi yok</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İşlemi geri al</AlertDialogTitle>
            <AlertDialogDescription>
              {undoTarget?.brand} — %{undoTarget?.percent}{" "}
              {undoTarget?.operation_type === "increase" ? "artış" : "indirim"} işlemi geri alınacak. Yalnızca
              bu işlemden sonra fiyatı değişmemiş ürünler eski fiyatına döner.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void undo(); }}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Geri Al
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.brand} — %{detail?.percent} {detail?.operation_type === "increase" ? "Zam" : "İndirim"} ({num(detail?.affected_count)} ürün)
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Ürün</th>
                  <th className="p-2 text-left">OEM</th>
                  <th className="p-2 text-right">Eski</th>
                  <th className="p-2 text-right">Yeni</th>
                  <th className="p-2 text-right">Değişim</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r) => (
                  <tr key={r.part_id} className="border-t border-border">
                    <td className="p-2">{r.title}</td>
                    <td className="p-2 text-muted-foreground">{r.oem_code ?? "—"}</td>
                    <td className="p-2 text-right">{tl(r.old_price)}</td>
                    <td className="p-2 text-right">{tl(r.new_price)}</td>
                    <td className="p-2 text-right">{tl(r.new_price - r.old_price)}</td>
                  </tr>
                ))}
                {detailRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">Yükleniyor…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, card }: { label: string; value: string; card?: boolean }) {
  return (
    <div className={card ? "rounded-xl border border-border bg-card p-3" : ""}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
