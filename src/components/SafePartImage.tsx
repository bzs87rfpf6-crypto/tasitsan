import { useState } from "react";
import { ImageOff } from "lucide-react";
import { getSafePartPhotos } from "@/lib/part-images";

interface SafePartImageProps {
  images: unknown;
  alt: string;
  width?: number;
  className?: string;
  fallbackClassName?: string;
}

export function SafePartImage({ images, alt, width = 640, className = "w-full h-full object-cover", fallbackClassName = "w-full h-full" }: SafePartImageProps) {
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const photo = getSafePartPhotos(images, brokenPhotos, width)[0];

  if (!photo) {
    return (
      <div className={`${fallbackClassName} grid place-items-center text-muted-foreground bg-secondary`}>
        <ImageOff className="size-5" />
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