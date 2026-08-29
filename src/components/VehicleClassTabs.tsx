import { VEHICLE_CLASS_META, type VehicleClass } from "@/lib/vehicle-class";

/**
 * Primary kategori toggle. Varsayılan: Otomobil / Ağır Vasıta / İş Makinesi.
 * Mobilde yatay kaydırılabilir, masaüstünde eşit genişlikte.
 */
export function VehicleClassTabs({
  value,
  onChange,
  classes = ["automobile", "heavy_vehicle", "construction"],
  size = "md",
  labelOverride,
}: {
  value: VehicleClass;
  onChange: (v: VehicleClass) => void;
  classes?: VehicleClass[];
  size?: "sm" | "md";
  labelOverride?: Partial<Record<VehicleClass, string>>;
}) {
  const sizing =
    size === "sm"
      ? "h-9 text-[11px] px-3"
      : "h-12 text-sm px-4 sm:px-5";
  return (
    <div
      role="tablist"
      aria-label="Araç sınıfı"
      className="flex items-center gap-1 p-1 rounded-2xl bg-card border border-border w-full overflow-x-auto sm:overflow-visible scrollbar-none snap-x snap-mandatory"
    >
      {classes.map((v) => {
        const m = VEHICLE_CLASS_META[v];
        const active = value === v;
        const defaultLabel =
          v === "automobile"
            ? "Otomobil Parçaları"
            : v === "heavy_vehicle"
            ? "Ağır Vasıta Parçaları"
            : v === "construction"
            ? "İş Makinesi Parçaları"
            : m.label;
        const label = labelOverride?.[v] ?? defaultLabel;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`${sizing} shrink-0 sm:shrink sm:flex-1 snap-start rounded-xl font-bold tracking-wide flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
              active
                ? "bg-gold-gradient text-gold-foreground shadow-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span aria-hidden>{m.emoji}</span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
