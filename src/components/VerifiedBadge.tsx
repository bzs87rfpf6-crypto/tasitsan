import { BadgeCheck } from "lucide-react";

interface Props {
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export function VerifiedBadge({ size = 14, className = "", showLabel = false }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-sky-400 ${className}`}
      title="Doğrulanmış Satıcı"
      aria-label="Doğrulanmış Satıcı"
    >
      <BadgeCheck className="fill-sky-400/20 stroke-sky-400" style={{ width: size, height: size }} />
      {showLabel && <span className="text-[11px] font-semibold">Doğrulanmış Satıcı</span>}
    </span>
  );
}
