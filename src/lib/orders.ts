export interface ShippingOption {
  key: string;
  label: string;
  fee: number; // 0 = ücretsiz / teklife göre
  note?: string;
}

export const DEFAULT_SHIPPING_NOTE = "Alıcı ödemeli (Anlaşmalı)";

export const SHIPPING_OPTIONS: ShippingOption[] = [
  { key: "yurtici_kargo", label: "Yurtiçi Kargo", fee: 0, note: "Alıcı ödemeli (Anlaşmalı)" },
  { key: "aras_kargo", label: "Aras Kargo", fee: 0, note: "Alıcı ödemeli (Anlaşmalı)" },
  { key: "mng_kargo", label: "MNG Kargo", fee: 0, note: "Alıcı ödemeli (Anlaşmalı)" },
  { key: "surat_kargo", label: "Sürat Kargo", fee: 0, note: "Alıcı ödemeli (Anlaşmalı)" },
  { key: "ambar", label: "Ambar", fee: 0, note: "Alıcı ödemeli (Anlaşmalı)" },
  { key: "firma_teslimati", label: "Firma Teslimatı", fee: 0, note: "Firmadan teslim alınır." },
  { key: "musteri_teslim", label: "Müşteri Teslim Alacak", fee: 0, note: "Adresten teslim alacak." },
];

export function shippingLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SHIPPING_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

export const ORDER_STATUSES: Array<{ key: string; label: string; tone?: "success" | "warn" | "info" | "danger" }> = [
  { key: "bekliyor", label: "Bekliyor", tone: "info" },
  { key: "yeni", label: "Yeni", tone: "info" },
  { key: "hazirlaniyor", label: "Hazırlanıyor", tone: "warn" },
  { key: "teklif_bekliyor", label: "Teklif Bekliyor", tone: "warn" },
  { key: "odeme_bekliyor", label: "Ödeme Bekleniyor", tone: "warn" },
  { key: "odeme_alindi", label: "Ödeme Alındı", tone: "success" },
  { key: "kargoda", label: "Kargoya Verildi", tone: "info" },
  { key: "teslim_edildi", label: "Teslim Edildi", tone: "success" },
  { key: "tamamlandi", label: "Tamamlandı", tone: "success" },
  { key: "iptal", label: "İptal", tone: "danger" },
];

export function statusLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return ORDER_STATUSES.find((s) => s.key === key)?.label ?? key;
}
