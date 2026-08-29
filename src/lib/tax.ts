/**
 * Merkezi KDV yapılandırması.
 * Vitrin (ana sayfa, listeleme, ürün detay) fiyatları KDV HARİÇ gösterilir.
 * KDV yalnızca sepet / sipariş oluşturma aşamasında hesaplanır.
 */
export const VAT_RATE = 0.20;
export const VAT_LABEL = `KDV (%${Math.round(VAT_RATE * 100)})`;

/** Kuruş hassasiyetinde yuvarlama (yuvarlama hatası olmadan). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Verilen KDV hariç tutar için KDV tutarı. */
export function calcVat(amountExclVat: number): number {
  return round2(amountExclVat * VAT_RATE);
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

/**
 * Sipariş toplamları. KDV yalnızca ara toplam üzerinden hesaplanır (kargo hariç).
 */
export function calcOrderTotals(subtotal: number, shipping = 0): OrderTotals {
  const sub = round2(subtotal);
  const ship = round2(shipping || 0);
  const tax = calcVat(sub);
  return { subtotal: sub, tax, shipping: ship, total: round2(sub + tax + ship) };
}
