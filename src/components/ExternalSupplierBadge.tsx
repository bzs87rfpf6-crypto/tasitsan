/**
 * Harici tedarikçi rozeti — MÜŞTERİ ARAYÜZÜNDE GÖSTERİLMEZ.
 *
 * Kaynak bilgisi (OnlineParça vb.) yalnızca backend/admin tarafında tutulur;
 * ürün kartları tüm ürünler için aynı görünür. Bileşen API'si korunur.
 */
export function ExternalSupplierBadge(_props: {
  sourceType?: string | null;
  supplierName?: string | null;
  className?: string;
}) {
  return null;
}
