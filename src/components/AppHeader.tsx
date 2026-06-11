import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/tasitsan-official.png.asset.json";

export function AppHeader({ subtitle: _subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-center">
        <Link to="/" className="flex items-center tap-gold rounded-xl w-full justify-center" aria-label="Taşıtsan Parça Borsası">
          <img
            src={logoAsset.url}
            alt="Taşıtsan Parça Borsası"
            className="h-24 sm:h-32 md:h-40 w-auto max-w-full object-contain"
            loading="eager"
            decoding="async"
          />
        </Link>
      </div>
    </header>
  );
}
