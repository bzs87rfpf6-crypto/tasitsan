// Güven Merkezi 1.0 — istemci tarafı yardımcıları
export type TrustBadge = "elite" | "gold" | "trusted" | "approved" | null;

export interface SellerScore {
  seller_id: string;
  average_rating: number;
  review_count: number;
  completed_sales: number;
  recommendation_rate: number;
  response_rate: number;
  response_time_minutes: number;
  trust_score: number;
  badge: TrustBadge;
  updated_at: string;
}

export interface TrustBadgeMeta {
  key: NonNullable<TrustBadge>;
  emoji: string;
  label: string;
  className: string;
}

export const TRUST_BADGES: Record<NonNullable<TrustBadge>, TrustBadgeMeta> = {
  elite:    { key: "elite",    emoji: "👑", label: "Elit Satıcı",       className: "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10" },
  gold:     { key: "gold",     emoji: "🥇", label: "Altın Satıcı",      className: "text-gold border-gold/40 bg-gold/10" },
  trusted:  { key: "trusted",  emoji: "🛡️", label: "Güvenilir Satıcı",  className: "text-sky-300 border-sky-400/40 bg-sky-400/10" },
  approved: { key: "approved", emoji: "✅", label: "Onaylı Satıcı",     className: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" },
};

export function badgeMeta(b: TrustBadge): TrustBadgeMeta | null {
  return b ? TRUST_BADGES[b] : null;
}

export function trustLevelLabel(score: number): string {
  if (score >= 95) return "Elit";
  if (score >= 90) return "Altın";
  if (score >= 80) return "Güvenilir";
  if (score >= 70) return "Onaylı";
  return "Gelişiyor";
}

export const EMPTY_SCORE = (seller_id: string): SellerScore => ({
  seller_id,
  average_rating: 0,
  review_count: 0,
  completed_sales: 0,
  recommendation_rate: 0,
  response_rate: 0,
  response_time_minutes: 0,
  trust_score: 0,
  badge: null,
  updated_at: new Date().toISOString(),
});
