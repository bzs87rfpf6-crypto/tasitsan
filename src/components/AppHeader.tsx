import { Link } from "@tanstack/react-router";
import { CORPORATE_LOGO_SRC } from "@/lib/corporate-logo";
import { UserNotificationsBell } from "@/components/UserNotificationsBell";
import { CartButton } from "@/components/CartButton";

export function AppHeader({ subtitle: _subtitle }: { subtitle?: string }) {
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      // Reset home-page state (search, filters, view).
      localStorage.removeItem("ts:recentSearchesTmp");
    } catch { /* ignore */ }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
      // Hard navigation to fully re-mount the home page and reload data.
      window.location.href = "/";
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-1 sm:py-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
        {/* Left spacer keeps logo centered while right actions have fixed width */}
        <div aria-hidden="true" className="shrink-0 w-[72px] sm:w-[112px]" />
        <Link
          to="/"
          onClick={goHome}
          className="flex items-center tap-gold rounded-xl min-w-0 justify-center"
          aria-label="Taşıtsan Parça Borsası — Anasayfa"
        >
          <img
            src={CORPORATE_LOGO_SRC}
            alt="Taşıtsan Parça Borsası"
            className="h-28 sm:h-32 md:h-40 w-auto max-w-full object-contain"
            loading="eager"
            decoding="async"
          />
        </Link>
        <div className="shrink-0 flex items-center gap-2 sm:gap-3 justify-end">
          <div className="shrink-0"><CartButton /></div>
          <div className="shrink-0"><UserNotificationsBell /></div>
        </div>
      </div>
      <div className="w-full border-t border-gold/30 bg-gradient-to-r from-[#0a0a0a] via-[#14110e] to-[#0a0a0a] px-3 py-2 text-center text-xs sm:text-sm text-white/85">
        Orijinal parça aramak için <span className="font-bold text-gold">OEM No</span> yazınız.
      </div>
    </header>
  );
}
