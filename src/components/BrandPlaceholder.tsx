import { useState } from "react";
import tasitsanLogo from "@/assets/tasitsan-official.png.asset.json";
import { getBrandLogoUrl } from "@/lib/brand-logos";

interface Props {
  brand?: string | null;
  title?: string | null;
  oemCode?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: { logo: "h-12", title: "text-[11px]", oem: "text-[9px]", padding: "p-2 gap-1" },
  md: { logo: "h-20", title: "text-sm", oem: "text-[10px]", padding: "p-3 gap-2" },
  lg: { logo: "h-32", title: "text-base", oem: "text-xs", padding: "p-5 gap-3" },
};

export function BrandPlaceholder({ brand, title, oemCode, size = "sm", className = "" }: Props) {
  const logoUrl = getBrandLogoUrl(brand);
  const [logoBroken, setLogoBroken] = useState(false);
  const sizes = SIZE_MAP[size];
  const showBrand = logoUrl && !logoBroken;

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center text-center bg-gradient-to-br from-secondary via-background to-secondary ${sizes.padding} ${className}`}
    >
      {showBrand ? (
        <img
          src={logoUrl}
          alt={brand ?? ""}
          loading="lazy"
          decoding="async"
          onError={() => setLogoBroken(true)}
          className={`${sizes.logo} w-auto object-contain opacity-90 drop-shadow-sm`}
        />
      ) : (
        <img
          src={tasitsanLogo.url}
          alt="Taşıtsan"
          loading="lazy"
          decoding="async"
          className={`${sizes.logo} w-auto object-contain opacity-60`}
        />
      )}
      {title && (
        <p className={`${sizes.title} font-semibold text-foreground line-clamp-2 leading-tight`}>
          {title}
        </p>
      )}
      {oemCode && (
        <p className={`${sizes.oem} font-mono text-muted-foreground tracking-wider uppercase line-clamp-1`}>
          OEM: {oemCode}
        </p>
      )}
    </div>
  );
}
