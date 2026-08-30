import { useEffect, useState } from "react";
import { Package, UserPlus, PackageSearch, Radio } from "lucide-react";
import { homePublicRpc } from "@/lib/home-public-rpc";

type Kind = "part" | "seller" | "request";
interface ActivityItem { kind: Kind; label: string; at: string }

const ICONS: Record<Kind, typeof Package> = {
  part: Package,
  seller: UserPlus,
  request: PackageSearch,
};

function ago(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const m = Math.max(1, Math.round(diff / 60000));
  if (m < 60) return `${m} dakika önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.round(h / 24)} gün önce`;
}

const SUFFIX: Record<Kind, string> = {
  part: " eklendi",
  seller: "",
  request: "",
};

/** Gerçek veritabanı olaylarından beslenen canlı aktivite şeridi. */
export function LiveActivityFeed() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await homePublicRpc<ActivityItem[]>("home_activity_feed", { _limit: 6 });
      if (!cancelled && Array.isArray(data)) {
        // Tek tür akışı doldurmasın: her türden en fazla 3 olay göster.
        const counts: Record<string, number> = {};
        const mixed = (data as ActivityItem[]).filter((it) => {
          counts[it.kind] = (counts[it.kind] ?? 0) + 1;
          return counts[it.kind]! <= 3;
        });
        setItems(mixed.slice(0, 6));
      }
      else if (!cancelled) setItems([]);
    };
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (items !== null && items.length === 0) return null;

  const TONE: Record<Kind, string> = {
    part: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20",
    seller: "bg-blue-500/12 text-blue-600 ring-blue-500/20",
    request: "bg-orange-500/12 text-orange-600 ring-orange-500/20",
  };

  return (
    <section aria-label="Canlı aktivite" className="rounded-2xl border border-border bg-card p-3.5 sm:p-5 sm:shadow-card">
      <div className="flex items-center gap-1.5 pb-2.5 sm:pb-3 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-gold">
        <Radio className="size-4 animate-pulse" /> Canlı Hareketlilik
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(items ?? Array.from({ length: 3 }).map(() => null)).map((it, i) => {
          // Mobilde varsayılan olarak yalnızca ilk 3 kayıt görünür.
          const hiddenOnMobile = i >= 3 && !expanded;
          if (!it) return <li key={`s-${i}`} className={`h-11 rounded-xl bg-muted/50 animate-pulse ${hiddenOnMobile ? "hidden sm:block" : ""}`} />;
          const Icon = ICONS[it.kind] ?? Package;
          return (
            <li
              key={`${it.kind}-${it.at}-${i}`}
              className={`min-w-0 items-center gap-2.5 rounded-xl bg-background/60 px-3 py-2.5 ${hiddenOnMobile ? "hidden sm:flex" : "flex"}`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ring-1 ${TONE[it.kind] ?? TONE.part}`}>
                <Icon className="size-4" />
              </span>
              <span className="truncate text-xs sm:text-sm font-medium text-foreground">
                <span className="text-muted-foreground font-normal">{ago(it.at)}</span>{" "}
                {it.label}{SUFFIX[it.kind]}
              </span>
            </li>
          );
        })}
      </ul>
      {!expanded && (items?.length ?? 0) > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="sm:hidden mt-2.5 w-full rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground"
        >
          Tümünü Gör
        </button>
      )}
    </section>
  );
}
