import { Package, BadgeDollarSign, ShieldCheck, Rocket } from "lucide-react";

const BADGES = [
  {
    Icon: Package,
    title: "14.000+ Yayındaki Parça",
    sub: "Geniş ürün havuzu",
  },
  {
    Icon: BadgeDollarSign,
    title: "Uygun Fiyatlı Yedek Parçalar",
    sub: "Piyasanın altında fırsatlar",
  },
  {
    Icon: ShieldCheck,
    title: "Güvenilir Satıcılar",
    sub: "Doğrulanmış ilanlar",
  },
  {
    Icon: Rocket,
    title: "Yakında 145.000+ Yeni Stok",
    sub: "Çok daha fazla seçenek",
  },
];

export function TrustBadges() {
  return (
    <section aria-label="Taşıtsan güven göstergeleri" className="max-w-5xl mx-auto px-3 sm:px-5 pt-3 pb-1">
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {BADGES.map(({ Icon, title, sub }) => (
          <li
            key={title}
            className="group relative overflow-hidden bg-card border border-border rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 transition-all duration-300 hover:border-gold hover:-translate-y-0.5 hover:shadow-gold"
          >
            <span className="shrink-0 size-9 sm:size-10 rounded-full bg-gold/10 grid place-items-center text-gold transition-transform duration-300 group-hover:scale-110 group-hover:bg-gold-gradient group-hover:text-gold-foreground">
              <Icon className="size-4 sm:size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-bold leading-tight">{title}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight">{sub}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
