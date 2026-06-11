import { useState } from "react";
import { getSafePartPhotos } from "@/lib/part-images";
import { BrandPlaceholder } from "@/components/BrandPlaceholder";

interface SafePartImageProps {
  images: unknown;
  alt: string;
  width?: number;
  className?: string;
  fallbackClassName?: string;
  brand?: string | null;
  title?: string | null;
  oemCode?: string | null;
  placeholderSize?: "sm" | "md" | "lg";
}

export function SafePartImage({
  images,
  alt,
  width = 640,
  className = "w-full h-full object-cover",
  fallbackClassName = "w-full h-full",
  brand,
  title,
  oemCode,
  placeholderSize = "sm",
}: SafePartImageProps) {
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const photo = getSafePartPhotos(images, brokenPhotos, width)[0];

  if (!photo) {
    return (
      <div className={fallbackClassName}>
        <BrandPlaceholder brand={brand} title={title ?? alt} oemCode={oemCode} size={placeholderSize} />
      </div>
    );
  }

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
