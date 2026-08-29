import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Home, Package, Printer, Truck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getOrderPublic } from "@/lib/orders.functions";
import { shippingLabel, statusLabel } from "@/lib/orders";
import { VAT_LABEL } from "@/lib/tax";

import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/order-success/$id")({
  head: () => ({
    meta: [
      { title: "Sipariş Alındı — Taşıtsan" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OrderSuccessPage,
});

interface OrderItem {
  id: string; title: string; oem_code: string | null; product_code: string | null;
  seller_name: string | null; photo: string | null; quantity: number;
  unit_price: number | null; line_total: number | null; is_quote: boolean;
}
interface Order {
  id: string; order_number: string; full_name: string; company: string | null; phone: string;
  email: string | null; city: string | null; note: string | null;
  subtotal: number; tax: number; shipping: number; total: number;
  item_count: number; has_quote_items: boolean; status: string; created_at: string;
  shipping_method: string | null; is_urgent: boolean;
  billing_type: string | null; billing_company: string | null; tax_office: string | null; tax_number: string | null;
  tracking_number: string | null; tracking_carrier: string | null;
}

function money(n: number) { return `₺${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function OrderSuccessPage() {
  const { id } = useParams({ from: "/order-success/$id" });
  const fetchOrder = useServerFn(getOrderPublic);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchOrder({ data: { id } });
        if (cancelled) return;
        setOrder(res.order as Order);
        setItems(res.items as OrderItem[]);
      } finally { if (!cancelled) setLoading(false); }
    })();
    supabase.rpc("get_public_site_settings").maybeSingle()
      .then(({ data }) => setContactPhone(((data as { contact_phone?: string } | null)?.contact_phone) ?? ""));
    return () => { cancelled = true; };
  }, [id, fetchOrder]);

  const waHref = useMemo(() => {
    if (!order) return "#";
    const digits = (s: string) => s.replace(/\D/g, "");
    const num = digits(contactPhone) || "905000000000";
    const lines: string[] = [];
    lines.push(`🛒 *Taşıtsan Sipariş*`);
    lines.push(`Sipariş No: *${order.order_number}*`);
    if (order.is_urgent) lines.push(`🚨 *ACİL SİPARİŞ*`);
    lines.push(``);
    lines.push(`👤 ${order.full_name}${order.company ? ` — ${order.company}` : ""}`);
    lines.push(`📞 ${order.phone}`);
    if (order.email) lines.push(`✉️ ${order.email}`);
    if (order.city) lines.push(`📍 ${order.city}`);
    if (order.shipping_method) lines.push(`🚚 ${shippingLabel(order.shipping_method)}`);
    lines.push(``);
    lines.push(`*Sepet (${order.item_count} adet):*`);
    for (const it of items) {
      const oem = it.oem_code ? ` | OEM: ${it.oem_code}` : "";
      const priceStr = it.unit_price != null ? ` = ${money((it.unit_price ?? 0) * it.quantity)}` : ` (Teklif İsteniyor)`;
      lines.push(`• ${it.title}${oem} × ${it.quantity}${priceStr}`);
    }
    lines.push(``);
    if (order.has_quote_items && order.subtotal === 0) lines.push(`*Toplam: Teklif İsteniyor*`);
    else lines.push(`*Toplam: ${money(order.total)}*`);
    if (order.note) { lines.push(``); lines.push(`Not: ${order.note}`); }
    return `https://wa.me/${num}?text=${encodeURIComponent(lines.join("\n"))}`;
  }, [order, items, contactPhone]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="print:hidden"><AppHeader /></div>
      <div className="max-w-2xl mx-auto px-4 pt-6" id="order-summary">
        {loading ? (
          <div className="space-y-3">
            <div className="h-40 bg-card border border-border rounded-2xl animate-pulse" />
            <div className="h-32 bg-card border border-border rounded-xl animate-pulse" />
          </div>
        ) : !order ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <p className="font-display">Sipariş bulunamadı.</p>
            <Link to="/" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-gold-gradient text-gold-foreground text-sm font-semibold">
              Anasayfa
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-card border border-gold/40 rounded-2xl p-6 text-center">
              <CheckCircle2 className="size-16 text-emerald-400 mx-auto mb-3" />
              <h1 className="font-display text-2xl tracking-wide">Siparişiniz Alındı</h1>
              {order.is_urgent && (
                <span className="inline-block mt-2 text-[10px] uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-bold">
                  🚨 Acil Sipariş
                </span>
              )}
              <p className="text-sm text-muted-foreground mt-3">Sipariş numaranız:</p>
              <p className="font-mono text-2xl text-gold font-bold mt-1">{order.order_number}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(order.created_at).toLocaleString("tr-TR")}
              </p>
              <p className="text-xs mt-3">
                Durum: <span className="text-gold font-semibold">{statusLabel(order.status)}</span>
              </p>

              <a href={waHref} target="_blank" rel="noopener noreferrer"
                className="mt-5 print:hidden inline-flex w-full items-center justify-center gap-2 h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base shadow-lg transition">
                <MessageCircle className="size-5" />
                WhatsApp ile İletişime Geç
              </a>

              <button onClick={() => window.print()}
                className="mt-2 print:hidden inline-flex w-full items-center justify-center gap-2 h-11 rounded-xl bg-card border border-border hover:border-gold/60 text-sm font-semibold transition">
                <Printer className="size-4" /> PDF Sipariş Özeti İndir
              </button>
            </div>

            {(order.shipping_method || order.tracking_number) && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="size-4 text-gold" />
                  <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Kargo Bilgisi</h2>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Yöntem:</span> <span className="font-semibold">{shippingLabel(order.shipping_method)}</span>
                </p>
                {order.tracking_number && (
                  <p className="text-sm mt-1">
                    <span className="text-muted-foreground">Takip No:</span> <span className="font-mono font-semibold text-gold">{order.tracking_number}</span>
                    {order.tracking_carrier ? ` (${order.tracking_carrier})` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="size-4 text-gold" />
                <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Sipariş İçeriği</h2>
              </div>
              <ul className="space-y-2 text-sm">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold line-clamp-1">{it.title}</p>
                      {it.oem_code && <p className="text-[11px] text-muted-foreground font-mono">OEM: {it.oem_code}</p>}
                      <p className="text-[11px] text-muted-foreground">Adet: {it.quantity}</p>
                    </div>
                    <span className="text-gold font-semibold shrink-0">
                      {it.line_total != null ? money(it.line_total) : "Teklif"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border mt-3 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ara Toplam</span>
                  <span className="font-semibold">
                    {order.has_quote_items && order.subtotal === 0 ? "Teklif İsteniyor" : money(order.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{VAT_LABEL}</span>
                  <span className="font-semibold">
                    {order.has_quote_items && order.subtotal === 0 ? "Teklif İsteniyor" : money(order.tax)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kargo</span>
                  <span className="font-semibold">{order.shipping === 0 ? "Alıcı ödemeli" : money(order.shipping)}</span>
                </div>

                <div className="flex justify-between pt-1 border-t border-border">
                  <span className="font-display">Toplam</span>
                  <span className="text-gold font-bold text-base">
                    {order.has_quote_items && order.subtotal === 0 ? "Teklif İsteniyor" : money(order.total)}
                  </span>
                </div>
              </div>
            </div>

            {order.billing_type === "kurumsal" && order.billing_company && (
              <div className="bg-card border border-border rounded-xl p-4 text-sm">
                <h2 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Fatura Bilgileri</h2>
                <p><b>{order.billing_company}</b></p>
                {order.tax_office && <p className="text-muted-foreground">Vergi Dairesi: {order.tax_office}</p>}
                {order.tax_number && <p className="text-muted-foreground">Vergi No: {order.tax_number}</p>}
              </div>
            )}

            <div className="print:hidden flex gap-2">
              <Link to="/account/orders" className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border text-sm font-semibold hover:border-gold/60">
                Siparişlerim
              </Link>
              <Link to="/" className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border text-sm font-semibold hover:border-gold/60">
                <Home className="size-4" /> Anasayfa
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
