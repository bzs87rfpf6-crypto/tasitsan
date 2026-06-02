import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/tasitsan-emblem.png.asset.json";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src={logoAsset.url}
            alt="Taşıtsan Parça Borsası logosu"
            width={44}
            height={44}
            className="h-11 w-11 object-contain drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)]"
            loading="eager"
            decoding="async"
          />
          <div className="leading-tight">
            <div className="font-display text-lg tracking-wider text-gold">TAŞITSAN</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">
              {subtitle ?? "Parça Borsası"}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
