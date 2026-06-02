import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Photo {
  original: string;
  display: string;
}

interface Props {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onError?: (photo: Photo) => void;
}

/**
 * Full-screen image viewer. Renders outside any form, uses portal-free fixed
 * overlay with `type="button"` on every control so taps never submit a form or
 * trigger a navigation. Escape + arrow keys + swipe-friendly navigation.
 */
export function PartImageLightbox({ photos, index, onIndexChange, onClose, onError }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < photos.length - 1) onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, photos.length, onClose, onIndexChange]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Fotoğraf görüntüleyici"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-10 size-11 rounded-full bg-white/10 backdrop-blur grid place-items-center text-white hover:bg-white/20"
        aria-label="Kapat"
      >
        <X className="size-5" />
      </button>

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
          className="absolute left-3 z-10 size-11 rounded-full bg-white/10 backdrop-blur grid place-items-center text-white hover:bg-white/20"
          aria-label="Önceki"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
          className="absolute right-3 z-10 size-11 rounded-full bg-white/10 backdrop-blur grid place-items-center text-white hover:bg-white/20"
          aria-label="Sonraki"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      <img
        key={photo.display}
        src={photo.display}
        alt=""
        onClick={(e) => e.stopPropagation()}
        onError={() => onError?.(photo)}
        className="max-w-[95vw] max-h-[90vh] object-contain select-none"
        draggable={false}
      />

      {photos.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
