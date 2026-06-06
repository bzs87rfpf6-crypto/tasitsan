export type PartType = "original" | "equivalent" | "aftermarket" | "used" | "refurbished";

export const PART_TYPE_VALUES: PartType[] = [
  "original",
  "equivalent",
  "aftermarket",
  "used",
  "refurbished",
];

export interface PartTypeMeta {
  value: PartType;
  label: string;          // Short label for badges
  longLabel: string;      // Long label for selectors
  emoji: string;
  // Tailwind classes for badge background/border/text
  badgeClass: string;
}

export const PART_TYPE_META: Record<PartType, PartTypeMeta> = {
  original: {
    value: "original",
    label: "ORİJİNAL OEM",
    longLabel: "Orijinal (OEM)",
    emoji: "🟢",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  },
  equivalent: {
    value: "equivalent",
    label: "EŞDEĞER",
    longLabel: "Eşdeğer / Muadil",
    emoji: "🟡",
    badgeClass: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  },
  aftermarket: {
    value: "aftermarket",
    label: "YAN SANAYİ",
    longLabel: "Yan Sanayi",
    emoji: "🔵",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  },
  used: {
    value: "used",
    label: "ÇIKMA",
    longLabel: "Çıkma",
    emoji: "⚫",
    badgeClass: "bg-zinc-500/20 text-zinc-200 border-zinc-400/40",
  },
  refurbished: {
    value: "refurbished",
    label: "REVİZYONLU",
    longLabel: "Revizyonlu / Yenilenmiş",
    emoji: "🟣",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/40",
  },
};

export function getPartTypeMeta(v: string | null | undefined): PartTypeMeta | null {
  if (!v) return null;
  return (PART_TYPE_META as Record<string, PartTypeMeta>)[v] ?? null;
}

// Accept Turkish labels (case-insensitive) from Excel uploads.
const EXCEL_ALIASES: Record<string, PartType> = {
  "orijinal": "original",
  "orjinal": "original",
  "original": "original",
  "oem": "original",
  "orijinal (oem)": "original",
  "eşdeğer": "equivalent",
  "esdeger": "equivalent",
  "muadil": "equivalent",
  "eşdeğer/muadil": "equivalent",
  "esdeger/muadil": "equivalent",
  "equivalent": "equivalent",
  "yan sanayi": "aftermarket",
  "yansanayi": "aftermarket",
  "aftermarket": "aftermarket",
  "çıkma": "used",
  "cikma": "used",
  "used": "used",
  "revizyonlu": "refurbished",
  "yenilenmiş": "refurbished",
  "yenilenmis": "refurbished",
  "revizyonlu/yenilenmiş": "refurbished",
  "refurbished": "refurbished",
};

export function parsePartTypeFromExcel(raw: string | null | undefined): PartType | null {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  return EXCEL_ALIASES[k] ?? EXCEL_ALIASES[k.replace(/\s+/g, "")] ?? null;
}
