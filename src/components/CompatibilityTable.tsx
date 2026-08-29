import { Car } from "lucide-react";

interface Props {
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  engineCode?: string | null;
  fuelType?: string | null;
}

export function CompatibilityTable({ brand, model, year, engineCode, fuelType }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: "Marka", value: brand ?? "—" },
    { label: "Model", value: model ?? "—" },
    { label: "Üretim Yılı", value: year ? String(year) : "—" },
    { label: "Motor Kodu", value: engineCode ?? "—" },
    { label: "Yakıt Tipi", value: fuelType ?? "—" },
  ];
  if (rows.every((r) => r.value === "—")) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Car className="size-4 text-gold" />
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Araç Uyumluluk Tablosu</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-4 text-muted-foreground text-xs uppercase tracking-wider w-32">{r.label}</td>
                <td className="py-1.5 font-medium">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
