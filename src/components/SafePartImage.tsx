import { useMemo, useState } from "react";
import { getPartImageDisplayUrl, getSafePartPhotos } from "@/lib/part-images";
import { BrandPlaceholder } from "@/components/BrandPlaceholder";
import { useOemLibraryImage } from "@/lib/oem-library-resolver";

interface SafePartImageProps {
  images: unknown;
  alt: string;
  width?: number;
  className?: string;
  fallbackClassName?: string;
  brand?: string | null;
  title?: string | null;
  oemCode?: string | null;
  /** Birden fazla OEM olabilir (parts.oem_codes). */
  oemCodes?: ReadonlyArray<string | null | undefined>;
  placeholderSize?: "sm" | "md" | "lg";
  /** OEM Havuzu lookup'unu kapatmak için (örn. düzenleme modunda). */
  disableOemLibrary?: boolean;
  /** Görsel alanında ürün adı/OEM metni gösterilsin mi (kart içinde metin alanı ayrıdır). */
  showPlaceholderText?: boolean;
}

/**
 * Görsel seçim önceliği:
 *   1) parts.photos[0] (props.images)
 *   2) OEM Görsel Havuzu — birebir OEM eşleşmesi
 *   3) OEM Görsel Havuzu — normalize edilmiş OEM eşleşmesi
 *   4) Marka logosu (BrandPlaceholder)
 */
export function SafePartImage({
  images,
  alt,
  width = 640,
  className = "w-full h-full object-cover",
  fallbackClassName = "w-full h-full",
  brand,
  title,
  oemCode,
  oemCodes,
  placeholderSize = "sm",
  disableOemLibrary = false,
  showPlaceholderText = true,
}: SafePartImageProps) {
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const [brokenOem, setBrokenOem] = useState(false);
  const photo = getSafePartPhotos(images, brokenPhotos, width)[0];

  const oemList = useMemo(() => {
    const out: string[] = [];
    if (oemCode) out.push(oemCode);
    if (oemCodes) for (const c of oemCodes) if (c) out.push(String(c));
    return out;
  }, [oemCode, oemCodes]);

  const { data: oemImage } = useOemLibraryImage({
    oemCodes: oemList,
    enabled: !disableOemLibrary && !photo && oemList.length > 0,
  });

  if (photo) {
    return (
      <img
        src={photo.display}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          console.warn("[safe-part-image] image failed to load", { image: photo.original });
          setBrokenPhotos((prev) => new Set(prev).add(photo.original).add(photo.display));
        }}
        className={className}
      />
    );
  }

  if (oemImage && !brokenOem) {
    const display = getPartImageDisplayUrl(oemImage.url, width) ?? oemImage.url;
    return (
      <img
        src={display}
        alt={alt}
        loading="lazy"
        decoding="async"
        data-oem-library-match={oemImage.match}
        onError={() => {
          console.warn("[safe-part-image] oem library image failed", oemImage.url);
          setBrokenOem(true);
        }}
        className={className}
      />
    );
  }

  return (
    <div className={fallbackClassName}>
      <BrandPlaceholder
        brand={brand}
        title={showPlaceholderText ? (title ?? alt) : null}
        oemCode={showPlaceholderText ? oemCode : null}
        size={placeholderSize}
      />
    </div>
  );
}
