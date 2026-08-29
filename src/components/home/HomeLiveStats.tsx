import { Package, Store, Users, Hash, Sparkles, BadgeCheck, Info } from "lucide-react";
import { usePlatformStats } from "@/lib/platform-stats";
import { useOnlineParcaBrandStats } from "@/lib/onlineparca-brands";

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function HomeLiveStats() {
  const { stats, loading } = usePlatformStats();
  const brandStats = useOnlineParcaBrandStats();
  const services = brandStats?.brand_count ?? 0;

  const items: Array<{
    Icon: typeof Package;
    label: string;
    value: string | null;
    ring: string;
    num: string;
  sub?: string | React.ReactNode;
}> = [
    {
      Icon: Package,
      label: "Toplam Ürün",
      value: stats ? fmt(stats.total_parts) : null,
      ring: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20",
      num: "text-emerald-600",
    },
    {
      Icon: Store,
      label: "Toplam Satıcı",
      value: stats ? fmt(stats.total_sellers + services) : null,
      ring: "bg-blue-500/12 text-blue-600 ring-blue-500/20",
      num: "text-blue-600",
      sub:
        stats && services > 0 ? (
          <div className="mt-1.5 space-y-1.5">
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-blue-600 leading-tight">
                <Store className="size-3 sm:size-3.5 shrink-0" />
                <span>{fmt(stats.total_sellers)} Taşıtsan Satıcısı</span>
              </span>
              <span className="text-[10px] font-bold text-muted-foreground leading-none">+</span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-orange-600 leading-tight">
                <BadgeCheck className="size-3 sm:size-3.5 shrink-0" />
                <span>{fmt(services)} YETKİLİ SERVİS</span>
              </span>
            </div>
            <div className="flex w-full items-center justify-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-blue-700">
              <Info className="size-3 shrink-0" />
              <span className="break-words text-center leading-tight">
                {fmt(brandStats?.oem_count ?? 0)} MARKA YETKİLİ SERVİS ÜRÜNLERİ
              </span>
            </div>
          </div>
        ) : undefined,
    },
    {
      Icon: Users,
      label: "Toplam Üye",
      value: stats ? fmt(stats.total_members) : null,
      ring: "bg-purple-500/12 text-purple-600 ring-purple-500/20",
      num: "text-purple-600",
    },
    {
      Icon: Hash,
      label: "Toplam OEM",
      value: stats ? fmt(stats.total_oem) : null,
      ring: "bg-orange-500/12 text-orange-600 ring-orange-500/20",
      num: "text-orange-600",
    },
    {
      Icon: Sparkles,
      label: "Bugün Eklenen",
      value: stats ? fmt(stats.today_new) : null,
      ring: "bg-red-500/12 text-red-600 ring-red-500/20",
      num: "text-red-600",
    },
  ];

  return (
    <section
      aria-label="Taşıtsan istatistikleri"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4"
    >
      {items.map(({ Icon, label, value, ring, num, sub }, i) => (
        <div
          key={label}
          className={`sm:card-lift rounded-2xl border border-border bg-card p-3 sm:p-5 sm:shadow-card hover:border-gold/50 ${
            i === items.length - 1 && items.length % 2 === 1 ? "col-span-2 sm:col-span-1" : ""
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className={`grid size-8 sm:size-12 shrink-0 place-items-center rounded-full ring-1 ${ring}`}>
              <Icon className="size-4 sm:size-6" />
            </span>
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide sm:tracking-wider text-muted-foreground leading-tight">
              {label}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-3 min-h-[1.75rem] sm:min-h-[2.5rem] flex items-center">
            {loading || value == null ? (
              <div className="h-6 sm:h-8 w-20 sm:w-24 rounded-lg bg-muted animate-pulse" />
            ) : (
              <span className={`font-display text-2xl sm:text-4xl font-bold tracking-wide sm:tracking-wider ${num}`}>{value}</span>
            )}
          </div>
          {sub && (
            <div className="mt-1">
              {typeof sub === "string" ? (
                <p className="text-[10px] sm:text-[11px] font-medium leading-snug text-muted-foreground break-words">
                  {sub}
                </p>
              ) : (
                sub
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
