import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Package, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listMySales, adminUpdateOrderTracking, adminUpdateOrderStatus, adminGetOrder } from "@/lib/orders.functions";
import { statusLabel, ORDER_STATUSES, shippingLabel } from "@/lib/orders";
import { translateError } from "@/lib/error-messages";

export const Route = createFileRoute("/account/sales")({
  head: () => ({
    meta: [
      { title: "Satışlarım — Taşıtsan" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MySalesPage,
});

interface Order {
  id: string; order_number: string; created_at: string; status: string; full_name: string;
  phone: string; item_count: number; total: number; has_quote_items: boolean; subtotal: number;
  shipping_method: string | null; is_urgent: boolean; tracking_number: string | null; tracking_carrier: string | null;
}

function money(n: number) { return `₺${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function MySalesPage() {
  const fetchList = useServerFn(listMySales);
  const updateTracking = useServerFn(adminUpdateOrderTracking);
  const updateStatus = useServerFn(adminUpdateOrderStatus);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [tn, setTn] = useState("");
  const [tc, setTc] = useState("");

  const load = async () => {
    setLoading(true);
    try { setOrders((await fetchList()) as Order[]); }
    catch (e) { toast.error(translateError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTracking = async (id: string) => {
    try {
      await updateTracking({ data: { id, tracking_number: tn, tracking_carrier: tc } });
      toast.success("Takip bilgisi kaydedildi");
      setEditing(null);
      await load();
    } catch (e) { toast.error(translateError(e)); }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      await updateStatus({ data: { id, status } });
      toast.success("Durum güncellendi");
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    } catch (e) { toast.error(translateError(e)); }
  };

  const openEdit = async (o: Order) => {
    setEditing(o.id);
    setTn(o.tracking_number ?? "");
    setTc(o.tracking_carrier ?? "");
    try { await adminGetOrder; } catch { /* no-op */ }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/account" className="size-9 rounded-full bg-card grid place-items-center border border-border">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-display text-xl tracking-wide">Satışlarım</h1>
            <p className="text-xs text-muted-foreground">{orders.length} sipariş</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <Loader2 className="size-5 animate-spin inline mr-2" /> Yükleniyor...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <Package className="size-12 text-gold mx-auto mb-3" />
            <p className="font-display text-lg">Henüz satışınız yok</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className={`bg-card border rounded-xl p-3 ${o.is_urgent ? "border-red-500/60" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm text-gold font-bold">{o.order_number}</p>
                      {o.is_urgent && <span className="text-[9px] uppercase bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded font-bold">🚨 Acil</span>}
                    </div>
                    <p className="text-sm font-semibold truncate">{o.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{o.phone} · {new Date(o.created_at).toLocaleString("tr-TR")}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {o.item_count} ürün · {shippingLabel(o.shipping_method)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gold font-bold text-sm">
                      {o.has_quote_items && o.subtotal === 0 ? "Teklif" : money(o.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ORDER_STATUSES.slice(0, 8).map((s) => (
                    <button key={s.key} onClick={() => changeStatus(o.id, s.key)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                        o.status === s.key ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:border-gold/40"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 border-t border-border/60 pt-2">
                  {editing === o.id ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input placeholder="Takip No" value={tn} onChange={(e) => setTn(e.target.value)} className="h-9 text-sm" />
                      <Input placeholder="Kargo Firması" value={tc} onChange={(e) => setTc(e.target.value)} className="h-9 text-sm sm:w-40" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveTracking(o.id)} className="bg-gold-gradient text-gold-foreground">Kaydet</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>İptal</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="size-3.5" />
                        {o.tracking_number ? (
                          <span className="font-mono text-gold font-semibold">{o.tracking_number}{o.tracking_carrier ? ` · ${o.tracking_carrier}` : ""}</span>
                        ) : (
                          <span>Takip bilgisi yok</span>
                        )}
                      </div>
                      <button onClick={() => openEdit(o)} className="text-gold text-xs font-semibold hover:underline">
                        {o.tracking_number ? "Düzenle" : "Ekle"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
