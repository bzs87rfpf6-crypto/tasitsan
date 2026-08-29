// SEO Faz 7 — Landing sayfa kalite puanlaması.
// Bir kombinasyon (marka, model, kategori vb.) için sayfa oluşturmadan ve
// indexlemeden önce içeriğin Google Helpful Content standardını karşılayıp
// karşılamadığını sayısal skor + insan-okunur nedenlerle döner.
//
// Puanlama (max 100):
//  - 30 pt: ilan sayısı (>=10 tam puan, log skala)
//  - 20 pt: benzersiz OEM çeşitliliği (>=5 tam puan)
//  - 15 pt: benzersiz araç varyasyonu (marka+model) (>=3 tam puan)
//  - 15 pt: ortalama açıklama uzunluğu (>=120 karakter tam puan)
//  - 10 pt: ilanların %60'ından fazlasında fotoğraf varsa tam puan
//  - 10 pt: kombinasyonun temel alanları dolu ise (marka, model / kategori)
//
// Eşik: score >= 55  →  indexable
//        score <  55  →  noindex,follow (thin content guard)

export interface LandingSignal {
  listings_count: number;
  unique_oems: number;
  unique_vehicles: number;
  avg_description_length: number;
  photo_ratio: number; // 0..1
  has_core_fields: boolean;
}

export interface LandingQualityResult {
  score: number;              // 0..100
  indexable: boolean;
  reasons: string[];          // insan-okunur açıklamalar
  breakdown: Record<string, number>;
}

const INDEXABLE_THRESHOLD = 55;

function clampPct(value: number, target: number, weight: number): number {
  if (target <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, value / target));
  return Math.round(ratio * weight);
}

function logScale(value: number, target: number, weight: number): number {
  if (value <= 0) return 0;
  if (value >= target) return weight;
  return Math.round((Math.log10(value + 1) / Math.log10(target + 1)) * weight);
}

export function scoreLanding(signal: LandingSignal): LandingQualityResult {
  const breakdown: Record<string, number> = {
    listings: logScale(signal.listings_count, 10, 30),
    unique_oems: clampPct(signal.unique_oems, 5, 20),
    unique_vehicles: clampPct(signal.unique_vehicles, 3, 15),
    description_length: clampPct(signal.avg_description_length, 120, 15),
    photos: clampPct(signal.photo_ratio, 0.6, 10),
    core_fields: signal.has_core_fields ? 10 : 0,
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const indexable = score >= INDEXABLE_THRESHOLD;

  const reasons: string[] = [];
  if (signal.listings_count < 3) reasons.push(`Yalnızca ${signal.listings_count} ilan (>=3 önerilir).`);
  if (signal.unique_oems < 2) reasons.push(`Benzersiz OEM çeşitliliği düşük (${signal.unique_oems}).`);
  if (signal.avg_description_length < 60) reasons.push("Açıklamalar çok kısa (ortalama <60 karakter).");
  if (signal.photo_ratio < 0.3) reasons.push("İlanların çoğunda fotoğraf yok.");
  if (!signal.has_core_fields) reasons.push("Temel meta alanları eksik.");
  if (indexable && reasons.length === 0) reasons.push("Yeterli kalite — dizinlenebilir.");

  return { score, indexable, reasons, breakdown };
}

export const LANDING_INDEXABLE_THRESHOLD = INDEXABLE_THRESHOLD;
