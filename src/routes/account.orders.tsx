import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Package, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { listMyOrders } from "@/lib/orders.functions";
import { statusLabel, shippingLabel } from "@/lib/orders";
import { translateError } from "@/lib/error-messages";
import { toast } from "sonner";

export const Route = createFileRoute("/account/orders")({
  head: () => ({
    meta: [
      { title: "Siparişlerim — Taşıtsan" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MyOrdersPage,
});

interface Order {
  id: string; order_number: string; created_at: string; status: string;
  item_count: number; total: number; has_quote_items: boolean; subtotal: number;
  shipping_method: string | null; is_urgent: boolean;
}

function money(n: number) { return `₺${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function MyOrdersPage() {
  const fetchList = useServerFn(listMyOrders);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchList();
        setOrders(rows as Order[]);
      } catch (e) { toast.error(translateError(e)); }
      finally { setLoading(false); }
    })();
  }, [fetchList]);

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/account" className="size-9 rounded-full bg-card grid place-items-center border border-border">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-display text-xl tracking-wide">Siparişlerim</h1>
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
            <p className="font-display text-lg">Henüz siparişiniz yok</p>
            <Link to="/parts" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-gold-gradient text-gold-foreground text-sm font-semibold">
              Parçalara Göz At
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <Link key={o.id} to="/order-success/$id" params={{ id: o.id }}
                className="block bg-card border border-border rounded-xl p-3 hover:border-gold/50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-gold font-bold">{o.order_number}</p>
                      {o.is_urgent && <span className="text-[9px] uppercase bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded font-bold">Acil</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString("tr-TR")}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {o.item_count} ürün · {shippingLabel(o.shipping_method)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase tracking-wider bg-background border border-gold/40 text-gold px-2 py-0.5 rounded-full">
                      {statusLabel(o.status)}
                    </span>
                    <p className="text-gold font-bold text-sm mt-1">
                      {o.has_quote_items && o.subtotal === 0 ? "Teklif" : money(o.total)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
