// Güven Merkezi — admin tarafından atanan doğrulama rozetleri
export type UserBadgeKey = "user_verified";
export type SellerBadgeKey =
  | "seller_verified"
  | "trusted_seller"
  | "premium_seller"
  | "elite_seller";
export type VerificationBadgeKey = UserBadgeKey | SellerBadgeKey;

export interface VerificationBadgeMeta {
  key: VerificationBadgeKey;
  emoji: string;
  label: string;
  short: string;
  className: string;
  scope: "user" | "seller";
  description: string;
}

export const VERIFICATION_BADGES: Record<VerificationBadgeKey, VerificationBadgeMeta> = {
  user_verified: {
    key: "user_verified",
    emoji: "✔",
    label: "Doğrulanmış Kullanıcı",
    short: "Doğrulanmış",
    className: "text-sky-300 border-sky-400/40 bg-sky-400/10",
    scope: "user",
    description: "Kimlik/telefon doğrulaması tamamlanmış üye.",
  },
  seller_verified: {
    key: "seller_verified",
    emoji: "🛡",
    label: "Doğrulanmış Satıcı",
    short: "Doğrulanmış Satıcı",
    className: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
    scope: "seller",
    description: "Vergi levhası ve firma bilgileri doğrulanmış satıcı.",
  },
  trusted_seller: {
    key: "trusted_seller",
    emoji: "⭐",
    label: "Güvenilir Satıcı",
    short: "Güvenilir",
    className: "text-amber-300 border-amber-400/40 bg-amber-400/10",
    scope: "seller",
    description: "Yüksek memnuniyet oranına sahip satıcı.",
  },
  premium_seller: {
    key: "premium_seller",
    emoji: "🏆",
    label: "Premium Satıcı",
    short: "Premium",
    className: "text-gold border-gold/40 bg-gold/10",
    scope: "seller",
    description: "Premium üyelik satın alan ve öne çıkarılan satıcı.",
  },
  elite_seller: {
    key: "elite_seller",
    emoji: "👑",
    label: "Elit Satıcı",
    short: "Elit",
    className: "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10",
    scope: "seller",
    description: "En üst kademe, doğrulanmış ve öne çıkarılmış satıcı.",
  },
};

export function verificationBadgeMeta(key: string): VerificationBadgeMeta | null {
  return (VERIFICATION_BADGES as Record<string, VerificationBadgeMeta>)[key] ?? null;
}

export const SELLER_BADGE_KEYS: SellerBadgeKey[] = [
  "seller_verified",
  "trusted_seller",
  "premium_seller",
  "elite_seller",
];
export const USER_BADGE_KEYS: UserBadgeKey[] = ["user_verified"];
