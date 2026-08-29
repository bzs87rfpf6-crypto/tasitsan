import {
  VEHICLE_CLASS_VALUES,
  VEHICLE_CLASS_META,
  type VehicleClass,
} from "@/lib/vehicle-class";

export function VehicleClassPicker({
  value,
  onChange,
  label = "Araç Sınıfı *",
}: {
  value: VehicleClass;
  onChange: (v: VehicleClass) => void;
  label?: string;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {VEHICLE_CLASS_VALUES.map((v) => {
          const m = VEHICLE_CLASS_META[v];
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`h-11 px-2 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1.5 ${
                active
                  ? "bg-gold-gradient text-gold-foreground border-transparent"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span aria-hidden>{m.emoji}</span>
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
