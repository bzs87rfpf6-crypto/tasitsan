import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Minus, Plus, Trash2, ShoppingCart, Loader2, ShieldCheck, Lock, BadgeCheck, Truck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createOrder } from "@/lib/orders.functions";
import { SHIPPING_OPTIONS } from "@/lib/orders";
import { calcOrderTotals, VAT_LABEL } from "@/lib/tax";

import { translateError } from "@/lib/error-messages";
import { trackEvent } from "@/lib/analytics";
import { displayOem } from "@/lib/oem-display";
import { buildPartParam } from "@/lib/part-slug";
import { checkCartSupplierRules } from "@/lib/supplier-stock";
import { SupplierStockBadge } from "@/components/SupplierStockBadge";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Sepetim — Taşıtsan Parça Borsası" },
      { name: "description", content: "Sepetinize eklediğiniz yedek parçaları görüntüleyin ve sipariş oluşturun." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CartPage,
});

function money(n: number) { return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function CartPage() {
  const { items, setQuantity, remove, clear, totalQuantity } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const submitOrder = useServerFn(createOrder);
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState<string>("yurtici_kargo");
  const [urgent, setUrgent] = useState(false);
  const [billingType, setBillingType] = useState<"bireysel" | "kurumsal">("bireysel");
  const [form, setForm] = useState({
    full_name: "", company: "", phone: "", email: "", city: "", note: "",
    billing_company: "", tax_office: "", tax_number: "",
  });

  const shippingFee = useMemo(
    () => SHIPPING_OPTIONS.find((s) => s.key === shipping)?.fee ?? 0,
    [shipping],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let hasQuote = false;
    for (const it of items) {
      if (it.unit_price == null) hasQuote = true;
      else subtotal += it.unit_price * it.quantity;
    }
    const t = calcOrderTotals(subtotal, shippingFee);
    return { ...t, hasQuote };
  }, [items, shippingFee]);


  const supplierCheck = useMemo(
    () => checkCartSupplierRules(items.map((i) => ({
      part_id: i.part_id,
      seller_id: i.seller_id,
      seller_name: i.seller_name,
      unit_price: i.unit_price,
      quantity: i.quantity,
      supplier_stock: i.supplier_stock,
      minimum_order_amount: i.minimum_order_amount,
      single_shipment_allowed: i.single_shipment_allowed,
      procurement_days: i.procurement_days,
    }))),
    [items],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.error("Sepet boş"); return; }
    if (supplierCheck.blocked) { toast.error("Tedarikçi stoğu için minimum sipariş tutarı sağlanmadı"); return; }
    if (!form.full_name.trim()) { toast.error("Ad soyad zorunlu"); return; }
    if (!form.phone.trim()) { toast.error("Telefon zorunlu"); return; }
    if (billingType === "kurumsal") {
      if (!form.billing_company.trim()) { toast.error("Firma adı zorunlu"); return; }
      if (!form.tax_number.trim()) { toast.error("Vergi no zorunlu"); return; }
    }
    setSubmitting(true);
    try {
      const res = await submitOrder({
        data: {
          full_name: form.full_name.trim(),
          company: form.company.trim() || null,
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          city: form.city.trim() || null,
          note: form.note.trim() || null,
          user_id: user?.id ?? null,
          shipping_method: shipping,
          shipping_fee: shippingFee,
          is_urgent: urgent,
          billing_type: billingType,
          billing_company: billingType === "kurumsal" ? form.billing_company.trim() : null,
          tax_office: billingType === "kurumsal" ? form.tax_office.trim() : null,
          tax_number: billingType === "kurumsal" ? form.tax_number.trim() : null,
          items: items.map((i) => ({
            part_id: i.part_id, title: i.title, oem_code: i.oem_code, product_code: i.product_code,
            seller_id: i.seller_id, seller_name: i.seller_name, photo: i.photo,
            quantity: i.quantity, unit_price: i.unit_price,
          })),
        },
      });
      trackEvent("order_created", { order_id: res.id, order_number: res.order_number, total: res.total, item_count: items.length, urgent, shipping });
      clear();
      nav({ to: "/order-success/$id", params: { id: res.id } });
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-32 bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/" className="size-9 rounded-full bg-card grid place-items-center border border-border">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-display text-xl tracking-wide">Sepetim</h1>
            <p className="text-xs text-muted-foreground">{totalQuantity} ürün</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <ShoppingCart className="size-12 text-gold mx-auto mb-3" />
            <p className="font-display text-lg">Sepetiniz boş</p>
            <p className="text-xs text-muted-foreground mt-1">Ürünlere göz atın ve sepete ekleyin.</p>
            <Link to="/parts" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-gold-gradient text-gold-foreground text-sm font-semibold">
              Parçalara Göz At
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const line = it.unit_price != null ? it.unit_price * it.quantity : null;
              return (
                <article key={it.part_id} className="bg-card border border-border rounded-xl p-3 flex gap-3">
                  <div className="size-20 sm:size-24 shrink-0 rounded-lg overflow-hidden bg-secondary">
                    {it.photo ? (
                      <img src={it.photo} alt={it.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">Görsel yok</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <Link to="/parts/$id" params={{ id: buildPartParam({ id: it.part_id, seo_slug: it.seo_slug, title: it.title, oem_code: it.oem_code }) }} className="text-sm font-semibold leading-tight line-clamp-2 hover:text-gold">
                      {it.title}
                    </Link>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {it.oem_code && <span className="font-mono">OEM: {displayOem(it.oem_code)}</span>}
                      {it.product_code && <span className="font-mono">Kod: {it.product_code}</span>}
                    </div>
                    {it.supplier_stock && <SupplierStockBadge part={it} className="self-start" />}
                    {it.seller_name && (
                      <p className="text-[11px] text-muted-foreground truncate">Satıcı: {it.seller_name}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <div className="inline-flex items-center rounded-lg border border-border overflow-hidden">
                        <button aria-label="Azalt" className="size-8 grid place-items-center hover:bg-muted"
                          onClick={() => setQuantity(it.part_id, it.quantity - 1)}>
                          <Minus className="size-3.5" />
                        </button>
                        <span className="min-w-[32px] text-center text-sm font-semibold">{it.quantity}</span>
                        <button aria-label="Arttır" className="size-8 grid place-items-center hover:bg-muted"
                          onClick={() => setQuantity(it.part_id, it.quantity + 1)}>
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">
                          {it.unit_price != null ? `Birim: ${money(it.unit_price)}` : "Birim: Teklif İsteniyor"}
                        </div>
                        <div className="text-gold font-bold text-sm font-display">
                          {line != null ? money(line) : "Teklif İsteniyor"}
                        </div>
                      </div>
                      <button aria-label="Kaldır" onClick={() => remove(it.part_id)}
                        className="size-8 grid place-items-center rounded-lg border border-border text-destructive hover:bg-destructive/10">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Shipping */}
            <section className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wider text-gold font-semibold mb-1 flex items-center gap-2">
                <Truck className="size-3.5" /> Kargo Seçenekleri
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SHIPPING_OPTIONS.map((opt) => (
                  <label key={opt.key} className={`flex items-center gap-2 border rounded-lg p-2.5 cursor-pointer transition ${
                    shipping === opt.key ? "border-gold bg-gold/5" : "border-border hover:border-gold/40"
                  }`}>
                    <input type="radio" name="shipping" className="accent-gold" checked={shipping === opt.key}
                      onChange={() => setShipping(opt.key)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {opt.fee > 0 ? money(opt.fee) : (opt.note ?? "Alıcı ödemeli (Anlaşmalı)")}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {supplierCheck.requirements.length > 0 && (
              <section className="bg-card border border-gold/40 rounded-xl p-4 space-y-2">
                <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-2">
                  <AlertTriangle className="size-3.5" /> Tedarikçi Stoğu Minimum Sipariş
                </h2>
                {supplierCheck.requirements.map((r) => (
                  <div key={r.seller_id} className="text-xs space-y-1 border-t border-border/60 pt-2 first:border-0 first:pt-0">
                    <p className="font-semibold">{r.seller_name || "Satıcı"}</p>
                    {r.ok ? (
                      <p className="text-emerald-400">Minimum tutar sağlandı ({money(r.current)}).</p>
                    ) : (
                      <p className="text-red-400">
                        Tek başına gönderilemeyen ürün var. Bu satıcıdan toplam {money(r.required)} olmalı — mevcut {money(r.current)},
                        <span className="font-bold"> eksik {money(r.missing)}</span>.
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* Summary */}
            <section className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Sipariş Özeti</h2>
              <Row label="Ara Toplam" value={totals.hasQuote && totals.subtotal === 0 ? "Teklif İsteniyor" : money(totals.subtotal)} />
              <Row label={VAT_LABEL} value={totals.hasQuote && totals.subtotal === 0 ? "Teklif İsteniyor" : money(totals.tax)} />
              <Row label="Kargo Ücreti" value={totals.shipping > 0 ? money(totals.shipping) : "Alıcı ödemeli"} />

              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="font-display text-sm">Genel Toplam</span>
                <span className="text-gold font-bold text-lg font-display">
                  {totals.hasQuote && totals.subtotal === 0 ? "Teklif İsteniyor" : money(totals.total)}
                </span>
              </div>
              {totals.hasQuote && (
                <p className="text-[11px] text-muted-foreground italic">
                  Bazı ürünler için fiyat teklif üzerinedir. Sipariş sonrası WhatsApp üzerinden nihai fiyat bildirilir.
                </p>
              )}
            </section>

            {/* Trust badges */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <TrustPill icon={<ShieldCheck className="size-4" />} label="Güvenli Sipariş" />
              <TrustPill icon={<Lock className="size-4" />} label="SSL Korumalı" />
              <TrustPill icon={<BadgeCheck className="size-4" />} label="Güvenilir Satıcı" />
              <TrustPill icon={<Truck className="size-4" />} label="İade & Teslimat" />
            </section>

            <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">İletişim Bilgileri</h2>
              <Input required placeholder="Ad Soyad *" value={form.full_name} maxLength={120}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input required placeholder="Telefon *" inputMode="tel" value={form.phone} maxLength={40}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Şehir" value={form.city} maxLength={80}
                  onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <Input type="email" placeholder="E-posta" value={form.email} maxLength={160}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />

              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold pt-2">Sipariş Notu</h3>
                <Textarea rows={4} maxLength={2000} placeholder="Örn. teslim tercihi, adres detayı, özel talep..."
                  value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="resize-none" />
              </div>

              {/* Billing */}
              <div className="space-y-2 pt-2">
                <h3 className="text-xs uppercase tracking-wider text-gold font-semibold">Fatura Bilgileri</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(["bireysel", "kurumsal"] as const).map((t) => (
                    <label key={t} className={`flex items-center gap-2 border rounded-lg p-2.5 cursor-pointer transition ${
                      billingType === t ? "border-gold bg-gold/5" : "border-border"
                    }`}>
                      <input type="radio" name="billing" className="accent-gold" checked={billingType === t}
                        onChange={() => setBillingType(t)} />
                      <span className="text-sm font-semibold capitalize">{t === "bireysel" ? "Bireysel" : "Kurumsal"}</span>
                    </label>
                  ))}
                </div>
                {billingType === "kurumsal" && (
                  <div className="space-y-2">
                    <Input placeholder="Firma Adı *" value={form.billing_company} maxLength={160}
                      onChange={(e) => setForm({ ...form, billing_company: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Vergi Dairesi" value={form.tax_office} maxLength={120}
                        onChange={(e) => setForm({ ...form, tax_office: e.target.value })} />
                      <Input placeholder="Vergi No *" inputMode="numeric" value={form.tax_number} maxLength={40}
                        onChange={(e) => setForm({ ...form, tax_number: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>

              {/* Urgent */}
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition ${
                urgent ? "border-red-500 bg-red-500/10" : "border-border"
              }`}>
                <input type="checkbox" className="accent-red-500 size-4" checked={urgent}
                  onChange={(e) => setUrgent(e.target.checked)} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-400">🚨 Acil Sipariş</p>
                  <p className="text-[11px] text-muted-foreground">Öncelikli olarak ele alınır.</p>
                </div>
              </label>

              <Button type="submit" disabled={submitting || supplierCheck.blocked}
                className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold text-base">
                {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" /> Oluşturuluyor...</> : "Siparişi Oluştur"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Ödeme ve teslimat detayları WhatsApp üzerinden Taşıtsan ile netleştirilir.
              </p>
            </form>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function TrustPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-2.5">
      <span className="text-gold">{icon}</span>
      <span className="text-[11px] font-semibold">{label}</span>
    </div>
  );
}
