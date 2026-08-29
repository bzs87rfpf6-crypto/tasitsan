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

  const isOpaque = meta.value === "original" || meta.value === "aftermarket";

  const sizeClass =
    size === "md"
      ? "text-[13px] px-2.5 py-1"
      : "text-[13px] px-2 py-0.5";

  const styleClass = isOpaque
    ? meta.value === "original"
      ? "bg-emerald-700 text-white border-emerald-800 shadow-md"
      : "bg-blue-800 text-white border-blue-900 shadow-md"
    : meta.badgeClass;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-bold uppercase tracking-wider ${styleClass} ${sizeClass} ${className}`}
    >
      {showEmoji && !isOpaque && <span aria-hidden>{meta.emoji}</span>}
      <span>{meta.label}</span>
    </span>
  );
}
