/**
 * Harici tedarikçi (ör. OnlineParça) altyapısı — paylaşılan tipler ve fiyat hesabı.
 * Not: KDV hesabı mevcut sistemle aynıdır (vitrin fiyatı KDV hariç, KDV sepette eklenir).
 */

export type SourceType = "own_stock" | "external_supplier";

export const SOURCE_LABEL: Record<SourceType, string> = {
  own_stock: "Taşıtsan Stoğu",
  external_supplier: "Harici Tedarikçi",
};

export const SUPPLY_STATUSES = [
  { key: "pending_supplier_order", label: "Bekliyor" },
  { key: "supplier_ordered", label: "Tedarikçiye Sipariş Verildi" },
  { key: "supplier_confirmed", label: "Tedarikçi Onayladı" },
  { key: "in_transit", label: "Yolda" },
  { key: "received", label: "Teslim Alındı" },
  { key: "shipped_to_customer", label: "Müşteriye Gönderildi" },
  { key: "completed", label: "Tamamlandı" },
  { key: "supplier_cancelled", label: "Tedarikçi İptal Etti" },
] as const;

export type SupplyStatus = (typeof SUPPLY_STATUSES)[number]["key"];

export const SUPPLY_STATUS_KEYS = SUPPLY_STATUSES.map((s) => s.key) as string[];

export function supplyStatusLabel(key: string | null | undefined): string {
  return SUPPLY_STATUSES.find((s) => s.key === key)?.label ?? "—";
}

/** Satış fiyatı = alış fiyatı × (1 + kâr oranı / 100). Kâr oranı admin panelinden gelir. */
export function calcSupplierSalePrice(costPrice: number, marginPercent: number): number {
  const cost = Number(costPrice) || 0;
  const margin = Number.isFinite(Number(marginPercent)) ? Number(marginPercent) : 0;
  return Math.round((cost * (1 + margin / 100) + Number.EPSILON) * 100) / 100;
}

export function isExternal(sourceType: string | null | undefined): boolean {
  return sourceType === "external_supplier";
}
