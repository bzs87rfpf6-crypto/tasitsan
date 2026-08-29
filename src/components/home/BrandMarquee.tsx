// "ORİJİNAL MARKALARIMIZ" — logo ağırlıklı, kesintisiz kayan marka şeridi.
import { useState } from "react";
import { getBrandLogoUrl } from "@/lib/brand-logos";

const BRANDS = [
  "Toyota", "Nissan", "Hyundai", "Honda", "SsangYong", "Volkswagen", "Audi",
  "SEAT", "Skoda", "Renault", "Dacia", "Chery", "Suzuki", "MG", "Peugeot",
  "Citroën", "Opel", "BYD", "Kia",
];

function BrandCard({ name }: { name: string }) {
  const url = getBrandLogoUrl(name);
  const [broken, setBroken] = useState(false);
  const showLogo = !!url && !broken;

  return (
    <div className="w-28 sm:w-32 shrink-0 rounded-xl border border-border bg-card shadow-card px-3 py-3 flex flex-col items-center justify-center gap-2">
      {showLogo ? (
        <img
          src={url}
          alt={`${name} logo`}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-10 sm:h-12 w-auto max-w-[70%] object-contain"
        />
      ) : (
        <div className="h-10 sm:h-12 flex items-center justify-center">
          <span className="font-display text-base sm:text-lg tracking-wide text-foreground">{name}</span>
        </div>
      )}
      <span className="text-[11px] sm:text-xs font-medium text-muted-foreground text-center leading-tight line-clamp-1">
        {name}
      </span>
    </div>
  );
}

export function BrandMarquee() {
  const loop = [...BRANDS, ...BRANDS];
  return (
    <section className="max-w-5xl xl:max-w-7xl mx-auto px-3 sm:px-5 pt-4 sm:pt-5">
      <div className="rounded-2xl border border-border bg-card py-4 sm:py-5">
        <div className="px-4 sm:px-6 mb-3 text-center">
          <h2 className="font-display text-sm sm:text-base tracking-[0.18em] uppercase text-foreground">
            Orijinal Markalarımız
          </h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Güvenilir markaların orijinal parçalarını sunuyoruz.
          </p>
        </div>
        <div
          className="relative overflow-x-auto overflow-y-hidden marquee-track [scrollbar-width:none] [-ms-overflow-style:none]"
          style={{ maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)" }}
        >
          <ul className="flex w-max items-stretch gap-3 sm:gap-4 px-3 sm:px-4 animate-brand-marquee" aria-label="Orijinal markalar">
            {loop.map((b, i) => (
              <li key={`${b}-${i}`} aria-hidden={i >= BRANDS.length} className="shrink-0">
                <BrandCard name={b} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
