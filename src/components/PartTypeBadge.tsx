import { getPartTypeMeta } from "@/lib/part-type";

interface Props {
  partType: string | null | undefined;
  size?: "sm" | "md";
  showEmoji?: boolean;
  className?: string;
}

export function PartTypeBadge({ partType, size = "sm", showEmoji = true, className = "" }: Props) {
  const meta = getPartTypeMeta(partType);
  if (!meta) return null;
  const sizeClass =
    size === "md"
      ? "text-[11px] px-2.5 py-1"
      : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${meta.badgeClass} ${sizeClass} ${className}`}
    >
      {showEmoji && <span aria-hidden>{meta.emoji}</span>}
      <span>{meta.label}</span>
    </span>
  );
}
