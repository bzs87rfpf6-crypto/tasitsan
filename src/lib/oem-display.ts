/**
 * Müşteriye gösterilecek OEM formatı.
 *
 * Tedarikçi kaynaklı kodlarda bulunan marka/tedarikçi harf ön eki (ör. "TY8531502540")
 * müşteri arayüzünde gösterilmez → "8531502540".
 * Backend eşleştirme/normalizasyon zinciri (oem-normalize, supplier-scan) DEĞİŞMEZ;
 * bu yardımcı yalnızca görsel katmanda kullanılır.
 */
export function displayOem(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Baştaki harf ön ekini yalnızca kalan kısım tamamen rakamsa ve yeterince uzunsa kaldır.
  const m = /^([A-Za-z]{1,3})[\s-]?([0-9][0-9\s.\-/]{7,})$/.exec(s);
  if (m && m[2]) return m[2].trim();
  return s;
}

export function displayOemList(codes: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (codes ?? []).map(displayOem).filter(Boolean);
}
