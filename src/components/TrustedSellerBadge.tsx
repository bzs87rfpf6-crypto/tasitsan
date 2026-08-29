import { ShieldCheck } from "lucide-react";

interface Props {
  size?: number;
  className?: string;
  showLabel?: boolean;
}

/**
 * "Güvenilir Satıcı" rozeti — Admin tarafından verilir (profiles.trusted_seller).
 * Siyah + altın Taşıtsan teması.
 */
export function TrustedSellerBadge({ size = 14, className = "", showLabel = false }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-gold ${className}`}
      title="Güvenilir Satıcı"
      aria-label="Güvenilir Satıcı"
    >
      <ShieldCheck
        className="stroke-gold fill-gold/15"
        style={{ width: size, height: size }}
      />
      {showLabel && (
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          Güvenilir Satıcı
        </span>
      )}
    </span>
  );
}
