import { Flame } from "lucide-react";
import {
  DELIVERY_META,
  normalizeDeliveryOptions,
  type DeliveryOption,
} from "@/lib/delivery-options";

interface Props {
  options?: readonly string[] | null;
  urgent?: boolean | null;
  /** Compact = product cards (icon-only). Full = detail page. */
  variant?: "compact" | "full";
  max?: number;
  className?: string;
}

export function DeliveryBadges({ options, urgent, variant = "full", max, className = "" }: Props) {
  const list = normalizeDeliveryOptions(options ?? []);
  if (list.length === 0 && !urgent) return null;

  const items = max ? list.slice(0, max) : list;
  const overflow = max && list.length > max ? list.length - max : 0;

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap items-center gap-1 ${className}`}>
        {urgent && (
          <span
            title="🔥 Acil Teslimata Uygun"
            className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          >
            <Flame className="size-2.5" /> Acil
          </span>
        )}
        {items.map((o) => {
          const m = DELIVERY_META[o as DeliveryOption];
          return (
            <span
              key={o}
              title={m.label}
              aria-label={m.label}
              className="inline-flex items-center rounded-full bg-background/80 border border-border px-1.5 py-0.5 text-[10px]"
            >
              <span aria-hidden>{m.emoji}</span>
            </span>
          );
        })}
        {overflow > 0 && (
          <span className="text-[9px] text-muted-foreground">+{overflow}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-1.5">
        {urgent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/50 text-orange-300 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
            <Flame className="size-3.5" /> Acil Teslimata Uygun
          </span>
        )}
        {list.map((o) => {
          const m = DELIVERY_META[o as DeliveryOption];
          return (
            <span
              key={o}
              className="inline-flex items-center gap-1 rounded-full bg-card border border-gold/30 text-foreground px-2.5 py-1 text-[11px] font-semibold"
            >
              <span aria-hidden>{m.emoji}</span> {m.label}
            </span>
          );
        })}
      </div>
      {urgent && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Bu ürün aynı gün kargoya verilebilir veya otobüs kargo ile acil gönderilebilir.
        </p>
      )}
    </div>
  );
}
