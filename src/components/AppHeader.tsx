import { Link } from "@tanstack/react-router";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-gold-gradient grid place-items-center font-display text-xl text-gold-foreground shadow-gold">
            T
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg tracking-wider">TAŞITSAN</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">
              {subtitle ?? "Parça Borsası"}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
