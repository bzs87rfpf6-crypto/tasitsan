import { badgeMeta, type TrustBadge } from "@/lib/trust";

interface Props {
  badge: TrustBadge;
  size?: "sm" | "md";
}

export function TrustBadgePill({ badge, size = "sm" }: Props) {
  const meta = badgeMeta(badge);
  if (!meta) return null;
  const cls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider ${cls} ${meta.className}`}
      title={meta.label}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
