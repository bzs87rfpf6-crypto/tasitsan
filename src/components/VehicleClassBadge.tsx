import { getVehicleClassMeta } from "@/lib/vehicle-class";

export function VehicleClassBadge({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const m = getVehicleClassMeta(value);
  // Don't render badge for default automobile to keep existing UI clean.
  if (!value || value === "automobile") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.badgeClass} ${className}`}
      title={m.label}
    >
      <span aria-hidden>{m.emoji}</span>
      {m.short}
    </span>
  );
}
