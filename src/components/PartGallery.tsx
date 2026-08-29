import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { BrandPlaceholder } from "@/components/BrandPlaceholder";

type Photo = { original: string; display: string };

interface Props {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  onOpen: () => void;
  onError?: (p: Photo) => void;
  title: string;
  brand?: string | null;
  oemCode?: string | null;
}

/**
 * E-ticaret tarzı ürün galerisi.
 * - Mobilde sağa/sola kaydırma + tek dokunuşta sonraki fotoğraf.
 * - Masaüstünde sol/sağ ok butonları + tam ekran ikonu.
 * - Üst köşede 1/N sayacı; alt strip thumbnail navigasyon.
 * - Akıcı translateX geçişi.
 */
export function PartGallery({
  photos, index, onIndexChange, onOpen, onError, title, brand, oemCode,
}: Props) {
  const startX = useRef<number | null>(null);
  const dx = useRef(0);
  const [drag, setDrag] = useState(0);
  const count = photos.length;
  const has = count > 0;

  const go = (delta: number) => {
    const next = Math.max(0, Math.min(count - 1, index + delta));
    if (next !== index) onIndexChange(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!has) return;
    startX.current = e.clientX;
    dx.current = 0;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    dx.current = e.clientX - startX.current;
    setDrag(dx.current);
  };
  const onPointerUp = () => {
    if (startX.current == null) return;
    const moved = dx.current;
    startX.current = null;
    setDrag(0);
    if (Math.abs(moved) > 50) {
      if (moved < 0) go(1); else go(-1);
    } else if (Math.abs(moved) < 5) {
      // treat as a tap on the main image
      if (count > 1) go(1);
      else onOpen();
    }
  };

  return (
    <div className="space-y-3">
      <div className="group relative bg-secondary aspect-square lg:aspect-[4/3] lg:rounded-2xl overflow-hidden">
        {has ? (
          <div
            className="absolute inset-0 touch-pan-y select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ cursor: count > 1 ? "grab" : "zoom-in" }}
          >
            <div
              className="flex h-full w-full"
              style={{
                transform: `translate3d(calc(${-index * 100}% + ${drag}px), 0, 0)`,
                transition: drag === 0 ? "transform 0.35s cubic-bezier(0.22,1,0.36,1)" : "none",
                willChange: "transform",
              }}
            >
              {photos.map((p, i) => {
                const isActive = i === index;
                const richAlt = `${oemCode ? `${oemCode} ` : ""}${title}${brand ? ` — ${brand}` : ""} OEM Parça`.replace(/\s+/g, " ").trim();
                return (
                  <img
                    key={p.display}
                    src={p.display}
                    alt={richAlt}
                    title={richAlt}
                    width={1200}
                    height={1200}
                    draggable={false}
                    onError={() => onError?.(p)}
                    loading={isActive ? "eager" : "lazy"}
                    fetchPriority={isActive ? "high" : "low"}
                    decoding="async"
                    className="w-full h-full shrink-0 object-cover"
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <BrandPlaceholder brand={brand ?? null} title={title} oemCode={oemCode ?? null} size="lg" />
        )}

        {has && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              aria-label="Tam ekran"
              className="absolute top-3 right-3 z-10 size-10 rounded-full bg-background/70 backdrop-blur grid place-items-center text-foreground hover:bg-background transition"
            >
              <Expand className="size-4" />
            </button>
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); go(-1); }}
                  disabled={index === 0}
                  aria-label="Önceki fotoğraf"
                  className="hidden sm:grid absolute left-3 top-1/2 -translate-y-1/2 z-10 size-11 rounded-full bg-background/70 backdrop-blur place-items-center text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-background transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); go(1); }}
                  disabled={index === count - 1}
                  aria-label="Sonraki fotoğraf"
                  className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 z-10 size-11 rounded-full bg-background/70 backdrop-blur place-items-center text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-background transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <ChevronRight className="size-5" />
                </button>
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-full bg-background/70 backdrop-blur text-[11px] font-semibold tabular-nums text-foreground">
                  {index + 1} / {count}
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 pointer-events-none">
                  {photos.map((_, i) => (
                    <span key={i}
                      className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-gold" : "w-1.5 bg-white/50"}`} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 px-4 lg:px-0 overflow-x-auto scrollbar-none">
          {photos.map((p, i) => (
            <button
              key={p.display}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`shrink-0 size-16 lg:size-20 rounded-lg overflow-hidden border-2 transition ${
                i === index ? "border-gold" : "border-transparent hover:border-gold/40"
              }`}
              aria-label={`Fotoğraf ${i + 1}`}
            >
              <img
                src={p.display}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => onError?.(p)}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
