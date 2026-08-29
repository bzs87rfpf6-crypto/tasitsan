import { Star } from "lucide-react";

interface Props {
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
  className?: string;
}

export function StarRating({ value, size = 16, interactive = false, onChange, className = "" }: Props) {
  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i - 0.25;
        const half = !filled && value >= i - 0.75;
        const Icon = (
          <Star
            style={{ width: size, height: size }}
            className={filled || half ? "text-gold fill-gold" : "text-muted-foreground/40"}
            aria-hidden
          />
        );
        return interactive ? (
          <button key={i} type="button" onClick={() => onChange?.(i)} className="p-0.5 hover:scale-110 transition-transform" aria-label={`${i} yıldız`}>
            {Icon}
          </button>
        ) : (
          <span key={i}>{Icon}</span>
        );
      })}
    </div>
  );
}
