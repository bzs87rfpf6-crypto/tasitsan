// Vehicle class taxonomy. Backwards-compatible: legacy rows default to "automobile".

export type VehicleClass = "automobile" | "heavy_vehicle" | "construction" | "agriculture";

export const VEHICLE_CLASS_VALUES: VehicleClass[] = [
  "automobile",
  "heavy_vehicle",
  "construction",
  "agriculture",
];

export interface VehicleClassMeta {
  value: VehicleClass;
  label: string;       // TR label for UI
  short: string;       // Compact badge label
  emoji: string;
  slug: string;        // SEO slug
  badgeClass: string;
}

export const VEHICLE_CLASS_META: Record<VehicleClass, VehicleClassMeta> = {
  automobile: {
    value: "automobile",
    label: "Otomobil",
    short: "Otomobil",
    emoji: "🚗",
    slug: "otomobil",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  },
  heavy_vehicle: {
    value: "heavy_vehicle",
    label: "Ağır Vasıta",
    short: "Ağır Vasıta",
    emoji: "🚚",
    slug: "agir-vasita",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  construction: {
    value: "construction",
    label: "İş Makinesi",
    short: "İş Mak.",
    emoji: "🚜",
    slug: "is-makinesi",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  agriculture: {
    value: "agriculture",
    label: "Tarım Makinesi",
    short: "Tarım",
    emoji: "🌾",
    slug: "tarim-makinesi",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
};

export function getVehicleClassMeta(v: string | null | undefined): VehicleClassMeta {
  if (!v) return VEHICLE_CLASS_META.automobile;
  return (VEHICLE_CLASS_META as Record<string, VehicleClassMeta>)[v] ?? VEHICLE_CLASS_META.automobile;
}
