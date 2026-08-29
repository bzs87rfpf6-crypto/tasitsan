import { Sparkles } from "lucide-react";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function isNew(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < THREE_DAYS_MS;
}

export function NewBadge({ createdAt, className = "" }: { createdAt?: string | null; className?: string }) {
  if (!isNew(createdAt)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-gradient text-gold-foreground shadow-gold ${className}`}
      title="Son 3 gün içinde eklendi"
    >
      <Sparkles className="size-3" /> YENİ
    </span>
  );
}
