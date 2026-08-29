import { Link } from "@tanstack/react-router";
import { CORPORATE_LOGO_SRC } from "@/lib/corporate-logo";

const LINKS = [
  { to: "/hakkimizda", label: "Hakkımızda" },
  { to: "/iade-politikasi", label: "İade ve İptal Politikası" },
  { to: "/iletisim", label: "İletişim" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background/80 mt-8">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:pb-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Link to="/" className="shrink-0" aria-label="Taşıtsan Parça Borsası — Anasayfa">
          <img
            src={CORPORATE_LOGO_SRC}
            alt="Taşıtsan Parça Borsası"
            className="h-12 sm:h-14 w-auto object-contain"
            loading="lazy"
            decoding="async"
          />
        </Link>
        <nav aria-label="Alt menü" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-muted-foreground hover:text-gold">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Taşıtsan Parça Borsası
        </p>
      </div>
    </footer>
  );
}
