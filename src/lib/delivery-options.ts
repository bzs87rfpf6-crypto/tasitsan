export type DeliveryOption =
  | "same_day"
  | "express_24h"
  | "bus"
  | "cargo"
  | "ambar"
  | "hand"
  | "nationwide";

export interface DeliveryOptionMeta {
  value: DeliveryOption;
  emoji: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const DELIVERY_OPTIONS: DeliveryOptionMeta[] = [
  { value: "same_day",    emoji: "🚚", label: "Aynı Gün Kargo",     shortLabel: "Aynı Gün",  description: "Sipariş verdiğiniz gün kargoya verilir." },
  { value: "express_24h", emoji: "⚡", label: "24 Saat İçinde Kargo", shortLabel: "24 Saat",   description: "En geç 24 saat içinde gönderilir." },
  { value: "bus",         emoji: "🚌", label: "Otobüs Kargo",       shortLabel: "Otobüs",    description: "Şehirlerarası otobüs firmaları ile hızlı teslim." },
  { value: "cargo",       emoji: "📦", label: "Kargo ile Gönderim", shortLabel: "Kargo",     description: "Anlaşmalı kargo firması ile gönderim." },
  { value: "ambar",       emoji: "🚛", label: "Ambar Kargo",        shortLabel: "Ambar",     description: "Büyük hacimli ürünler için ambar taşıma." },
  { value: "hand",        emoji: "🏪", label: "Elden Teslim",       shortLabel: "Elden",     description: "Satıcı adresinden şahsen teslim alınabilir." },
  { value: "nationwide",  emoji: "🌍", label: "Türkiye Geneli Gönderim", shortLabel: "Türkiye", description: "Türkiye'nin her yerine gönderim yapılabilir." },
];

export const DELIVERY_META: Record<DeliveryOption, DeliveryOptionMeta> = DELIVERY_OPTIONS.reduce(
  (acc, o) => ((acc[o.value] = o), acc),
  {} as Record<DeliveryOption, DeliveryOptionMeta>,
);

export function normalizeDeliveryOptions(input: unknown): DeliveryOption[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<DeliveryOption>();
  for (const v of input) {
    if (typeof v === "string" && (v as DeliveryOption) in DELIVERY_META) {
      valid.add(v as DeliveryOption);
    }
  }
  return [...valid];
}
