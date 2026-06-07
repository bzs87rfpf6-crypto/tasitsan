import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/tasitsan-logo-new.png.asset.json";

export function AppHeader({ subtitle: _subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3 flex items-center justify-center">
        <Link to="/" className="flex items-center tap-gold rounded-xl">
          <img
            src={logoAsset.url}
            alt="Taşıtsan Parça Borsası"
            className="h-20 sm:h-24 w-auto object-contain"
            loading="eager"
            decoding="async"
          />
        </Link>
      </div>
    </header>
  );
}
