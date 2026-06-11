import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";

interface Props {
  onFiles: (files: FileList | null) => void;
  /** Show a smaller compact variant (used inside grids) */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Mobile-friendly photo picker that offers Gallery and Camera as separate
 * affordances. Using two inputs avoids the iOS Safari issue where a restrictive
 * `accept` list opens the camera directly without offering the photo library.
 *
 * - Gallery input: `accept="image/*"` (no capture) → opens the OS picker on
 *   iOS / Android and lets the user choose multiple existing photos.
 * - Camera input: `accept="image/*"` + `capture="environment"` → opens the
 *   rear camera directly on mobile, falls back to file picker on desktop.
 */
export function PhotoPicker({ onFiles, compact, disabled }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const size = compact ? "size-4" : "size-5";
  const padding = compact ? "py-2 px-2 text-[11px]" : "py-3 px-3 text-xs";

  return (
    <>
      <div className={`grid grid-cols-2 gap-2 ${compact ? "" : "mt-1"}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
          className={`flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border hover:border-gold/60 transition-colors text-muted-foreground hover:text-foreground font-medium ${padding} disabled:opacity-50`}
        >
          <ImagePlus className={size} />
          <span>Galeri</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className={`flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border hover:border-gold/60 transition-colors text-muted-foreground hover:text-foreground font-medium ${padding} disabled:opacity-50`}
        >
          <Camera className={size} />
          <span>Kamera</span>
        </button>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
