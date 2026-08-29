import { BadgeCheck, ShieldCheck, Medal } from "lucide-react";

export function TrustStrip() {
  const items = [
    {
      Icon: BadgeCheck,
      label: "Gerçek Satıcılar",
      sub: "Doğrulanmış firmalar",
      cls: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20",
    },
    {
      Icon: ShieldCheck,
      label: "Güvenli Alışveriş",
      sub: "Uçtan uca koruma",
      cls: "bg-blue-500/12 text-blue-600 ring-blue-500/20",
    },
    {
      Icon: Medal,
      label: "Uygun Fiyat Garantisi",
      sub: "Piyasanın altında fırsatlar",
      cls: "bg-orange-500/12 text-orange-600 ring-orange-500/20",
    },
  ];
  return (
    // Mobilde tek kart (bölünmüş satırlar), sm+ üç ayrı kart.
    <ul className="rounded-2xl border border-border bg-card divide-y divide-border sm:divide-y-0 sm:border-0 sm:bg-transparent sm:grid sm:grid-cols-3 sm:gap-4">
      {items.map(({ Icon, label, sub, cls }) => (
        <li
          key={label}
          className="flex items-center gap-3 p-3 sm:card-lift sm:gap-3.5 sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-5 sm:shadow-card sm:hover:border-gold/50"
        >
          <span className={`grid size-9 sm:size-12 shrink-0 place-items-center rounded-full ring-1 ${cls}`}>
            <Icon className="size-5 sm:size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold leading-tight">{label}</p>
            <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-snug">{sub}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
