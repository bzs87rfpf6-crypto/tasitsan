/**
 * Tedarikçi / servis stoğu satış kuralları.
 *
 * - Tedarikçi stoğu ürünler Taşıtsan deposunda değildir, sipariş sonrası temin edilir.
 * - Fiyatı SINGLE_SHIPMENT_MIN (500 ₺) altındaki tedarikçi ürünleri tek başına gönderilemez.
 * - Aynı satıcıdan alınan ürünlerin toplamı SUPPLIER_MIN_ORDER (750 ₺) olduğunda sipariş verilebilir.
 */

export const SINGLE_SHIPMENT_MIN = 500;
export const SUPPLIER_MIN_ORDER = 750;

export interface SupplierFields {
  supplier_stock?: boolean | null;
  minimum_order_amount?: number | null;
  single_shipment_allowed?: boolean | null;
  procurement_days?: number | null;
}

export function isSupplierStock(p: SupplierFields | null | undefined): boolean {
  return !!p?.supplier_stock;
}

/** Bu ürün için geçerli satıcı bazlı minimum sipariş tutarı. */
export function minOrderAmount(p: SupplierFields | null | undefined): number {
  const v = p?.minimum_order_amount;
  return v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : SUPPLIER_MIN_ORDER;
}

/** Ürün tek başına (minimum tutar aranmadan) gönderilebilir mi? */
export function canShipAlone(p: (SupplierFields & { price?: number | null }) | null | undefined): boolean {
  if (!p || !isSupplierStock(p)) return true;
  if (p.single_shipment_allowed === false) return false;
  const price = p.price != null ? Number(p.price) : null;
  if (price != null && price < SINGLE_SHIPMENT_MIN) return false;
  return true;
}

export function procurementLabel(p: SupplierFields | null | undefined): string | null {
  const d = p?.procurement_days;
  if (d == null || !Number.isFinite(Number(d)) || Number(d) <= 0) return null;
  return `${Number(d)} iş günü içinde temin edilir`;
}

export interface SupplierCartLine extends SupplierFields {
  part_id: string;
  seller_id: string | null;
  seller_name?: string | null;
  unit_price: number | null;
  quantity: number;
}

export interface SellerRequirement {
  seller_id: string;
  seller_name: string | null;
  required: number;
  current: number;
  missing: number;
  ok: boolean;
}

export interface CartSupplierCheck {
  /** Minimum tutar şartı sağlanmayan satıcı grupları. */
  requirements: SellerRequirement[];
  blocked: boolean;
  hasSupplierItems: boolean;
}

/**
 * Sepetteki tedarikçi stoğu ürünlerini satıcı bazında gruplayıp
 * minimum tutar şartını kontrol eder.
 */
export function checkCartSupplierRules(items: SupplierCartLine[]): CartSupplierCheck {
  const groups = new Map<string, { name: string | null; total: number; required: number; needsMin: boolean }>();

  for (const it of items) {
    const key = it.seller_id ?? "__no_seller__";
    const g = groups.get(key) ?? { name: it.seller_name ?? null, total: 0, required: 0, needsMin: false };
    if (it.unit_price != null) g.total += Number(it.unit_price) * it.quantity;
    if (isSupplierStock(it) && !canShipAlone({ ...it, price: it.unit_price })) {
      g.needsMin = true;
      g.required = Math.max(g.required, minOrderAmount(it));
    }
    if (!g.name && it.seller_name) g.name = it.seller_name;
    groups.set(key, g);
  }

  const requirements: SellerRequirement[] = [];
  for (const [seller_id, g] of groups) {
    if (!g.needsMin) continue;
    const missing = Math.max(0, Math.round((g.required - g.total) * 100) / 100);
    requirements.push({
      seller_id,
      seller_name: g.name,
      required: g.required,
      current: Math.round(g.total * 100) / 100,
      missing,
      ok: missing <= 0,
    });
  }

  return {
    requirements,
    blocked: requirements.some((r) => !r.ok),
    hasSupplierItems: items.some((i) => isSupplierStock(i)),
  };
}

export function money(n: number): string {
  return `₺${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
