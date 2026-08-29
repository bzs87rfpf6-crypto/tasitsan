import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Loader2, X, Truck, Search, Archive, Trash2, AlertTriangle } from "lucide-react";
import {
  adminListOrders, adminGetOrder, adminUpdateOrderStatus, adminUpdateOrderTracking,
  adminArchiveOrder, adminDeleteOrder, currentUserIsSuperAdmin,
} from "@/lib/orders.functions";
import { ORDER_STATUSES, shippingLabel, statusLabel } from "@/lib/orders";
import { VAT_LABEL } from "@/lib/tax";
import { listOrderSupply, updateOrderSupplyStatus } from "@/lib/external-supplier.functions";
import { SUPPLY_STATUSES, supplyStatusLabel } from "@/lib/external-supplier";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { translateError } from "@/lib/error-messages";

const STATUS_TABS = [{ key: "all", label: "Tümü" }, ...ORDER_STATUSES.map((s) => ({ key: s.key, label: s.label }))];


interface Order {
  id: string; order_number: string; full_name: string; company: string | null; phone: string;
  email: string | null; city: string | null; note: string | null;
  subtotal: number; tax: number; shipping: number; total: number; item_count: number;
  has_quote_items: boolean; status: string; created_at: string; user_id: string | null;
  shipping_method: string | null; is_urgent: boolean;
  billing_type: string | null; billing_company: string | null; tax_office: string | null; tax_number: string | null;
  tracking_number: string | null; tracking_carrier: string | null;
  has_supplier_items?: boolean | null;
}
interface OrderItem {
  id: string; title: string; oem_code: string | null; product_code: string | null;
  seller_name: string | null; photo: string | null; quantity: number;
  unit_price: number | null; line_total: number | null; is_quote: boolean;
  seller_id: string | null; part_id: string | null;
  supplier_stock?: boolean | null; procurement_days?: number | null;
  source_type?: string | null; supplier_name?: string | null;
}
interface SupplyRow {
  id: string; order_item_id: string; source_type: string; supplier_name: string | null;
  supplier_product_id: string | null; supplier_cost_price: number | null;
  supplier_sale_price: number | null; supply_status: string; supplier_note: string | null;
}

function money(n: number) { return `₺${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export function OrdersPanel() {
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [supply, setSupply] = useState<SupplyRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [tn, setTn] = useState("");
  const [tc, setTc] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const list = useServerFn(adminListOrders);
  const detail = useServerFn(adminGetOrder);
  const update = useServerFn(adminUpdateOrderStatus);
  const updateTracking = useServerFn(adminUpdateOrderTracking);
  const archiveFn = useServerFn(adminArchiveOrder);
  const deleteFn = useServerFn(adminDeleteOrder);
  const checkSuper = useServerFn(currentUserIsSuperAdmin);
  const loadSupply = useServerFn(listOrderSupply);
  const setSupplyStatus = useServerFn(updateOrderSupplyStatus);

  useEffect(() => {
    void (async () => {
      try { const r = await checkSuper(); setIsSuper(!!r.is_super_admin); } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await list({ data: { status, limit: 200, q, from: from || undefined, to: to || undefined } });
      setOrders(rows as Order[]);
    } catch (e) { toast.error(translateError(e)); }
    finally { setLoading(false); }
  };


  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const openDetail = async (o: Order) => {
    setSelected(o); setTn(o.tracking_number ?? ""); setTc(o.tracking_carrier ?? "");
    setDetailLoading(true);
    try {
      const res = await detail({ data: { id: o.id } });
      setSelected((res.order as Order) ?? o);
      setItems(res.items as OrderItem[]);
      try { setSupply((await loadSupply({ data: { orderId: o.id } })) as SupplyRow[]); }
      catch { setSupply([]); }
    } catch (e) { toast.error(translateError(e)); }
    finally { setDetailLoading(false); }
  };

  const changeStatus = async (newStatus: string) => {
    if (!selected) return;
    setUpdating(true);
    try {
      await update({ data: { id: selected.id, status: newStatus } });
      toast.success("Durum güncellendi");
      setSelected({ ...selected, status: newStatus });
      setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, status: newStatus } : o)));
    } catch (e) { toast.error(translateError(e)); }
    finally { setUpdating(false); }
  };

  const saveTracking = async () => {
    if (!selected) return;
    try {
      await updateTracking({ data: { id: selected.id, tracking_number: tn, tracking_carrier: tc } });
      toast.success("Takip bilgisi kaydedildi");
      setSelected({ ...selected, tracking_number: tn || null, tracking_carrier: tc || null });
      setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, tracking_number: tn || null, tracking_carrier: tc || null } : o)));
    } catch (e) { toast.error(translateError(e)); }
  };

  const archiveOrder = async () => {
    if (!selected) return;
    if (!confirm(`#${selected.order_number} numaralı siparişi arşivlemek istiyor musunuz?`)) return;
    setArchiving(true);
    try {
      await archiveFn({ data: { id: selected.id } });
      toast.success("Sipariş arşivlendi");
      setSelected({ ...selected, status: "arsivlendi" });
      setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, status: "arsivlendi" } : o)));
    } catch (e) { toast.error(translateError(e)); }
    finally { setArchiving(false); }
  };

  const permanentlyDelete = async () => {
    if (!selected || !deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { id: selected.id, confirm: true } });
      const removedId = selected.id;
      toast.success("Sipariş kalıcı olarak silindi");
      setOrders((prev) => prev.filter((o) => o.id !== removedId));
      setDeleteOpen(false);
      setDeleteConfirm(false);
      setSelected(null);
    } catch (e) { toast.error(translateError(e)); }
    finally { setDeleting(false); }
  };


  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg tracking-wide">Sipariş Yönetimi</h2>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Yenile
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map((s) => (
          <button key={s.key} onClick={() => setStatus(s.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              status === s.key ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
            }`}>
            {s.label}{counts[s.key] ? ` (${counts[s.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="sm:col-span-2 flex gap-1">
          <Input placeholder="Sipariş no, telefon, ad, firma..." value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(); }} className="h-9 text-sm" />
          <Button size="sm" variant="outline" onClick={load}><Search className="size-3.5" /></Button>
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} onBlur={load} className="h-9 text-sm" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} onBlur={load} className="h-9 text-sm" />
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8"><Loader2 className="inline size-4 animate-spin mr-2" />Yükleniyor...</p>
      ) : orders.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Sipariş bulunmuyor.</p>
      ) : (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr className="border-b border-border">
                <th className="text-left p-2">Sipariş No</th>
                <th className="text-left p-2">Tarih</th>
                <th className="text-left p-2">Müşteri</th>
                <th className="text-left p-2">Telefon</th>
                <th className="text-left p-2">Firma</th>
                <th className="text-right p-2">Ürün</th>
                <th className="text-right p-2">Toplam</th>
                <th className="text-left p-2">Durum</th>
                <th className="text-left p-2">Kargo</th>
                <th className="text-right p-2">Detay</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={`border-b border-border/60 hover:bg-muted/30 ${o.is_urgent ? "bg-red-500/5" : ""}`}>
                  <td className="p-2 font-mono text-gold font-bold whitespace-nowrap">
                    {o.is_urgent && <span className="mr-1 text-[9px] uppercase bg-red-500/20 text-red-400 border border-red-500/40 px-1 py-0.5 rounded font-bold">Acil</span>}
                    {o.has_supplier_items && <span className="mr-1 text-[9px] uppercase bg-gold/15 text-gold border border-gold/40 px-1 py-0.5 rounded font-bold">Tedarikçiden Temin Edilecek</span>}
                    {o.order_number}
                  </td>
                  <td className="p-2 whitespace-nowrap">{new Date(o.created_at).toLocaleString("tr-TR")}</td>
                  <td className="p-2">{o.full_name}</td>
                  <td className="p-2 whitespace-nowrap">{o.phone}</td>
                  <td className="p-2">{o.company ?? o.billing_company ?? "-"}</td>
                  <td className="p-2 text-right">{o.item_count}</td>
                  <td className="p-2 text-right text-gold font-bold whitespace-nowrap">
                    {o.has_quote_items && o.subtotal === 0 ? "Teklif" : money(o.total)}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <span className="text-[10px] uppercase tracking-wider border border-gold/40 text-gold px-2 py-0.5 rounded-full">
                      {statusLabel(o.status)}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">{shippingLabel(o.shipping_method)}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => openDetail(o)} className="text-gold font-semibold hover:underline">Aç</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelected(null)}>
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-gold font-bold">
                  {selected.is_urgent && <span className="mr-1 text-[9px] uppercase bg-red-500/20 text-red-400 border border-red-500/40 px-1 py-0.5 rounded font-bold">🚨 Acil</span>}
                  {selected.has_supplier_items && <span className="mr-1 text-[9px] uppercase bg-gold/15 text-gold border border-gold/40 px-1 py-0.5 rounded font-bold">Tedarikçiden Temin Edilecek</span>}
                  {selected.order_number}
                </p>
                <p className="text-[11px] text-muted-foreground">{new Date(selected.created_at).toLocaleString("tr-TR")}</p>
              </div>
              <button onClick={() => setSelected(null)} className="size-9 rounded-full hover:bg-muted grid place-items-center">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <section>
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Müşteri</h3>
                <div className="text-sm space-y-0.5 bg-background/50 rounded-lg p-3 border border-border">
                  <p><b>{selected.full_name}</b>{selected.company ? ` — ${selected.company}` : ""}</p>
                  <p>📞 <a href={`tel:${selected.phone}`} className="text-gold">{selected.phone}</a></p>
                  {selected.email && <p>✉️ <a href={`mailto:${selected.email}`} className="text-gold">{selected.email}</a></p>}
                  {selected.city && <p>📍 {selected.city}</p>}
                  <p>
                    <a href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 mt-1 text-xs font-semibold">
                      💬 WhatsApp
                    </a>
                  </p>
                  {selected.note && <p className="mt-2 text-xs text-muted-foreground italic">Not: {selected.note}</p>}
                </div>
              </section>

              {selected.billing_type === "kurumsal" && (
                <section>
                  <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Fatura</h3>
                  <div className="text-sm bg-background/50 rounded-lg p-3 border border-border">
                    <p><b>{selected.billing_company}</b></p>
                    {selected.tax_office && <p className="text-muted-foreground">Vergi Dairesi: {selected.tax_office}</p>}
                    {selected.tax_number && <p className="text-muted-foreground">Vergi No: {selected.tax_number}</p>}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Sepet</h3>
                {detailLoading ? <p className="text-sm text-muted-foreground">Yükleniyor...</p> : (
                  <ul className="space-y-2">
                    {items.map((it) => (
                      <li key={it.id} className="text-sm bg-background/50 border border-border rounded-lg p-2">
                        <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold line-clamp-1">{it.title}</p>
                          {it.oem_code && <p className="text-[11px] text-muted-foreground font-mono">OEM: {it.oem_code}</p>}
                          {it.seller_name && <p className="text-[11px] text-muted-foreground">Satıcı: {it.seller_name}</p>}
                          <p className="text-[11px] text-muted-foreground">Adet: {it.quantity}</p>
                        </div>
                        <span className="text-gold font-semibold shrink-0">
                          {it.line_total != null ? money(it.line_total) : "Teklif"}
                        </span>
                        </div>
                        {(() => {
                          const sup = supply.find((s2) => s2.order_item_id === it.id);
                          if (!sup) return null;
                          return (
                            <div className="mt-2 rounded-md border border-gold/40 bg-gold/5 p-2 space-y-1">
                              <div className="text-[11px] font-bold text-gold">HARİCİ TEDARİK</div>
                              <div className="text-[11px] text-muted-foreground">Kaynak: {sup.supplier_name ?? "—"}</div>
                              <div className="text-[11px] text-muted-foreground">
                                Satış fiyatı: {sup.supplier_sale_price != null ? money(sup.supplier_sale_price) : (it.unit_price != null ? money(it.unit_price) : "—")}
                                {" · "}Tedarik alış fiyatı: {sup.supplier_cost_price != null ? money(sup.supplier_cost_price) : "—"}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground">Tedarik durumu:</span>
                                <select
                                  className="h-7 rounded-md border border-border bg-background text-[11px] px-1"
                                  value={sup.supply_status}
                                  onChange={async (e) => {
                                    const v = e.target.value;
                                    try {
                                      await setSupplyStatus({ data: { id: sup.id, supply_status: v } });
                                      setSupply((prev) => prev.map((r) => (r.id === sup.id ? { ...r, supply_status: v } : r)));
                                      toast.success(`Tedarik durumu: ${supplyStatusLabel(v)}`);
                                    } catch (err) { toast.error(translateError(err)); }
                                  }}
                                >
                                  {SUPPLY_STATUSES.map((s3) => (<option key={s3.key} value={s3.key}>{s3.label}</option>))}
                                </select>
                              </div>
                            </div>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="bg-background/50 border border-border rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Ara Toplam</span><span>{selected.has_quote_items && selected.subtotal === 0 ? "Teklif" : money(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{VAT_LABEL}</span><span>{selected.has_quote_items && selected.subtotal === 0 ? "Teklif" : money(selected.tax)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kargo ({shippingLabel(selected.shipping_method)})</span><span>{selected.shipping === 0 ? "Alıcı ödemeli" : money(selected.shipping)}</span></div>

                <div className="flex justify-between pt-1 border-t border-border font-display">
                  <span>Toplam</span><span className="text-gold font-bold">{selected.has_quote_items && selected.subtotal === 0 ? "Teklif" : money(selected.total)}</span>
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center gap-2">
                  <Truck className="size-3.5" /> Kargo Takip
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input placeholder="Takip No" value={tn} onChange={(e) => setTn(e.target.value)} className="h-9 text-sm sm:col-span-2" />
                  <Input placeholder="Firma" value={tc} onChange={(e) => setTc(e.target.value)} className="h-9 text-sm" />
                </div>
                <Button size="sm" onClick={saveTracking} className="mt-2 bg-gold-gradient text-gold-foreground">Kaydet</Button>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Durum</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ORDER_STATUSES.map((s) => (
                    <button key={s.key} onClick={() => changeStatus(s.key)} disabled={updating}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                        selected.status === s.key ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:border-gold/40"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="border-t border-border pt-4">
                <h3 className="text-xs uppercase tracking-wider text-red-400 font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="size-3.5" /> Tehlikeli İşlemler
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={archiveOrder} disabled={archiving || selected.status === "arsivlendi"}>
                    <Archive className="size-3.5 mr-1.5" />
                    {selected.status === "arsivlendi" ? "Arşivlendi" : archiving ? "Arşivleniyor..." : "Siparişi Arşivle"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { setDeleteConfirm(false); setDeleteOpen(true); }}
                    disabled={!isSuper}
                    className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    title={isSuper ? "Kalıcı olarak sil" : "Bu işlem yalnızca Super Admin tarafından yapılabilir"}
                  >
                    <Trash2 className="size-3.5 mr-1.5" /> Kalıcı Olarak Sil
                  </Button>
                </div>
                {!isSuper && (
                  <p className="text-[11px] text-muted-foreground mt-2">Kalıcı silme yalnızca Super Admin yetkisi ile yapılabilir.</p>
                )}
              </section>

            </div>
          </div>
        </div>
      )}

      {deleteOpen && selected && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!deleting) { setDeleteOpen(false); setDeleteConfirm(false); } }}>
          <div className="bg-card border border-red-500/40 rounded-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-red-500/20 grid place-items-center shrink-0">
                <AlertTriangle className="size-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-display text-base">Siparişi kalıcı olarak sil</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Bu işlem geri alınamaz. Sipariş <span className="font-mono text-gold">#{selected.order_number}</span> ve siparişe ait tüm kayıtlar (kalemler, bildirimler) kalıcı olarak silinecektir.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none border border-border rounded-lg p-3 hover:border-red-500/40">
              <input type="checkbox" checked={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.checked)}
                className="size-4 accent-red-500" />
              <span>Silme işlemini onaylıyorum.</span>
            </label>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" disabled={deleting}
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(false); }}>
                Vazgeç
              </Button>
              <Button size="sm" disabled={!deleteConfirm || deleting}
                onClick={permanentlyDelete}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                {deleting ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Siliniyor...</> : <><Trash2 className="size-3.5 mr-1.5" />Kalıcı Olarak Sil</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

