import { verificationBadgeMeta } from "@/lib/verification-badges";

interface Props {
  badge: string;
  size?: "sm" | "md";
}

export function VerificationBadgePill({ badge, size = "sm" }: Props) {
  const meta = verificationBadgeMeta(badge);
  if (!meta) return null;
  const cls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider ${cls} ${meta.className}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      {size === "md" ? meta.label : meta.short}
    </span>
  );
}

interface ListProps {
  badges: string[] | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

export function VerificationBadgeList({ badges, size = "sm", className }: ListProps) {
  const list = (badges ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {list.map((b) => (
        <VerificationBadgePill key={b} badge={b} size={size} />
      ))}
    </div>
  );
}
