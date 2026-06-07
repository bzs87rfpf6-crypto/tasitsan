import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/tasitsan-emblem.png.asset.json";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3.5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3 tap-gold rounded-xl px-1 -mx-1">
          <img
            src={logoAsset.url}
            alt="Taşıtsan Parça Borsası logosu"
            width={68}
            height={68}
            className="h-16 w-16 sm:h-[4.4rem] sm:w-[4.4rem] object-contain drop-shadow-[0_2px_10px_rgba(212,175,55,0.45)]"
            loading="eager"
            decoding="async"
          />
          <div className="leading-tight">
            <div className="font-display text-[1.85rem] sm:text-[2.1rem] tracking-wider text-gold">TAŞITSAN</div>
            <div className="text-[12px] sm:text-[13px] uppercase tracking-[0.22em] text-gold/85">
              {subtitle ?? "Parça Borsası"}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
