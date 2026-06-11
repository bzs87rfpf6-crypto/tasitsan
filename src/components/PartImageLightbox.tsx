import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

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

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * E-ticaret tarzı tam ekran görüntüleyici.
 * - Görsel ekranın en fazla %80'ini kaplar (max-w/h: 80vw/80vh).
 * - Orijinal en-boy oranı korunur (object-contain), düşük çözünürlüklü görseller
 *   doğal boyutlarının üzerine yapay olarak büyütülmez.
 * - Pinch (mobil), çift dokunma, masaüstünde tekerlek + butonlarla zoom.
 * - Zoom seviyesi >1 iken sürükleyerek pan yapılabilir.
 * - Arka plan hafif blur'lu; kapatma butonu daima görünür.
 */
export function PartImageLightbox({ photos, index, onIndexChange, onClose, onError }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever slide changes
  useEffect(() => { reset(); setNatural(null); }, [index, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < photos.length - 1 && scale === 1) onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0 && scale === 1) onIndexChange(index - 1);
      else if (e.key === "+" || e.key === "=") setScale(s => Math.min(MAX_SCALE, s + 0.5));
      else if (e.key === "-") setScale(s => Math.max(MIN_SCALE, s - 0.5));
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, photos.length, scale, onClose, onIndexChange, reset]);

  const photo = photos[index];
  if (!photo) return null;

  // Clamp offset so the image doesn't drift off-screen when panning.
  const clampOffset = (x: number, y: number, s: number) => {
    const el = imgRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    // rect already reflects current scale via CSS transform; compute base from /s
    const baseW = rect.width / s;
    const baseH = rect.height / s;
    const maxX = Math.max(0, (baseW * s - baseW) / 2);
    const maxY = Math.max(0, (baseH * s - baseH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale(s => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta * 2));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStart.current = { dist, scale };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      // Double-tap to toggle zoom
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setScale(s => (s > 1 ? 1 : 2));
        setOffset({ x: 0, y: 0 });
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      if (scale > 1) {
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (dist / pinchStart.current.dist) * pinchStart.current.scale));
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    } else if (pointers.current.size === 1 && panStart.current && scale > 1) {
      const nx = panStart.current.ox + (e.clientX - panStart.current.x);
      const ny = panStart.current.oy + (e.clientY - panStart.current.y);
      setOffset(clampOffset(nx, ny, scale));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  // Cap display size to the image's natural dimensions to prevent upscaling.
  const maxImgStyle: React.CSSProperties = natural
    ? { maxWidth: `min(80vw, ${natural.w}px)`, maxHeight: `min(80vh, ${natural.h}px)` }
    : { maxWidth: "80vw", maxHeight: "80vh" };

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center touch-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Fotoğraf görüntüleyici"
    >
      {/* Top bar: counter + zoom + close (always visible) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-card/80 backdrop-blur px-3 py-1.5 border border-border">
        {photos.length > 1 && (
          <span className="text-xs text-foreground/90 tabular-nums px-1">{index + 1} / {photos.length}</span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(MIN_SCALE, s - 0.5)); }}
          className="size-7 grid place-items-center rounded-full hover:bg-foreground/10 text-foreground disabled:opacity-40"
          disabled={scale <= MIN_SCALE}
          aria-label="Uzaklaştır"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(MAX_SCALE, s + 0.5)); }}
          className="size-7 grid place-items-center rounded-full hover:bg-foreground/10 text-foreground disabled:opacity-40"
          disabled={scale >= MAX_SCALE}
          aria-label="Yakınlaştır"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-3 right-3 z-20 size-11 rounded-full bg-card/80 backdrop-blur border border-border grid place-items-center text-foreground hover:bg-card"
        aria-label="Kapat"
      >
        <X className="size-5" />
      </button>

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
          className="absolute left-3 z-20 size-11 rounded-full bg-card/80 backdrop-blur border border-border grid place-items-center text-foreground hover:bg-card"
          aria-label="Önceki"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
          className="absolute right-3 z-20 size-11 rounded-full bg-card/80 backdrop-blur border border-border grid place-items-center text-foreground hover:bg-card"
          aria-label="Sonraki"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      <div
        className="relative flex items-center justify-center w-full h-full"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          key={photo.display}
          src={photo.display}
          alt=""
          onLoad={(e) => {
            const el = e.currentTarget;
            setNatural({ w: el.naturalWidth, h: el.naturalHeight });
          }}
          onError={() => onError?.(photo)}
          style={{
            ...maxImgStyle,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: pointers.current.size === 0 ? "transform 0.18s ease" : "none",
            cursor: scale > 1 ? "grab" : "zoom-in",
            willChange: "transform",
          }}
          className="object-contain select-none"
          draggable={false}
        />
      </div>

      {photos.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndexChange(i); }}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-gold" : "w-1.5 bg-foreground/30 hover:bg-foreground/60"}`}
              aria-label={`Fotoğraf ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
