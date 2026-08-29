// Ziyaretçi presence yardımcıları — yalnızca sunucu tarafında çalışır.
// Ham IP adresi ASLA saklanmaz; IP yalnızca anonim (geri döndürülemez) bir
// ziyaretçi anahtarı üretmek için SHA-256 ile özetlenir.
import { createHash } from "crypto";

const PEPPER = "tasitsan-visitor-key-v1";

/** İstemcinin gerçek IP adresini proxy başlıklarından okur. */
export function resolveClientIp(headers: {
  cfConnectingIp?: string | null;
  xForwardedFor?: string | null;
  xRealIp?: string | null;
  fallback?: string | null;
}): string | null {
  const xff = headers.xForwardedFor?.split(",")[0]?.trim();
  const ip =
    headers.cfConnectingIp?.trim() ||
    (xff && xff.length > 0 ? xff : null) ||
    headers.xRealIp?.trim() ||
    headers.fallback?.trim() ||
    null;
  return ip && ip.length > 0 ? ip : null;
}

/**
 * IP tabanlı anonim ziyaretçi anahtarı.
 * Aynı IP → aynı anahtar (gün/sayfa/sekme fark etmez) ⇒ tek benzersiz ziyaretçi.
 * IP alınamazsa istemci tarafı yedek kimlik (fingerprint/visitor_id) kullanılır.
 */
export function visitorKeyFrom(ip: string | null, fallback: string | null): string {
  const base = ip ? `ip:${ip}` : `fb:${fallback ?? "unknown"}`;
  return "vk_" + createHash("sha256").update(PEPPER + "|" + base).digest("hex").slice(0, 32);
}
